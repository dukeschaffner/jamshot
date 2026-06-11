The purpose of this file is to keep a record of assumptions, decisions, or any other important details that are learned as coding agents implement the project feature. This file will be referenced by future coding agents that are working on the feature to help get them up to speed.

---

## Progress (Milestone 0)

| Step | Status | Notes |
|------|--------|-------|
| 1 — Project config constants | **Done (code)** | |
| 2 — Subscription tier limits | **Done (code)** | |
| 3 — Feature flag | **Done (code)** | DB seed written; apply manually |
| 4 — Database migration | **Done (DDL)** | Apply `api/db-updates.txt` on dev DB |
| 5 — Project access utilities | **Done (code)** | `projectAccess.js`, `projectUtils.js` |
| 6 — Create & list projects | **Done (code)** | `POST /`, `GET /` in `projects.js` |
| 7 — Get & update project metadata | **Done (code)** | `GET /:id`, `PATCH /:id` with revision contract |
| 8 — Project tracks CRUD | **Done (code)** | `POST/PATCH/DELETE /:id/tracks/:trackId` |
| 9 — Clip upload | **Done (code)** | Multipart clip upload + audio-processing lambda branch |
| 9b — Asset processing status | **Done (code)** | `GET .../assets/:assetId/processing-status`; clips include `processingStatus` on GET |
| 10 — Clip edit & soft delete | **Done (code)** | `PATCH/DELETE /:id/clips/:clipId` with overlap + duration validation |
| 11 — Plugin payload | **Done (code)** | `GET /:id/plugin-payload`; editor+ only; flat completed clips |
| 12 — Projects nav + list page | **Done (code)** | Nav already gated; `/projects` fetches list, cards, empty state, Create Project → `/projects/create` |
| 13 — Create project page | **Done (code)** | `/projects/create`; optional `?team_id=` / `?camp_id=`; redirect to `/projects/{guid}` |
| 14 — Project page shell | **Done (code)** | `/projects/[projectId]`; header + DAW placeholder; desktop-only gate; 403 for non-members |
| 15 — DAW project mode read-only load | **Done (code)** | `ProjectDAW`, `TrackManager.loadProject`, no undo/recording; clips play via Web Audio |
| 16 — Add / remove tracks in DAW | **Done (code)** | `projectApi` track routes; `TrackManager.applyProjectState`; Add track + delete in project DAW |
| 17 — Record clip to armed track | **Done (code)** | Armed track record → optimistic clip → multipart upload → poll → server audio swap; failure retry/delete |
| 18 — Upload file to any track | **Done (code)** | Click/drag import on any track; 300s max; dashed drop placeholder on non-empty tracks; same upload pipeline as Step 17 |
| 6b+ | Not started | |

---

## Shared config & limits (`@sterio/subscription-utils`)

**Do not use `copy-shared-folder.py`** — it was removed. API and UI both import from the workspace package:

```js
import { MAX_PROJECT_TRACKS, getProjectLimits } from '@sterio/subscription-utils';
```

| File | Purpose |
|------|---------|
| `packages/subscription-utils/src/projectConfig.js` | Global non-tier constants (duration, track cap, lock TTL, asset grace, etc.) |
| `packages/subscription-utils/src/projectLimits.js` | `getProjectLimits`, `getEffectiveMaxMembers`, `getCampProjectLimits` |
| `packages/subscription-utils/src/index.js` | Re-exports constants + helpers |

### Tier limits (as implemented)

All personal tiers (free/basic/premium) currently share the same project limits from the plan example:

- `max_projects: 1`
- `max_project_members: 10`
- `max_snapshots: 10`

All team plans: `max_projects: 1`, `max_snapshots: 10` (enterprise: `-1` for both).

Track count is **not** per-tier — use `MAX_PROJECT_TRACKS` from `projectConfig.js`.

### `getProjectLimits(context)` usage

```js
// Personal
getProjectLimits({ type: 'personal', user })

// Team / camp (camp uses same product_version keys as TEAM_PLANS)
getProjectLimits({ type: 'team', productVersion: '25_users', memberCount: 30 })
// → effective_max_members: min(30, MAX_TEAM_CAMP_COLLABORATORS) = 25
```

Step 5 should wire `getProjectLimitsForContext(project, user)` in API utils — can delegate to `getProjectLimits` with the right context shape.

### Project counting (not yet enforced — Step 6)

- Personal: `owner_id = $userId AND team_id IS NULL AND camp_id IS NULL`
- Team: `team_id = $teamId`
- Camp: `camp_id = $campId`

**Gap:** Step 2 notes say deleted projects should not count toward `max_projects`, but Step 4 schema has **no `projects.deleted_at`**. Either add column later or hard-delete with cascade. Do not enforce counting until this is resolved.

---

## Feature flag (`projects`)

| Item | Detail |
|------|--------|
| DB seed | `api/db-updates.txt` (INSERT, default `false`) + `api/migrations/history/projects-feature-flag.txt` |
| Enable locally | `UPDATE feature_flags SET flag_value = true WHERE flag_key = 'projects';` |
| Admin UI | **None** — same as other flags; toggle via SQL |
| API behavior | **404** when off (not 403 like analytics/subscriptions) — see `requireProjectsFeature` |
| UI behavior | Nav links hidden when off; `/projects` calls `notFound()` |

### Files

- `api/lambda/src/middleware/projectsFeatureMiddleware.js` — `requireProjectsFeature`
- `api/lambda/src/routes/projects.js` — stub `GET /` → `{ projects: [] }`; all routes use middleware
- `api/lambda/src/express-api.js` — mounted at `/api/projects`
- `ui/src/components/Navbar.js` — desktop "Projects" link (authenticated + flag on)
- `ui/src/components/MoreDropdown.js` — mobile/desktop more menu link
- `ui/src/app/(frontend)/projects/page.js` — placeholder list page

Flag cache TTL is 5 minutes (`api/lambda/src/utils/featureFlags.js`) — restart lambda or wait after DB toggle.

---

## Database (Step 4)

DDL lives in `api/db-updates.txt` under **Migration: Projects schema (2026-06-10)**. Canonical reference copy in `app documentation/db-schema.txt` (bottom).

### Tables created

`projects`, `project_members`, `project_tracks`, `project_assets`, `project_clips`, `project_snapshots`, `project_snapshot_assets`, `project_invites`

### Not in this migration (later steps)

- `project_ws_connections`, `project_track_locks` — **Step 33** (Phase 2 realtime)
- No FK to social `tracks` — import is copy-only

### Implementation choices

- Migration uses `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` for safer re-runs
- Triggers use `DROP TRIGGER IF EXISTS` before create (idempotent)
- `project_clips.project_track_id` and `asset_id` are `ON DELETE RESTRICT` — never hard-delete tracks with clip history (see `database.md` restore algorithm)
- `project_invites.expires_at` defaults to 7 days in DB; app constant `INVITE_DEFAULT_EXPIRY_DAYS` should stay in sync

### Verify after apply

```sql
\d projects
\d project_clips
```

---

## Conventions for next steps

1. **All new `/api/projects/*` routes** — apply `requireProjectsFeature` (already on router via `router.use` in `projects.js`; keep it there).
2. **Access checks** — non-members get **403** on `GET /projects/:id` (do not leak existence via 404); see `api.md`.
3. **Audio URLs** — public R2 paths from `storage_key`; no signed URLs for project assets.
4. **Clip uploads** — skip social upload quotas; still use `uploadLimiter` / upload ban checks.
5. **Revision** — mutating routes will require `revision` (Step 7+); plan for conflict handling in `projectUtils.js`.
6. **DAW project work** — follow the layered DAW design in **DAW architecture (required)** below. Do not add project API calls, revision sync, or role gating back into `DAWContext.js`.

---

## DAW architecture (required)

All project-related DAW work **must** follow this split. Do not fork a parallel “Project DAW” component tree — reuse the shared editor UI and audio core.

### Layer responsibilities

| Layer | Location | Owns |
|-------|----------|------|
| **Shared DAW runtime** | `ui/src/components/DAW/DAWContext.js` | Playback, recording (collab), undo, selection, transport, zoom, event bus wiring. Accepts `mode="project"` + `projectData` only for **one-time init** (load tracks into `TrackManager`). Exposes `syncTracksFromManager()` as a thin bridge after local track-map changes. |
| **Project orchestration** | `ui/src/components/DAW/project/ProjectEditorContext.js` | Role gating (`canEdit`), `projectApi` mutations, server ↔ local sync (`applyProjectServerState`), armed track, mutation pending state, revision-driven page updates via `onProjectStateChange`. |
| **Project load helpers** | `ui/src/components/DAW/project/projectLoader.js` | Transport settings extraction, `loadProjectIntoTrackManager`, mixer state emit on init. |
| **In-memory track model** | `ui/src/components/DAW/core/TrackManager.js` | `loadProject`, `applyProjectState`, `addEmptyProjectTrack` — how project tracks/clips exist in memory, not React/API concerns. |

### Provider composition (project pages)

```
ProjectDAW
  └── DAWProvider (mode="project", projectData)     ← init + shared runtime
        └── ProjectEditorProvider (projectData, onProjectStateChange)   ← API + sync
              └── DAWWrapper / DAWContent
```

Collab/original flows use `DAWProvider` only — no `ProjectEditorProvider`.

### Rules for new project DAW features

When implementing upcoming steps (clip edit sync, record-to-track, mute/solo persistence, processing polling, revision conflicts, etc.):

1. **Add orchestration in `ProjectEditorContext.js`** — new API methods, `applyProjectServerState` callers, editor-only flags. Extend `useProjectEditor()` surface; keep safe no-op defaults for collab mode.
2. **Add load/sync logic in `TrackManager.js`** when the change is “how tracks/regions live in memory” (e.g. applying a full clip layout from server state).
3. **Use `projectLoader.js`** for init-only helpers — not for per-mutation API code.
4. **UI components** — consume project capabilities via `useProjectEditor()` (`isActive`, `canEdit`, `addProjectTrack`, …). Use `useDAW()` only for shared runtime (`dawMode`, transport, tracks, selection). Avoid new `dawMode === 'project'` branches when a project-editor hook value exists.
5. **Do not** put `projectApi` calls, revision handling, or `canEditProject` logic in `DAWContext.js`.
6. **Do not** duplicate `Track`, `Region`, `TransportControls`, etc. for projects.

### Constants

Editor roles: `ui/src/components/DAW/project/projectEditorConstants.js` (`hasProjectEditorRole`).

---

## Step 5 — Access & serialization utils

| File | Exports |
|------|---------|
| `api/lambda/src/utils/projectAccess.js` | `checkProjectAccess`, `getProjectLimitsForContext`, `canAddMember`, `hasMinimumProjectRole`, `ROLE_RANK` |
| `api/lambda/src/utils/projectUtils.js` | `serializeProjectState`, `getProjectAssetPublicUrl`, `collectSnapshotAssetIds` |

### `checkProjectAccess(projectId, userId)`

- Joins `projects` + `project_members`; returns `{ hasAccess, role, project }` or `{ hasAccess: false, status: 403 }`.
- Unknown project **and** non-member both return **403** (no existence leak).
- Unauthenticated → **401**.

### `getProjectLimitsForContext(project, user)`

Delegates to `getProjectLimits` from `@sterio/subscription-utils`:

- Personal: `{ type: 'personal', user }`
- Team/camp: queries `product_version` + member count, then `{ type: 'team'|'camp', productVersion, memberCount }`

### `canAddMember(project, user, currentMemberCount, teamOrCampSize?)`

- Compares `currentMemberCount` to `limits.effective_max_members`.
- Optional `teamOrCampSize` avoids re-querying team/camp size when caller already has it.
- Returns `{ allowed: true }` or `{ allowed: false, reason: 'Project member limit reached (N/M)' }`.

### `serializeProjectState(projectId, { variant })`

| `variant` | Use case | Shape |
|-----------|----------|-------|
| `'rest'` (default) | `GET /projects/:id` | Project metadata + nested tracks/clips; public R2 URLs on completed clips; `processingStatus` on clips |
| `'snapshot'` | `project_snapshots.state` | Timeline only; clips reference `assetId` (no URLs) |
| `'plugin'` | `GET .../plugin-payload` | Flat `clips[]` with completed audio only |

Audio URLs: `${R2_PUBLIC_URL}/${storage_key}` via `getProjectAssetPublicUrl`. Soft-deleted clips excluded.

### Manual verify (after migration + seed data)

```js
import { checkProjectAccess } from './src/utils/projectAccess.js';
// owner → { hasAccess: true, role: 'owner' }
// non-member → { hasAccess: false, status: 403 }
```

---

## Step 8 — Project tracks CRUD

Routes in `api/lambda/src/routes/projects.js`:

| Method | Route | Notes |
|--------|-------|-------|
| `POST` | `/projects/:id/tracks` | Editor+; `revision` required; optional `name`, `sort_order`, `color`; defaults name to `Track N`, sort to `max+1`; enforces `MAX_PROJECT_TRACKS` (403) |
| `PATCH` | `/projects/:id/tracks/:trackId` | Editor+; `revision` required; fields: `name`, `sort_order`, `gain`, `is_muted`/`muted`, `is_solo`/`solo`, `color` |
| `DELETE` | `/projects/:id/tracks/:trackId` | Editor+; `revision` in body; soft-deletes active clips (`deleted_at`); hard-deletes track row only when zero clip rows ever existed |

All mutating track routes bump `projects.revision` with optimistic locking (409 `REVISION_MISMATCH`). Response shape is full `serializeProjectState` + `role`.

### Implementation details

- `bumpProjectRevision(client, projectId, expectedRevision)` — shared helper; release pooled client **before** calling `serializeProjectState` to avoid pool exhaustion under low `max` connections.
- Track delete keeps empty track rows when clip history exists (snapshot restore requirement per `database.md`).
- Track count for limit uses `COUNT(*)` on `project_tracks` for the project (no `deleted_at` on tracks).

### Manual verify

```bash
# Auth: x-dev-user-id: RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE
POST /api/projects/1/tracks  { "revision": N }
PATCH /api/projects/1/tracks/2  { "revision": N, "sort_order": 0, "gain": 0.5, "muted": true }
DELETE /api/projects/1/tracks/1  { "revision": N }  # hard-deletes if never had clips
# 21st POST → 403 "Track limit reached (20/20)"
```

---

## Step 9 — Clip upload (multipart + audio-processing lambda)

### API route

| Method | Route | Notes |
|--------|-------|-------|
| `POST` | `/projects/:id/tracks/:trackId/clips` | `multipart/form-data`; `uploadLimiter` + `getActiveUploadBan`; **skips** social upload quotas |

**Multipart fields:** `file` (required), `revision` (required), `start_time_seconds`, `trim_start_seconds`, `trim_end_seconds` (optional), `clip_id` (re-record/retry).

**Response (201):** `{ assetId, clipId, processing_status: 'pending', revision }`

### Flow

1. Transaction: insert `project_assets` (`pending`, temp `storage_key`, `duration_seconds` from file metadata) + `project_clips` (or update clip `asset_id` on retry); bump `projects.revision` + `last_referenced_at`.
2. Upload temp file to R2: `temp/projects/{projectId}/{assetId}/source.{ext}`.
3. Emit EventBridge `project_asset_created` (skipped in `NODE_ENV=dev`; dev-server polls `pending` assets).
4. Audio-processing lambda `processProjectAsset`: mono 44.1kHz WAV → `projects/{projectId}/{assetId}/audio.wav`; no peaks/normalization/combined mix.

### Files

| File | Purpose |
|------|---------|
| `api/lambda/src/routes/projects.js` | Clip upload route + multer |
| `api/lambda/src/utils/projectAssetUtils.js` | R2 upload, EventBridge emit, temp/final key helpers |
| `functions/lambda/audio-processing/index.js` | Routes on `asset_id` vs `track_id`; `projectAssetCreatedHandler` |
| `functions/lambda/audio-processing/utils/audioProcessor.js` | `processProjectAsset`, `convertToProjectWav` |
| `functions/lambda/audio-processing/dev-server.js` | Polls `project_assets` where `processing_status = 'pending'` |

### Manual verify

```bash
# Auth: x-dev-user-id: RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE
curl -X POST http://localhost:5001/api/projects/1/tracks/3/clips \
  -H "x-dev-user-id: RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE" \
  -F "file=@/path/to/clip.wav" -F "revision=N" -F "start_time_seconds=0"

# Re-record/retry (new asset, same clip):
# ... -F "clip_id=1"

# Run audio-processing dev-server (or manual):
cd functions/lambda/audio-processing && npm run dev
# Or: ASSET_ID=1 S3_KEY=temp/projects/1/1/source.wav node index.js (with .env loaded)
```

---

## Step 9b — Asset processing status

### API route

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/projects/:id/assets/:assetId/processing-status` | Project member access; mirrors `GET /tracks/:id/status` |

**Response:**

```json
{
  "asset_id": 2,
  "status": "pending|processing|completed|failed",
  "error": null,
  "estimated_time_remaining": 120
}
```

- `error` sanitized via `sanitizeProcessingError` (exported from `projectUtils.js`) — generic message only when `status === 'failed'`.
- `estimated_time_remaining` (seconds) returned for `pending` and `processing` (5-minute estimate from `created_at`).

### GET /projects/:id clips

Already included from Step 5/9 via `serializeProjectState`: each clip has `processingStatus`; `processingError` when failed.

### Manual verify

```bash
curl http://localhost:5001/api/projects/1/assets/2/processing-status \
  -H "x-dev-user-id: RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE"
```

---

## Step 10 — Clip edit & soft delete

### API routes

| Method | Route | Notes |
|--------|-------|-------|
| `PATCH` | `/projects/:id/clips/:clipId` | Editor+; `revision` required; fields: `start_time_seconds`/`start_time`, `trim_start_seconds`/`trim_start`, `trim_end_seconds`/`trim_end`, `project_track_id` (move to another track) |
| `DELETE` | `/projects/:id/clips/:clipId` | Editor+; `revision` in body; sets `deleted_at` (soft delete) |

Both routes bump `projects.revision` with optimistic locking (409 `REVISION_MISMATCH`). Response is full `serializeProjectState` + `role`. GET excludes soft-deleted clips (`deleted_at IS NULL` in serializer).

### Validation

- Clip end on timeline ≤ project `duration_seconds` (uses asset `duration_seconds` when `trim_end_seconds` is null)
- `asset.project_id` must match project (enforced on move + edit)
- No overlapping clips on the target track (server rejects with 400)
- `trim_end_seconds` must be greater than `trim_start_seconds` when set

PATCH bumps `project_assets.last_referenced_at` for the clip's asset.

Placement validation uses asset `duration_seconds` when `trim_end_seconds` is null — upload stores file duration on the asset row so pending clips participate in overlap checks.

### Manual verify

```bash
# Auth: x-dev-user-id: RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE
PATCH /api/projects/1/clips/1  { "revision": N, "start_time_seconds": 10 }
PATCH /api/projects/1/clips/1  { "revision": N, "project_track_id": 2 }  # move to track 2
DELETE /api/projects/1/clips/1  { "revision": N }
# Overlap → 400 "Clip overlaps another clip on this track"
# GET /api/projects/1 → deleted clip omitted from tracks[].clips
```

---

## Step 11 — Plugin payload endpoint

### API route

| Method | Route | Notes |
|--------|-------|-------|
| `GET` | `/projects/:id/plugin-payload` | Editor+ only (viewers/non-members → 403); bumps `last_referenced_at` on completed assets |

**Response shape** (matches `plugin.md` / `StemPlaybackEngine` adapter):

```json
{
  "bpm": 128,
  "timeSignature": "4/4",
  "durationSeconds": 120,
  "clips": [
    {
      "clipId": 1,
      "trackId": 2,
      "audioUrl": "https://...r2.../projects/1/3/audio.wav",
      "startTime": 0,
      "trimStart": 0,
      "trimEnd": null,
      "gain": 0.8,
      "trackGain": 0.8
    }
  ]
}
```

- Only clips with `processing_status = 'completed'` are included (pending/failed omitted — no audio URL leak).
- `gain` and `trackGain` both reflect track gain (no per-clip gain column yet).
- Uses `serializeProjectState(projectId, { variant: 'plugin' })` in `projectUtils.js`.

### Manual verify

```bash
# Auth: x-dev-user-id: RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE
curl http://localhost:5001/api/projects/1/plugin-payload \
  -H "x-dev-user-id: RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE"
# Viewer member → 403 "Editor access required"
# Non-member → 403 "You do not have access to this project"
```

---

## Step 12 — Projects nav + list page

Nav was already wired in Step 3 (`Navbar.js`, `MoreDropdown.js`). This step adds the list UI.

### UI

| File | Purpose |
|------|---------|
| `ui/src/app/(frontend)/projects/page.js` | Feature flag gate, auth redirect, fetches `GET /projects` |
| `ui/src/components/projects/ProjectsList.js` | Card grid, empty state, Create Project link |
| `ui/src/components/projects/ProjectsList.module.css` | List/card styles (mirrors `TeamsList`) |

### API client

`projectApi` in `ui/shared/api/index.js` — `listProjects`, `createProject`, `getProject(projectGuid)`; exported from `ui/src/lib/api.js`.

**Route params:** all `/api/projects/:id/*` routes accept project **guid** (UUID). Legacy numeric id still works for curl/dev.

**List response:** includes `teamName` / `campName` when project belongs to a team or camp.

**Active context gate:** team/camp projects are hidden and return 403 when the parent team subscription is inactive/expired or the camp has ended (mirrors `validateTeamAccess` / `validateCampAccess`). Personal projects unaffected.

### Behavior

- Flag off → `notFound()` (unchanged)
- Unauthenticated → redirect `/login`
- **Scope:** all member projects with an active parent context (personal + active team/camp)
- Team/camp cards show `Team: {name}` / `Camp: {name}` subheading
- Cards link to `/projects/{guid}`
- Create Project links to `/projects/create` (Step 13)

### Manual verify

1. Enable `projects` flag in DB
2. Log in; confirm desktop nav shows Projects
3. Visit `/projects` — cards match API list; empty state when none

---

## Step 13 — Create project page

### UI

| File | Purpose |
|------|---------|
| `ui/src/app/(frontend)/projects/create/page.js` | Name form, feature flag + auth gates, optional team/camp context from query params |
| `ui/src/app/(frontend)/projects/create/ProjectCreate.module.css` | Page container + context banner |

Uses shared form styles (`SharedForm.module.css`) — same pattern as team/camp create pages.

### Behavior

- Flag off → `notFound()`
- Unauthenticated → login prompt with redirect back to create URL (preserves `team_id` / `camp_id` query)
- **Default:** personal project (`POST /projects` with `{ name }` only)
- **Optional context:** `?team_id=` or `?camp_id=` (mutually exclusive); banner shows team/camp name when fetch succeeds; passes id to API
- Success → `router.push(/projects/{guid})`
- Errors from API (e.g. tier limit) shown inline

### Manual verify

1. Enable `projects` flag
2. Visit `/projects/create` — enter name → submit → redirects to `/projects/{guid}` (Step 14 shell loads project)
3. At personal project limit → error message from API
4. `/projects/create?team_id=N` — banner + team-scoped create (when team access valid)

---

## Step 14 — Project page shell

### UI

| File | Purpose |
|------|---------|
| `ui/src/app/(frontend)/projects/[projectId]/page.js` | Feature flag + auth gates; fetches `GET /projects/:guid`; header + DAW placeholder |
| `ui/src/app/(frontend)/projects/[projectId]/ProjectPage.module.css` | Page layout, header, DAW placeholder styles |

### Behavior

- Flag off → `notFound()`
- Unauthenticated → login prompt with redirect to `/projects/{guid}`
- Loads project via `projectApi.getProject(projectGuid)` — full state from API (metadata + tracks; DAW not wired yet)
- **403** (non-member or unknown project) → access error + back link (consistent with API no-leak policy)
- Header: project name, role badge, **member count placeholder** (`Members —` until Step 28 members API)
- Desktop: dashed DAW workspace placeholder (Step 15 replaces with `DAWProvider mode="project"`)
- Mobile: same `mobile-collab-message` as collab DAW / upload page

### Manual verify

1. Enable `projects` flag; create or open a project from list
2. `/projects/{guid}` — name in header, role shown, DAW placeholder on desktop
3. Resize to mobile — desktop-required message
4. Open another user's project guid while logged out as non-member → 403 message

---

## Step 16 — Add / remove tracks in DAW

### API client

`projectApi` in `ui/shared/api/index.js`:

| Method | Route |
|--------|-------|
| `createProjectTrack(projectGuid, { revision, name?, sort_order?, color? })` | `POST /projects/:guid/tracks` |
| `deleteProjectTrack(projectGuid, trackId, { revision })` | `DELETE /projects/:guid/tracks/:trackId` |

Both return full `serializeProjectState` + `role` (same as Step 8).

### Serializer tweak (ghost tracks)

`fetchProjectTimelineRows` in `projectUtils.js` excludes tracks that have clip history but no active clips — so DELETE with soft-deleted clips removes the row from GET (DB row kept for snapshot restore).

### DAW

| File | Change |
|------|--------|
| `TrackManager.js` | `removeTrack`, `addEmptyProjectTrack`, `applyProjectState` |
| `project/ProjectEditorContext.js` | `addProjectTrack`, `deleteProjectTrack`, `canEdit`, `applyProjectServerState` — project orchestration (see **DAW architecture**) |
| `DAWContext.js` | `mode="project"` init only; `syncTracksFromManager` bridge |
| `DAW.js` | "Add track" button via `useProjectEditor()`; `ProjectDAW` wraps `ProjectEditorProvider` |
| `TrackHeader.js` | Delete button via `useProjectEditor()` (editor+) |
| `projects/[projectId]/page.js` | `onProjectChange={setProject}` keeps page `revision` in sync |

Editor+ only (`owner` / `admin` / `editor`). Track limit uses `MAX_PROJECT_TRACKS` (20). Errors surface via toast.

### Manual verify

1. Open project on desktop as editor+
2. Click **Add track** → empty track row appears; revision bumps
3. Delete track with clips → row disappears; clips soft-deleted server-side
4. Delete empty track → row disappears (hard-deleted on server)
5. At 20 tracks → Add track disabled; API returns 403 if forced
6. Viewer role → no add/delete controls

---

## Step 18 — Upload file to any track

### Project orchestration

| File | Purpose |
|------|---------|
| `project/ProjectEditorContext.js` | `importAudioFileToTrack(trackId, file, startTimeSeconds)` — decode, 300s validation, overlap/duration placement check, optimistic region, upload original file |
| `project/projectClipPlacement.js` | Timeline position from drag X, overlap validation, placeholder width math |
| `project/projectClipUpload.js` | `buildClipUploadFormData` accepts optional `fileName` for non-WAV imports |

### DAW UI

| File | Change |
|------|--------|
| `components/Track.js` | Project mode: empty track click → file picker at playhead; drag on any track; dashed placeholder on non-empty tracks while hovering |
| `components/Track.module.css` | `.dropPlaceholder` dashed outline (invalid = red tint) |
| `core/Track.js` | `addRegion(..., skipOverlapHandling)` — project clips skip collab overlap trimming |

### Behavior

- **Max duration:** `DAWConfig.audio.maxRecordingDuration` (300s) for projects — toast and no import if longer
- **Empty track:** click opens picker (clip at playhead); drag places at drop X
- **Non-empty track:** drag only (no click picker); dashed placeholder follows cursor; drop starts upload
- **Arm state:** not required for import (record-only)
- **Upload pipeline:** same as Step 17 — local buffer playback → multipart POST → poll → server audio swap; failure uses `RegionProcessingIndicator` retry
- **Placement:** client rejects overlap / beyond project duration before creating region (server Step 10 rules)

### Manual verify

1. Open project as editor+; empty track click → pick file → clip at playhead
2. Drag WAV onto empty track → clip at drop position
3. Drag onto track with existing clips → dashed placeholder while hovering → drop places clip
4. File > 300s → toast, no clip
5. Upload to track 3 while track 2 armed → clip on track 3 only
6. Simulated processing failure → same retry overlay as Step 17

---

## Step 17 — Record clip to armed track

### API client

`projectApi` in `ui/shared/api/index.js`:

| Method | Route |
|--------|-------|
| `uploadProjectClip(projectGuid, trackId, formData)` | `POST /projects/:guid/tracks/:trackId/clips` |
| `getProjectAssetProcessingStatus(projectGuid, assetId)` | `GET /projects/:guid/assets/:assetId/processing-status` |
| `deleteProjectClip(projectGuid, clipId, { revision })` | `DELETE /projects/:guid/clips/:clipId` |

### Project orchestration

| File | Purpose |
|------|---------|
| `project/ProjectEditorContext.js` | Armed track, `startProjectRecording`, record-stop → optimistic region → upload → poll → swap server audio; `retryClipUpload`, `deleteFailedClip`, `hasInFlightClipWork` |
| `project/projectClipUpload.js` | WAV export, multipart form builder, processing poll (3s interval, 5m timeout), status constants |

### DAW runtime changes

| File | Change |
|------|--------|
| `Recorder.js` | Uses `AudioState.recordingTargetTrackId` for buffer key + STOPPED payload |
| `AudioEngine.js` | Input metering/monitor uses `AudioState.armedTrackId` (not only `recording-track`) |
| `core/Track.js` | `ensureMeterInputNode()` for armed project tracks |
| `ChunkScheduler.js` | Skip armed track during recording |
| `DAWContext.js` | Skips collab `handleRecordingStopped` in project mode |
| `TransportControls.js` | Record button in project mode (requires armed track) |
| `TrackHeader.js` | Arm/disarm button; monitor on armed track |
| `Track.js` | Recording indicator on armed track |
| `Region.js` | Upload/processing overlay; failed state with Record again + Delete |
| `DAW.js` | `beforeunload` + navigation guard when clip upload/processing in flight; `r` key records in project mode |

### Flow

1. Editor arms a track (auto-arms first track on load).
2. Record → `Recorder` stores buffer → optimistic clip on timeline (local playback).
3. Multipart `POST` clip upload (Step 9); revision bumped on success.
4. Poll processing status (Step 9b) until `completed` or `failed`.
5. On `completed`: decode server `audioUrl`, swap region buffer, release local buffer.
6. On failure: error overlay; **Record again** re-POSTs with `clip_id` + local buffer; **Delete** soft-deletes server clip (if any) and removes region.

### Manual verify

1. Open project as editor+ on desktop; arm track 2.
2. Record at playhead → hear take immediately from local buffer.
3. After audio-processing dev-server runs → clip plays from server URL; overlay clears.
4. Simulate lambda failure → failed overlay; Record again retries without re-recording; Delete removes clip.
5. Start upload then refresh/leave → `beforeunload` warning.

---

## Step 15 — DAW `project` mode (read-only load)

### UI

| File | Purpose |
|------|---------|
| `ui/src/components/DAW/DAW.js` | `ProjectDAW` export; hides collab upload/welcome/invite UI in project mode |
| `ui/src/components/DAW/DAWContext.js` | `mode="project"`, `projectData`, `dawMode`; skips `UndoManager.init()` |
| `ui/src/components/DAW/project/` | Project orchestration layer — see **DAW architecture (required)** |
| `ui/src/components/DAW/core/TrackManager.js` | `loadProject(state)` — decodes completed clip `audioUrl`s into regions |
| `ui/src/app/(frontend)/projects/[projectId]/page.js` | Replaces DAW placeholder with `<ProjectDAW project={project} />` |

### Behavior

- `DAWProvider mode="project"` + `projectData` from `GET /projects/:guid`
- Loads tracks sorted by `sortOrder`; only clips with `audioUrl` (processing completed) are playable
- Project `durationSeconds`, `bpm`, `timeSignature`, `metronomeOffset` applied on init
- No `recording-track`; no undo buttons or keyboard shortcuts; regions read-only (no drag/trim/delete)
- Transport play/pause + seek work; record button hidden until Step 17
- Track mute/solo from API applied via `TRACK.MUTE` / `TRACK.SOLO` events after audio engine init

### Manual verify

1. Open project with completed clips on desktop → waveforms visible on timeline
2. Press play → hear clips; space toggles transport
3. Undo/redo buttons absent; clips cannot be dragged or trimmed
4. Pending/failed clips (no `audioUrl`) omitted from timeline

---

## Changelog

| Date | Step | Summary |
|------|------|---------|
| 2026-06-10 | 1–4 | Foundation: shared constants/limits, feature flag + gated UI stub, full Phase 1a schema DDL |
| 2026-06-10 | 5 | Project access checks + canonical state serializer |
| 2026-06-10 | 6–8 | Project CRUD + tracks CRUD with revision contract |
| 2026-06-10 | 9 | Clip multipart upload, R2 temp path, audio-processing project branch |
| 2026-06-10 | 9b | Asset processing-status polling endpoint |
| 2026-06-10 | 10 | Clip PATCH (move/trim) + DELETE (soft delete) with overlap validation |
| 2026-06-10 | 11 | Plugin-payload endpoint with flat completed clips; editor+ gate |
| 2026-06-10 | 12 | Projects list page; guid routes; active team/camp context gate on list + access |
| 2026-06-10 | 13 | Create project page with optional team/camp query context |
| 2026-06-10 | 14 | Project page shell with header, DAW placeholder, desktop-only gate |
| 2026-06-10 | 15 | Project DAW read-only load: `loadProject`, `ProjectDAW`, playback without undo |
| 2026-06-10 | 16 | Project DAW add/delete tracks wired to Step 8 API; ghost-track filter on GET |
| 2026-06-10 | 17 | Project record-to-armed-track: upload pipeline, processing overlay, retry/delete, beforeunload guard |
| 2026-06-10 | 18 | Project file import: click/drag on any track, 300s limit, drop placeholder, shared upload pipeline |
| 2026-06-10 | — | DAW refactor: project orchestration extracted to `project/ProjectEditorContext.js`; architecture documented as required convention |
