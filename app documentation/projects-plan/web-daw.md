# Projects — Web UI & DAW Reuse Analysis

---

## New UI surfaces

| Page / component | Description |
|---|---|
| `/projects` | List user's projects; empty state → create |
| `/projects/[projectId]` | Project workspace (toolbar, Project DAW) |
| `/projects/invite/[token]` | Accept invite landing page |
| Create project modal | Name; optional team/camp context from dashboard |
| `ProjectMembersPanel` | Members, invites, roles (Step 28) |
| `ProjectSyncContext` | WS + presence + locks (Phase 2) |

Navigation: **"Projects"** in desktop navbar (feature flag). Team/camp entry points in Step 27.

---

## DAW reuse evaluation

The existing DAW (`ui/src/components/DAW/`) is built for **collab sessions** tied to one social `track` (stem chain + global `recording-track`).

### Verdict: **Extend with `dawMode: 'project'` — do not fork**

Reuse audio engine and timeline rendering. Add `armedTrackId` and `loadProject()` — see prerequisite in [implementation-steps.md](./implementation-steps.md) Milestone 3.

---

### Reuse as-is (or minimal changes)

| Module | Role |
|---|---|
| `core/AudioEngine.js`, `ChunkScheduler.js`, `BufferRegistry.js` | Playback |
| `core/Recorder.js` | Input capture |
| `components/MusicalGrid.js`, `Playhead.js`, `TimeDisplay.js` | Timeline UI |
| `components/waveform/*` | Waveforms (client-side) |
| `components/AudioSettings.js`, `NudgeIndicator.js` | Input |
| `misc/EventBus.js`, `DAWEvents.js`, `DAWUtils.js`, `DAWConfig.js` | Shared utilities |

---

### Reuse with modifications

| Module | Project changes |
|---|---|
| **`DAWContext.js`** | `dawMode`; `armedTrackId`; `loadProject`; skip `UndoManager.init()` in project mode; record-stop → `bufferRegistry` optimistic clip → multipart upload → poll → swap to server audio |
| **`core/TrackManager.js`** | `loadProject(tracks, clips)` from public R2 URLs |
| **`core/Track.js`** | Armed track flag (not `id === 'recording-track'`) |
| **`components/Track.js`** | Record/upload on armed track; allow file drop on non-empty tracks |
| **`components/Region.js`** | Cross-track drag; debounced PATCH via `useProjectPersistence` |
| **`components/TrackHeader.js`** | Arm button; lock badge (Phase 2) |
| **`components/TransportControls.js`** | Hide undo/redo; no Publish collab |
| **`components/ProjectEndOverlay.js`** | **Reuse/adapt** for duration extension up to 300s |
| **`components/PluginSync.js`** | `set_project`, `project_sync` (or `ProjectPluginSync.js`) |

---

### Do not reuse

| Module | Reason |
|---|---|
| **`core/UndoManager.js`** | Snapshots replace undo |
| **`components/UploadForm.js`** | Collab publish flow |
| **`components/Takes.js`** | Single clip per record |

---

### New components

| Component | Purpose |
|---|---|
| `ProjectDAW.js` / `DAW mode="project"` | Entry from project page |
| `ProjectToolbar.js` | Snapshots, plugin sync toggle, member avatars |
| `ProjectMembersPanel.js` | Invites + roles |
| `LockBadge.js` | Track lock indicator (Phase 2) |
| `SnapshotPanel.js` | List / preview / restore |
| `ProjectSyncContext.js` | WS ops (Phase 2) |
| `hooks/useProjectPersistence.js` | Debounced REST; dirty tracking; revision 409 UX |

---

## Behavioral differences

| Rule | Collab DAW | Project DAW |
|---|---|---|
| Cross-track move | Forbidden | Allowed |
| Recording | Global `recording-track` | **Armed track** (`armedTrackId`) |
| Empty tracks | N/A for stems | Allowed |
| Audio source | Stem chain API | `project_clips` + public R2 URLs |
| Mixdown | Server `combined_audio_url` | Live Web Audio only |
| Undo | Yes | No — snapshots |
| Upload max duration | 900s (non-collab) | **300s** |
| Return path from host DAW | N/A | **Import audio** (Step 18b) |

---

## Data loading

**Collab:**

```
GET /tracks/:id/stems → TrackManager.loadStemChain()
```

**Project:**

```
GET /projects/:id → projectUtils → TrackManager.loadProject()
  audio URLs: ${R2_PUBLIC_URL}/{storage_key}  (no signed URLs)
```

---

## Recording / upload pipeline (project mode)

Reuse collab pattern: on record stop, `Recorder` stores `AudioBuffer` in `bufferRegistry` and adds a region immediately. Project mode differs in that upload starts automatically (no `UploadForm` step).

### Happy path

1. User arms track → records → `Recorder` stops
2. **Optimistic clip:** add region on armed track backed by local `bufferKey` (playable immediately — same as collab `handleRecordingStopped`)
3. Export buffer → `POST` multipart to `/projects/:id/tracks/:trackId/clips` with placement fields
4. On POST success: attach server `clipId` / `assetId` to optimistic clip; show processing overlay (spinner)
5. Poll `GET .../assets/:assetId/processing-status` every 3s (5-minute client timeout → treat as `failed`)
6. On `completed`: fetch/decode server `audio_url` → swap clip playback source from local buffer to server WAV → release local buffer from `bufferRegistry`
7. On `failed`: show error on clip; keep local buffer for retry

### Clip UI states

| Asset status | Timeline | Playback (recording user) | Playback (collaborators) |
|---|---|---|---|
| POST in flight | Optimistic clip + upload overlay | Local `bufferRegistry` | N/A — clip not on server yet |
| `pending` / `processing` | Clip + spinner overlay | Local buffer | Spinner only — not playable |
| `completed` | Normal clip | Server `audio_url` | Server `audio_url` |
| `failed` | Error styling + message | Local buffer (retry without re-recording) | Error state — not playable |

### Failure handling

**Multipart POST fails** (network, 4xx, 5xx):

- Toast error; remove optimistic clip (or leave with retry affordance)
- Keep local buffer in `bufferRegistry` for retry
- No server clip row created

**POST succeeds, lambda fails:**

- Clip row exists with `processing_status = 'failed'`
- **Record again** — re-`POST` with same `clip_id` + local buffer (or new recording)
- **Delete** — soft-delete clip via `DELETE .../clips/:clipId`
- Do not roll back `projects.revision` on failure

No server-side auto-retry for MVP.

### Navigation / reload

- `beforeunload` warning if any clip has in-flight upload or `pending`/`processing` status
- Page reload drops local buffers; clips reload from server (`pending`/`failed`/`completed` only)
- IndexedDB persistence for local audio: post-MVP

**File upload / import from Logic:** same pipeline; no local buffer unless user recorded in-browser first. Failed file uploads follow the same POST vs lambda failure split.

See [api.md](./api.md) · [decisions.md](./decisions.md).

---

## Viewer role (Phase 1b+)

When user has `viewer` role:

- Read-only DAW: no record, drag, trim, or transport edits
- Banner: "View only"
- No `plugin-payload` access

---

## Implementation approach

**Option A — `dawMode` prop (recommended):**

```jsx
<DAWProvider dawMode="project" projectId={id} projectState={state}>
  <ProjectToolbar />
  <DAW />
</DAWProvider>
```

Start with Option A. Extract `daw-core/` later only if conditionals become unmaintainable.

---

## Mobile

Desktop-only for MVP — gate `/projects/[projectId]` like collab DAW.

---

## Feature flag

Routes and nav behind `projects` flag (`useFeatureFlags`).

---

## Suggested file touch list (Phase 1a)

**New:**

- `ui/src/app/(frontend)/projects/page.js`
- `ui/src/app/(frontend)/projects/[projectId]/page.js`
- `ui/src/app/(frontend)/projects/invite/[token]/page.js`
- `ui/src/hooks/useProjectPersistence.js`
- `ui/src/components/ProjectDAW/ProjectToolbar.js`

**Modify:**

- `DAWContext.js`, `TrackManager.js`, `Region.js`, `Track.js`, `TrackHeader.js`
- `TransportControls.js`, `ProjectEndOverlay.js`, `PluginSync.js`
