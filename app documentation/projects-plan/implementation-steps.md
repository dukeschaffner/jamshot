# Projects — Implementation Steps

Small, testable increments in dependency order. Each step has a **done when** criterion you can verify manually or with a focused test before moving on.

Decisions: [decisions.md](./decisions.md) · Schema: [database.md](./database.md) · API: [api.md](./api.md)

---

## How to use this doc

- Steps are numbered sequentially — don't skip ahead unless noted as parallel-safe.
- **Done when** = minimum bar to merge / mark complete.
- Steps grouped into **milestones** map to shippable internal demos.
- Gate everything behind the `projects` feature flag until beta-ready (UI **and** API).

### Phasing

| Phase | Milestones | Goal |
|---|---|---|
| **1a** | 0–4, 5–11, 12–21, 22, **29–32** | Solo user: edit in browser, manual snapshot (create only), plugin loop |
| **1b** | 26–28 | Import, team/camp context, invites (REST-only; see [decisions.md](./decisions.md)) |
| **2** | 33–38 | Real-time collaboration |
| **Post-MVP** | 23–25, 39–41, 42+ | Snapshot auto/preview/restore, asset library, cleanup, polish |

Phase 1b invites are **view-only** for non-owners until Phase 2 ships, OR defer Step 28 until after Milestone 7 — pick one in [decisions.md](./decisions.md) before implementing invites.

---

## Milestone 0 — Foundation (no user-facing UI)

### Step 1 — Project config constants

Add a single config module (e.g. `packages/subscription-utils/src/projectConfig.js` or constants block in existing config) for values that aren't tier-specific:

| Constant | Default | Notes |
|---|---|---|
| `MAX_PROJECT_DURATION_SECONDS` | `300` | Fixed 5 min — not tier-configurable |
| `MAX_PROJECT_TRACKS` | `20` | Configurable in one place |
| `MAX_TEAM_CAMP_COLLABORATORS` | `25` | Cap for team/camp projects |
| `LOCK_TTL_SECONDS` | `60` | Track lock heartbeat TTL |
| `LOCK_HEARTBEAT_INTERVAL_SECONDS` | `15` | Client ping interval |
| `AUTO_SNAPSHOT_INTERVAL_SECONDS` | `300` | Auto snapshot interval |
| `SOFT_DELETE_CLIPS` | `true` | Required for snapshot restore |
| `ASSET_UNUSED_WARNING_DAYS` | `7` | Files panel badge before cleanup eligible |
| `ASSET_AUTO_DELETE_GRACE_DAYS` | `30` | Silent auto-delete grace (post-MVP job) |
| `PROCESSING_ASSET_GRACE_SECONDS` | `172800` | Keep pending/processing/failed assets 48h minimum |
| `INVITE_DEFAULT_EXPIRY_DAYS` | `7` | Default invite link expiry |

**Done when:** Constants exported from shared package; `copy-shared-folder.py` run; API and UI can import them.

---

### Step 2 — Subscription tier limits

Extend `packages/subscription-utils` `limits` for each user tier and team/camp plan:

```js
limits: {
  // existing...
  max_projects: 1,              // per context — see counting rules below
  max_project_members: 10,    // personal subscription projects
  max_snapshots: 10,
}
```

Track count uses global `MAX_PROJECT_TRACKS` (Step 1) — **not** a per-tier field unless product later adds tier differentiation.

**Counting rules:**

- Personal project: `WHERE owner_id = $userId AND team_id IS NULL AND camp_id IS NULL` (deleted projects do not count — add `deleted_at` on `projects` or hard-delete with cascade).
- Team project: `WHERE team_id = $teamId`
- Camp project: `WHERE camp_id = $campId`

Extend `TEAM_PLANS.limits` with `max_projects` / `max_snapshots`. Map camp `product_version` to project limits (mirror `checkCampUserLimit` pattern).

Team/camp plans get their own `max_projects` / `max_snapshots`. **Collaborator cap for team/camp projects** is computed at runtime:

```
effectiveMaxMembers = min(actualTeamOrCampMemberCount, MAX_TEAM_CAMP_COLLABORATORS)
```

**Done when:** Limits visible in plan objects; helper `getProjectLimits(context)` returns correct caps for user vs team vs camp.

---

### Step 3 — Feature flag

Add `projects` to feature flags (DB seed + admin UI if applicable).

- **UI:** flag off → no nav/routes.
- **API:** `isFeatureEnabled('projects')` on all `/projects/*` routes (mirror `subscriptions` pattern).

**Done when:** Flag off → no nav/routes and API returns 404. Flag on (admin) → routes reachable.

---

### Step 4 — Database migration

Implement tables from [database.md](./database.md):

- `projects` (+ optional `team_id`, `camp_id`; `CHECK (team_id IS NULL OR camp_id IS NULL)`)
- `project_members` (+ partial unique index: one `owner` per project)
- `project_tracks`
- `project_assets` (`storage_key` + `audio_url` as public R2 path)
- `project_clips` (`asset_id` FK, `deleted_at`; `ON DELETE RESTRICT` on `project_track_id`)
- `project_snapshots` (+ `snapshot_kind`: `manual` | `auto` | `pre_restore`)
- `project_snapshot_assets`
- `project_invites` (+ `expires_at` default, `revoked_at`, `accepted_at`)

See [assets.md](./assets.md). **Track delete:** never hard-delete `project_tracks` that have clip rows (including soft-deleted). See [database.md](./database.md) restore algorithm.

Add DDL to `api/db-updates.txt`. Update `app documentation/db-schema.txt`. Add `updated_at` triggers (match teams/camps pattern).

**Done when:** Migration runs on dev DB; `\d projects` shows expected columns; FK constraints work.

---

## Milestone 1 — API skeleton (Postman / curl testable)

### Step 5 — Project access utilities

Create `api/lambda/src/utils/projectAccess.js` and `api/lambda/src/utils/projectUtils.js` (canonical serializer):

- `checkProjectAccess(projectId, userId)` → role or 403
- `getProjectLimitsForContext(project, user)` → tier + team/camp caps
- `canAddMember(project, currentMemberCount, teamOrCampSize?)`
- `serializeProjectState(projectId)` → shared shape for GET, snapshots, plugin-payload

**Done when:** Unit tests or manual calls return correct role for owner / member / non-member.

---

### Step 6 — Create & list projects

Routes in `api/lambda/src/routes/projects.js`:

- `POST /projects` — name, optional `team_id` / `camp_id` (mutually exclusive); creates owner membership; enforces `max_projects`
  - Verify caller is team/camp member with active subscription when context set (mirror `validateTeamAccess` / `validateCampAccess`)
- `GET /projects` — projects where user is member; optional `?team_id=` / `?camp_id=` filter

**Done when:** Authenticated user creates project, sees it in list; second create blocked when at tier limit.

---

### Step 6b — Delete project & member lifecycle

- `DELETE /projects/:id` — owner only; cascade members, tracks, clips, assets (async R2 cleanup job for large projects)
- `POST /projects/:id/members` — add by user id (admin+); enforce cap
- `PATCH /projects/:id/members/:userId` — change role (cannot demote sole owner)
- `DELETE /projects/:id/members/:userId` — remove member; owner cannot remove self without transfer
- `POST /projects/:id/members/leave` — non-owner self-leave

**Done when:** Owner deletes project; member leaves; cap enforced on add.

---

### Step 7 — Get & update project metadata

- `GET /projects/:id` — metadata + nested tracks + clips (exclude soft-deleted clips); public R2 URLs via `projectUtils` (no signed URLs)
- `PATCH /projects/:id` — name, bpm, time_signature, metronome_offset, duration (cap at 300s)

Include `revision` on project row; increment on **all** mutating writes (see revision contract in [api.md](./api.md)).

**Done when:** GET returns full tree; PATCH updates bpm and bumps revision.

---

### Step 8 — Project tracks CRUD

- `POST /projects/:id/tracks` — enforce max 20 tracks
- `PATCH /projects/:id/tracks/:trackId` — name, sort_order, gain, mute, solo
- `DELETE /projects/:id/tracks/:trackId` — soft-delete all clips on track (`deleted_at`); **do not** hard-delete track row if any clip rows exist (including soft-deleted)

**Done when:** Can add 3 tracks, reorder, delete one; track count enforced at 20; deleting track soft-deletes its clips.

---

### Step 9 — Clip upload (multipart + shared audio-processing lambda)

Mirror social track upload pattern: **multipart to API** → temp R2 → **same `audio-processing` lambda** with a project branch.

1. `POST /projects/:id/tracks/:trackId/clips` — `multipart/form-data` (`uploadLimiter`, `getActiveUploadBan`; skip social quotas only)
2. Validate project access (editor+), track belongs to project, clip placement within 300s
3. **Transaction:** insert `project_assets` (`processing_status = 'pending'`, `storage_key`) **and** `project_clips` (placement); bump `last_referenced_at` and `projects.revision`; return `{ assetId, clipId, processing_status: 'pending' }`
4. Upload temp file to R2 (`temp/projects/{projectId}/{assetId}/...`)
5. Emit EventBridge `project_asset_created` (or invoke lambda directly in dev — mirror track dev monitor)
6. **Audio-processing lambda** — new code path when `asset_id` present (not `track_id`):
   - Set `processing_status = 'processing'` at start
   - Format conversion only (mono 44.1kHz WAV or web DAW target format)
   - **No** peak generation, **no** normalization, **no** `combined_audio_url`
   - Write final file to `projects/{projectId}/{assetId}/audio.wav`
   - **On success:** set `audio_url` = public R2 path; `processing_status = 'completed'`
   - **On failure:** set `processing_status = 'failed'`, `processing_error` (mirror track lambda error handling). Do not delete clip.

**Re-record / retry:** same endpoint with `clip_id` in body → new asset → update clip `asset_id`.

**Done when:** Upload mp3/wav → asset + clip rows created on POST → status `completed` after lambda → public URL playable in browser.

---

### Step 9b — Asset processing status

- `GET /projects/:id/assets/:assetId/processing-status` — mirror `GET /tracks/:id/processing-status` (status, ETA, sanitized error)

Include `processing_status` on clips in `GET /projects/:id` tree.

**Done when:** Client polls until `completed` or `failed`; failed clips show sanitized error with Record again / Delete actions; reload preserves failed state.

---

### Step 10 — Clip edit & soft delete

- `PATCH /projects/:id/clips/:clipId` — start_time, trim_start, trim_end, move to another track (`project_track_id`); require `revision`
- `DELETE /projects/:id/clips/:clipId` — set `deleted_at` (not hard delete)

Validate: clip end ≤ project duration; `asset.project_id` matches track's project; no overlapping clips on same track (server rejects overlap).

**Done when:** Move clip between tracks via API; delete sets `deleted_at`; GET excludes deleted unless snapshot restore.

---

### Step 11 — Plugin payload endpoint

- `GET /projects/:id/plugin-payload` — flat clip list with **public R2 URLs** (`${R2_PUBLIC_URL}/{storage_key}`), timeline layout, gains

Editors only (viewers get 403 — no audio URL leak).

**Done when:** JSON matches shape expected by `StemPlaybackEngine` adapter (see [plugin.md](./plugin.md)).

---

## Milestone 2 — Minimal web UI (no DAW yet)

### Step 12 — Projects nav + list page

- Desktop navbar: "Projects" link (feature flag)
- `/projects` — list cards, empty state, "Create project"

**Done when:** Flag on → nav visible; list shows Step 6 projects.

---

### Step 13 — Create project page/modal

- Name input; optional context if launched from team/camp dashboard later
- Redirect to `/projects/[id]` on success

**Done when:** Create flow works end-to-end from browser.

---

### Step 14 — Project page shell

`/projects/[projectId]`:

- Header: project name, member count placeholder
- Placeholder for DAW area
- Desktop-only gate (match collab DAW message)

**Done when:** Page loads project metadata from API; 403 for non-members (consistent policy — see [api.md](./api.md)).

---

## Milestone 3 — Project DAW (single user, REST persistence)

> **DAW refactor prerequisite:** introduce `dawMode: 'collab' | 'original' | 'project'` and `armedTrackId` in `DAWContext` before Steps 15–17. See [web-daw.md](./web-daw.md).

### Step 15 — DAW `project` mode — read-only load

- `DAWProvider mode="project"` + `TrackManager.loadProject(state)` 
- Load clips into tracks; **do not** init `UndoManager`
- Live Web Audio playback only

**Done when:** Open project page → hear existing clips; playhead/transport work; no undo buttons.

---

### Step 16 — Add / remove tracks in DAW

Wire UI to Step 8 API; refresh local state on success.

**Done when:** Add track button creates empty track row; delete removes track (soft-deletes clips).

---

### Step 17 — Record clip to armed track

- Any track can be "armed" for record (replaces global `recording-track` for project mode)
- Single clip per record action
- On stop: store in `bufferRegistry` → optimistic clip on timeline (local playback) → multipart upload via Step 9 → poll Step 9b
- Processing overlay on clip until `completed`; swap to server `audio_url` and release local buffer on success
- On failure: error UI on clip; local buffer kept for retry via `clip_id` re-upload
- `beforeunload` warning while upload/processing in flight

**Done when:** Record on track 2 → hear take immediately from local buffer → after processing, plays from server URL. Simulated lambda failure → error + retry without re-recording.

---

### Step 18 — Upload file to any track

Add audio to **any** track via click (empty tracks only) or drag-and-drop. Same upload pipeline as Step 17. Target track is the track the user interacted with — **arm state is not required** (arm is record-only; see Step 17). No separate **"Import audio"** control in track headers or toolbar for now.

Validate 300s max duration on upload (not collab 900s default). On file pick or drop, decode duration client-side first; if longer than the mode limit (`DAWConfig.audio.maxFileUploadDuration` for collab/original; `DAWConfig.audio.maxRecordingDuration` / 300s for projects), **do not import** — show a **toast** error instead of placing a clip.

**Empty track (no clips):**

- **Click** anywhere on the track row → native file picker (audio files only) → clip placed at playhead (or `0` if playhead is unset)
- **Drag** an audio file over the track → existing empty-track drop target styling → clip placed at drop X position on the timeline

**Track with existing clips:**

- **Drag** an audio file over the track only (click does not open file picker)
- While dragging over the track, show a **placeholder region** at the cursor position:
  - Dashed outline (distinct from real clips)
  - Width reflects file duration (clamped to project duration and non-overlap rules from Step 10)
  - Follows horizontal cursor position within the track timeline
- On drop → start upload at placeholder position; placeholder becomes the optimistic clip

Covers the host-DAW return path (e.g. export WAV from Logic, drag onto a non-empty track) without a dedicated import button.

**Done when:** Click on empty track opens picker and places clip; drag onto empty track works; drag onto non-empty track shows dashed placeholder while hovering and places clip on drop; file longer than max duration shows toast and is not imported; upload to track 3 while track 2 is armed → clip visible on track 3; processing failure shows same error/retry/delete UX as Step 17.

---

### Step 19 — Clip drag, trim, cross-track move

Extend `Region.js` for `mode === 'project'`:

- Drag within track + between tracks
- Trim handles
- Debounced `PATCH` to Step 10 on commit (via `useProjectPersistence`)

**Done when:** Drag clip to another track; trim; refresh page → layout persisted.

---

### Step 20 — Transport & project settings persistence

- BPM, time signature, metronome offset, duration (extend timeline)
- Reuse/adapt `ProjectEndOverlay` for duration up to 300s in project mode
- Looper enabled; **no** loop-mode restrictions on duration
- Snap to grid, count-in — same as collab DAW

**Done when:** Change BPM → save → reload preserves value; duration extendable up to 300s.

---

### Step 20b — `useProjectPersistence` hook

`ui/src/hooks/useProjectPersistence.js`:

- Debounced REST saves for clip/track/project mutations
- Tracks dirty fields for Step 21 conflict UX
- Single write path (REST in Phase 1; WS ops replace debounced PATCH in Phase 2 when connected)

**Done when:** All project edits flow through hook; dirty state accurate for 409 handling.

---

### Step 21 — Revision conflict handling

On `PATCH` 409 (`{ error, current_revision, server_revision }`):

- If user has no pending local edits → silent rebase (reload project state)
- If dirty local state → toast + prompt to reload or discard

**Done when:** Simulate revision mismatch (two tabs) → behavior matches rule.

---

## Milestone 4 — Manual snapshot (MVP)

> Steps 23–25 (auto snapshot, preview, restore) are **post-MVP** — see Milestone 8.

### Step 22 — Manual snapshot

- `POST /projects/:id/snapshots` — full state JSON in `project_snapshots.state`; `snapshot_kind = 'manual'`
- Populate `project_snapshot_assets` for every `asset_id` in serialized state
- Toolbar button + optional label
- List snapshots in UI (read-only list; no preview/restore until post-MVP)

**Done when:** Create snapshot → appears in list with timestamp; `project_snapshot_assets` rows match clip assets in state.

---

## Milestone 5 — Plugin (single user) — Phase 1a exit

> Moved before import/invites so Phase 1a exit criteria (browser → plugin → Logic) is reachable.

### Step 29 — Plugin `set_project` handler

- Restructure `PluginProcessor::handleIncomingMessage` to branch on `type` first (`set_track` vs `set_project`)
- Parse `set_project` WS message
- Fetch `plugin-payload` with auth token (or use inline payload)
- Map clips → `StemPlaybackEngine`; cache by `(project_id, clip_id)`

**Done when:** Web "Open in Plugin" → audio plays in DAW host following host transport.

---

### Step 30 — Manual `project_sync`

- Web sends `project_sync` after edits when auto-sync off
- Plugin replaces clip metadata + re-downloads changed audio (by `clipId`, not `stem_metadata_sync` merge)

**Done when:** Edit clip gain/position in web → manual sync → plugin reflects change.

---

### Step 31 — Auto-sync (default on)

- When plugin connected, debounced auto `project_sync` after REST saves
- Toggle in project toolbar (default **on** per [decisions.md](./decisions.md))
- After Milestone 7: also forward `project_sync` when local session receives WS ops

**Done when:** Edit in web → plugin updates within debounce window without button click.

---

### Step 32 — Last project persistence (plugin local)

Store `last_project_id` in `PluginState`; offer reopen on plugin launch.

**Done when:** Close DAW host → reopen → prompt or auto-offer last project.

---

## Milestone 6 — Import & team/camp context (Phase 1b)

### Step 26 — Import from Sterio track

- `POST /projects/:id/import-track` — body: `{ track_id }` (leaf collab track with valid `mix_gains`)
- `checkTrackAccess(track_id, userId)` before copy
- Only stems with `processing_status = 'completed'`
- Server-side R2 `CopyObject` into `project_assets` (no live link)
- Map: one `project_track` per stem (ordered by `mix_gains.stems[].order`); clip per stem with regions from stem metadata; copy BPM/time_signature to project if unset
- Enforce 20 tracks / 300s; bump `revision`

**Done when:** Import collab track → project opens with equivalent layout.

---

### Step 27 — Create project from team/camp

- Entry point on team/camp dashboard: "New project"
- Sets `team_id` or `camp_id` on project
- Enforce `min(memberCount, MAX_TEAM_CAMP_COLLABORATORS)` on invites
- Document team/camp delete policy: projects `ON DELETE SET NULL` → become personal orphans owned by `owner_id`

**Done when:** Team with 10 members → project allows max 10 collaborators; team with 50 → capped at 25.

---

### Step 28 — Invites & members UI + REST

API (if not done in 6b):

- `POST /projects/:id/invites` — invite link; default `expires_at`; `revoked_at` support
- `POST /projects/invites/:token/accept` — rate-limited; enforce cap; block non-team users on team projects if team is private
- `GET /projects/:id/members`
- `GET /projects/invites/:token` — validate token (for accept landing page)

UI:

- `/projects/invite/[token]` accept page
- `ProjectMembersPanel` — invite modal, role picker, remove member
- **Until Phase 2:** invited editors see warning *"Real-time sync not enabled — avoid simultaneous edits"* OR restrict to viewer role

**Done when:** User B accepts invite → sees project; member count enforced.

---

## Milestone 7 — Real-time collaboration (Phase 2)

### Step 33 — API Gateway WebSocket infra + Neon realtime tables

New deploy path (extend `infrastructure/cdk` **or** dedicated workflow — API Lambda today deploys via GitHub Actions, not CDK).

CDK/workflow: WS API, connect/disconnect/default routes, Lambda handlers, IAM for `execute-api:ManageConnections`.

**WS auth:** JWT or session token on `$connect` query string; validate on `join` via `projectAccess.js`.

Neon migration (see [database.md](./database.md)):

- `project_ws_connections`
- `project_track_locks`

**Done when:** Authenticated test client connects; connection row appears in `project_ws_connections`.

---

### Step 34 — Join project room + minimal presence

Messages: `join`, `presence` → `{ userId, username, editingTrackId? }`

Viewers may join room (receive ops) but cannot send ops.

**Done when:** Two browser tabs → each sees "User B is in project".

---

### Step 35 — Track lock acquire / release / heartbeat

- Auto-lock when user starts editing a track
- `lock_acquire`, `lock_release`, heartbeat renews TTL
- **Cross-track moves:** acquire source on mousedown; acquire destination on debounced hover; release both on drop/cancel
- **Same locks enforced on REST** mutating routes (not WS-only)
- Disconnect: 30–45s grace before lock release if same user reconnects (see [realtime-sync.md](./realtime-sync.md))

**Done when:** Tab A locks track 1 → Tab B cannot edit track 1 until released.

---

### Step 36 — Broadcast ops

Replace debounced REST saves for active edits with WS `op` messages; persist to Postgres; fan-out to room.

Ops: `clip.move`, `clip.trim`, `clip.move_to_track`, `clip.delete`, `track.create`, `track.delete`, `track.update`, `track.reorder`, `project.transport`, `asset.processing_update` (server push)

Each op: `opId`, `baseRevision`; server ACK/NACK. `track.reorder` and `project.transport` require **project metadata lock** (short TTL).

**Done when:** Tab A moves clip → Tab B sees move within ~1s.

---

### Step 37 — `ProjectSyncContext` in web UI

Wire DAW edits → WS ops; remote ops → `TrackManager` via event bus.

When WS connected: `useProjectPersistence` sends ops not REST PATCH.

**Done when:** Full edit loop works without REST polling for collab edits (REST still used for initial load + reconnect + uploads).

---

### Step 38 — Reconnect & full resync

On disconnect: rejoin with last `revision`; if `clientRevision < serverRevision - 1`, server sends full `state` + current `locks`.

**Done when:** Kill WS → reconnect → project state consistent.

---

## Milestone 8 — Snapshots (post-MVP)

### Step 23 — Auto snapshot interval

**Server-side** timer (mutation hook or lightweight scheduled job — not client-only). Respect tier `max_snapshots` (prune oldest `auto` snapshots; never prune `pre_restore`).

Pruning deletes snapshot row; `project_snapshot_assets` cascades.

**Done when:** Wait interval → new snapshot created; exceeding tier limit drops oldest auto snapshot.

---

### Step 24 — Snapshot preview

- Load snapshot state into **read-only** DAW view (or toggle "preview mode")
- Audition playback without mutating live project
- Re-resolve `audio_url` from `asset_id` at preview time (do not trust stale URLs in JSON)

**Done when:** Select snapshot → hear that version; exit preview → live project unchanged.

---

### Step 25 — Restore snapshot

- `POST /projects/:id/snapshots/:id/restore`
- Auto-create pre-restore snapshot (`snapshot_kind = 'pre_restore'`)
- **Canonical restore algorithm** ([database.md](./database.md)):
  1. Upsert project metadata from snapshot JSON
  2. For each snapshot track: upsert `project_tracks` by id
  3. For each snapshot clip: `UPDATE project_clips SET deleted_at = NULL, ...` if row exists; else `INSERT`
  4. Soft-delete clips on live project **not** in snapshot
  5. Bump `revision`; reject if concurrent editor holds locks (Phase 2)

**Done when:** Delete clip → restore old snapshot → clip back on timeline; tracks absent from snapshot are soft-deleted.

---

## Milestone 9 — Asset library & cleanup (post-MVP)

### Step 39 — Assets list API

- `GET /projects/:id/assets` — all assets with status: live, soft-deleted clip, snapshot-only, unused
- `DELETE /projects/:id/assets/:assetId` — soft-delete asset + soft-delete all referencing clips; confirm if snapshot-referenced
- `POST /projects/:id/assets/:assetId/clips` — place library asset on timeline

**Done when:** API returns correct usage metadata; cannot delete snapshot-only asset without confirm flag.

---

### Step 40 — Files panel UI

- Project page sidebar: list assets, filters, drag to timeline, manual delete with snapshot warning

**Done when:** Upload clip, remove from timeline, still visible in Files; drag back without re-upload.

---

### Step 41 — Auto-cleanup Lambda

- Nightly job per [assets.md](./assets.md); dry-run mode; includes `failed` after grace

**Done when:** Dry-run lists only truly unreferenced assets.

---

## Milestone 10 — Post-MVP polish (defer)

| Step | Feature |
|---|---|
| 42 | Publish project mixdown to public feed |
| 43 | Plugin zoomed-out timeline view |
| 44 | DAW ↔ web playhead sync |
| 45 | Live cursors / richer presence |

---

## Suggested PR slicing

| PR batch | Steps | Theme |
|---|---|---|
| 1 | 1–4 | Config + flag + DB |
| 2 | 5–8, 6b | Project + track API + lifecycle |
| 3 | 9–11, 9b | Clips + processing + plugin payload |
| 4 | 12–14 | List/create/shell UI |
| 5 | 15–21, 20b | Project DAW core + persistence |
| 6 | 22 | Manual snapshot (create + list) |
| 7 | 29–32 | Plugin (Phase 1a exit) |
| 8 | 26–28 | Import + team/camp + invites (Phase 1b) |
| 9 | 33–38 | Realtime |
| 10 | 23–25 | Snapshot auto/preview/restore (post-MVP) |
| 11 | 39–41 | Asset library + cleanup |

---

## Test checklist

### Phase 1a demo script

1. Create personal project (free tier limit enforced)
2. Add tracks, record clip, upload clip (click empty track or drag onto any track)
2b. Simulate processing failure → failed clip UI → retry with local buffer (no re-record) → delete failed clip
3. Move clip between tracks, trim, set BPM
4. Create manual snapshot; verify it appears in list
5. Open in plugin; verify playback in host DAW
6. Edit in web; verify auto-sync to plugin
7. Delete project; verify cleanup

### Phase 1b

8. Import existing Sterio track into new project
9. Create team project; invite member up to `min(teamSize, 25)`

### Phase 2

10. Two users edit different tracks simultaneously
11. Same track lock blocks second editor

### Post-MVP

12. Auto snapshot created on interval; tier limit prunes oldest auto snapshot
13. Preview snapshot in read-only DAW; restore snapshot → deleted clip returns
14. Remove clip from timeline → asset still in Files panel
15. Auto-cleanup dry-run does not list snapshot-referenced assets

### Automation (recommended)

Node/curl smoke script for items 1–3 + plugin-payload shape validation; run in CI when `projects` routes change.

---

## Parallel-safe work

Once Step 4 lands:

- **Plugin handler spike** (Step 29 message routing) can start after Step 11
- **UI shell** (Steps 12–14) can start after Step 7
- **WS infra spike** (Step 33) can start anytime before Milestone 7 — but freeze protocol in [realtime-sync.md](./realtime-sync.md) first

**Not parallel-safe:** DAW Steps 15–21 before `armedTrackId` refactor; invites (Step 28) before Phase 2 policy is decided.
