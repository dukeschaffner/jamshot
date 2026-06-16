# Projects — REST API

> **Status:** Aligned with [decisions.md](./decisions.md). Step-by-step routes: [implementation-steps.md](./implementation-steps.md).

Base path: `/api/projects` (consistent with `/tracks`, `/teams`, `/camps`).

Auth: existing `betterAuthMiddleware` / `optionalBetterAuthMiddleware` patterns from `api/lambda/src/routes/`.

**Feature flag:** all routes check `isFeatureEnabled('projects')` — return 404 when off (mirror `subscriptions` pattern).

**Online only** — no offline editing or CRDT merge. Clients must be connected for collaborative edits (Phase 2 uses WebSocket; Phase 1 uses REST).

**Non-member access:** return **403** for unknown/non-member on `GET /projects/:id` (do not leak existence via 404).

---

## Limits & enforcement

Shared constants from `packages/subscription-utils` project config (Step 1):

| Limit | Source | Enforced on |
|---|---|---|
| 300s max duration | `MAX_PROJECT_DURATION_SECONDS` | `PATCH /projects/:id`, clip placement |
| 20 max tracks | `MAX_PROJECT_TRACKS` | `POST .../tracks` |
| Personal member cap | tier `max_project_members` | invite accept, member add |
| Team/camp member cap | `min(teamOrCampSize, MAX_TEAM_CAMP_COLLABORATORS)` | invite accept, member add |
| `max_projects` | tier limits (per context — see Step 2) | `POST /projects` |
| `max_snapshots` | tier limits | auto snapshot create (prune oldest `auto` only) |

**Project clip uploads do not count** toward social track daily/total upload quotas — skip `checkDailyUploadQuota` / `checkTotalUploadQuota` on clip upload routes.

**Still apply:** `uploadLimiter`, `getActiveUploadBan`, `contentCreationLimiter` where appropriate.

Helpers (`projectAccess.js`, `projectUtils.js`, Step 5):

- `checkProjectAccess(projectId, userId)` → role or 403
- `getProjectLimitsForContext(project, user)` → tier + team/camp caps
- `canAddMember(project, currentMemberCount, teamOrCampSize?)` → boolean + reason
- `serializeProjectState(projectId)` → canonical shape for GET, snapshots, plugin-payload

Member cap exceeded → **403** with clear message (e.g. `"Project member limit reached (10/10)"`).

---

## Revision contract

All mutating routes require `revision` in request body (or `X-Project-Revision` header — pick one at implement time).

| Behavior | Detail |
|---|---|
| Success | Response includes new `revision` |
| Mismatch | **409** `{ error: 'REVISION_MISMATCH', current_revision, your_revision }` |
| Increments | Every PATCH/POST/DELETE on project, tracks, clips; clip upload complete; import; snapshot restore |

Client UX (Step 21): silent rebase when clean; prompt when dirty.

Phase 2: WS ops use `baseRevision` + `opId`; server ACK/NACK — see [realtime-sync.md](./realtime-sync.md).

---

## Audio URLs

**Do not use signed URLs.** Store R2 object keys in `project_assets.storage_key`; return public URLs:

```text
${process.env.R2_PUBLIC_URL}/${storage_key}
```

Same pattern as social tracks (`trackUtils.generateSignedUrl` — public R2 path, not presigned).

Snapshot JSON stores `assetId` only; resolve `audio_url` at read/preview time from `project_assets`.

---

## Projects

| Method | Route | Description |
|---|---|---|
| `POST` | `/projects` | Create project; optional `team_id` **or** `camp_id` (not both); enforces `max_projects`; verify team/camp membership + active subscription |
| `GET` | `/projects` | List projects where current user is a member; `?team_id=` / `?camp_id=` optional |
| `GET` | `/projects/:id` | Metadata + full state (tracks, clips; exclude soft-deleted clips) |
| `PATCH` | `/projects/:id` | Update name, bpm, time_signature, metronome_offset, duration (≤300s) |
| `DELETE` | `/projects/:id` | Delete project (owner only); cascade + async R2 cleanup |

---

## Members & invites

| Method | Route | Description |
|---|---|---|
| `GET` | `/projects/:id/members` | List members |
| `POST` | `/projects/:id/members` | Add member (by user id); admin+ |
| `PATCH` | `/projects/:id/members/:userId` | Change role |
| `DELETE` | `/projects/:id/members/:userId` | Remove member |
| `POST` | `/projects/:id/members/leave` | Self-leave (non-owner) |
| `POST` | `/projects/:id/invites` | Create invite link; default `expires_at` = 7 days |
| `GET` | `/projects/invites/:token` | Validate token (for accept landing page) |
| `POST` | `/projects/invites/:token/accept` | Accept invite; enforce member cap; rate-limited |

Reuse patterns from `api/lambda/src/routes/teams.js` and `camps.js` where applicable.

**Team projects:** optionally block accept if user is not a team member (when team is private).

---

## Tracks (project timeline tracks)

| Method | Route | Description |
|---|---|---|
| `POST` | `/projects/:id/tracks` | Add track; enforce max 20 |
| `PATCH` | `/projects/:id/tracks/:trackId` | Rename, reorder, gain, mute, solo |
| `DELETE` | `/projects/:id/tracks/:trackId` | Soft-delete all clips (`deleted_at`); do not hard-delete track row if clip rows exist |

---

## Clips (regions / audio on timeline)

| Method | Route | Description |
|---|---|---|
| `POST` | `/projects/:id/tracks/:trackId/clips` | Multipart upload → create asset + clip |
| `PATCH` | `/projects/:id/clips/:clipId` | Move, trim, move to another track |
| `DELETE` | `/projects/:id/clips/:clipId` | Soft delete — set `deleted_at` |
| `GET` | `/projects/:id/assets/:assetId/processing-status` | Poll processing (mirror tracks) |

### Upload flow (shared audio-processing lambda)

Mirror social track pipeline structure; **project branch** in same lambda.

**Clip row timing:** create `project_assets` **and** `project_clips` in one transaction on successful `POST` (before lambda runs). Return `{ assetId, clipId, processing_status: 'pending' }`. Client places an optimistic timeline clip immediately; see [web-daw.md](./web-daw.md) for local-buffer playback.

1. Client `POST` multipart audio to API (`uploadLimiter`, `getActiveUploadBan`).
2. **Transaction:** insert `project_assets` (`processing_status = 'pending'`, `storage_key`) + `project_clips` (placement fields from request). Bump `projects.revision` and `last_referenced_at`.
3. Write temp file to R2: `temp/projects/{projectId}/{assetId}/...`
4. Emit EventBridge `project_asset_created` with `{ asset_id, s3_key, project_id }` (dev: local monitor — mirror tracks).
5. **Audio-processing lambda** — when `asset_id` in event (not `track_id`):
   - Set `processing_status = 'processing'` at start
   - Format conversion only (e.g. mono 44.1kHz WAV)
   - **No** peaks, **no** normalization, **no** `combined_audio_url`
   - Output: `projects/{projectId}/{assetId}/audio.wav`
   - **On success:** update `audio_url`, `duration_seconds`, `processing_status = 'completed'`
   - **On failure:** set `processing_status = 'failed'`, `processing_error` (raw; sanitize on read). **Do not** delete clip or roll back revision.
6. Phase 2: broadcast `asset.processing_update` to project room (see [realtime-sync.md](./realtime-sync.md)).

**Request body (multipart fields):** `file`, `start_time_seconds`, `trim_start_seconds`, `trim_end_seconds` (optional), `clip_id` (re-record / retry).

**Single clip per record action** — no take lanes.

**Re-record / retry:** same endpoint with `clip_id` → new `project_assets` row → update clip `asset_id`. Old asset retained if snapshots reference it. Client may reuse in-memory `bufferRegistry` blob for retry without re-recording.

### Processing status

`GET /projects/:id/assets/:assetId/processing-status` — mirror `GET /tracks/:id/status`:

```json
{ "asset_id": 42, "status": "pending|processing|completed|failed", "error": "...", "estimated_time_remaining": 120 }
```

- Sanitize `error` with existing `sanitizeErrorForClient` (same as tracks).
- Include nested `processing_status` (and sanitized `processing_error` when `failed`) on clips in `GET /projects/:id`.
- **Plugin payload:** only clips with `processing_status = 'completed'`.

See [assets.md](./assets.md).

---

## Assets (project library)

| Method | Route | Description |
|---|---|---|
| `GET` | `/projects/:id/assets` | List assets with usage metadata (post-MVP UI) |
| `POST` | `/projects/:id/assets` | Upload to library without timeline placement (post-MVP) |
| `DELETE` | `/projects/:id/assets/:assetId` | Soft-delete asset + referencing clips; confirm if snapshot-referenced |
| `POST` | `/projects/:id/assets/:assetId/clips` | Place asset on timeline |

`GET .../plugin-payload` bumps `last_referenced_at` for included assets.

---

## Import

| Method | Route | Description |
|---|---|---|
| `POST` | `/projects/:id/import-track` | Body: `{ track_id }` — copy stem chain into project |

Requirements:

- `checkTrackAccess(track_id, userId)` before copy
- Only `processing_status = 'completed'` stems
- Pass **leaf** collab track id (has valid `mix_gains.stems`)
- Server-side R2 `CopyObject` → `project_assets` (no live link to social tracks)
- Map stems → tracks + clips with regions/gains from `mix_gains`; copy BPM/time sig if project unset
- Enforce 20 tracks / 300s; bump `revision`
- Editor+ only

Uses `getStemChain` for metadata; copies audio into new assets.

---

## Snapshots

| Method | Route | Description |
|---|---|---|
| `GET` | `/projects/:id/snapshots` | List snapshots |
| `POST` | `/projects/:id/snapshots` | Create manual snapshot |
| `GET` | `/projects/:id/snapshots/:snapshotId` | Get snapshot state |
| `POST` | `/projects/:id/snapshots/:snapshotId/restore` | Restore; auto pre-restore snapshot |

**Auto snapshots:** server-side interval from `AUTO_SNAPSHOT_INTERVAL_SECONDS`; prune oldest `auto` when over `max_snapshots`.

**On create:** populate `project_snapshot_assets` from all `asset_id`s in serialized state.

**Restore:** canonical algorithm in [database.md](./database.md); bump `revision`. Phase 2: broadcast `state` to WS room.

See [snapshots.md](./snapshots.md).

---

## Plugin-facing

| Method | Route | Description |
|---|---|---|
| `GET` | `/projects/:id/plugin-payload` | Public R2 URLs + clip layout for plugin |

Returns flat clip list with `assetId`, timeline positions, gains, and public R2 URLs — optimized for `StemPlaybackEngine` adapter and asset-keyed plugin cache (see [plugin.md](./plugin.md)).

**Editors only** — viewers receive 403.

Same serializer as `GET /projects/:id` (via `projectUtils.js`).

---

## Real-time (not REST)

Live collaborative edits → WebSocket sync service — see [realtime-sync.md](./realtime-sync.md).

REST remains source of truth for:

- Initial page load
- Reconnect / full resync
- Snapshot restore
- Plugin payload fetch
- Uploads / import
- Phase 1 single-user persistence (when WS disconnected)

**Phase 2:** mutating REST routes enforce same lock rules as WS ops.

---

## Permissions matrix

| Action | owner | admin | editor | viewer |
|---|---|---|---|---|
| View project | ✓ | ✓ | ✓ | ✓ |
| Edit timeline | ✓ | ✓ | ✓ | ✗ |
| `plugin-payload` (audio URLs) | ✓ | ✓ | ✓ | ✗ |
| Manage members | ✓ | ✓ | ✗ | ✗ |
| Delete project | ✓ | ✗ | ✗ | ✗ |
| Create/restore snapshot | ✓ | ✓ | ✓ | ✗ |

---

## New files (estimate)

```
api/lambda/src/routes/projects.js
api/lambda/src/utils/projectUtils.js   -- state serialization, snapshot asset indexing, public URLs
api/lambda/src/utils/projectAccess.js  -- access checks, member caps
```

Register in main Lambda router alongside existing routes.

Extend `functions/lambda/audio-processing/` with `processProjectAsset(assetId)` branch.
