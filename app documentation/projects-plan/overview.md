# Projects — Implementation Overview

Real-time collaborative workspace (Bandlab-like editing in the browser) with playback/reference in the user's native DAW via the Sterio plugin. The web app is the **source of truth** for project state; the plugin mirrors project audio for recording.

See also: [projects-plan.txt](./projects-plan.txt)

---

## Goals (from product brief)

| Capability | Collab track DAW (today) | Project DAW (new) |
|---|---|---|
| Async tree of published collabs | Yes | No (different model) |
| Real-time multi-user editing | No | Yes (Phase 2) |
| Move regions between tracks | No | Yes |
| Record / upload on any track | No (recording track only) | Yes |
| Undo / redo | Yes | **No** — use snapshots instead |
| Edit locking | No | Yes (track-level, Phase 2) |
| Plugin playback sync | Manual per track | Project-level, auto or manual |

---

## Major workstreams

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Database   │────▶│  REST API    │────▶│  Web UI + DAW   │
│  (schema)   │     │  (CRUD,      │     │  (project pages,│
└─────────────┘     │   uploads)   │     │   ProjectDAW)   │
                    └──────┬───────┘     └────────┬────────┘
                           │                      │
                    ┌──────▼───────┐     ┌────────▼────────┐
                    │ Real-time    │◀───▶│ Plugin          │
                    │ sync service │     │ (project load,  │
                    └──────────────┘     │  auto-sync)     │
                                         └─────────────────┘
```

| Doc | Scope |
|---|---|
| [database.md](./database.md) | Tables, relationships, migration notes |
| [api.md](./api.md) | REST routes, auth, upload flow |
| [realtime-sync.md](./realtime-sync.md) | WebSocket protocol, locks, fan-out |
| [snapshots.md](./snapshots.md) | Version history (replaces undo/redo) |
| [assets.md](./assets.md) | Audio library, retention, cleanup, files panel |
| [web-daw.md](./web-daw.md) | UI pages + **reuse vs new DAW components** |
| [plugin.md](./plugin.md) | Plugin phases, WS messages, persistence |
| [decisions.md](./decisions.md) | Resolved product & technical decisions |
| [implementation-steps.md](./implementation-steps.md) | Step-by-step build plan |

---

## Suggested phases

### Phase 1a — Solo project + plugin (no realtime)

- DB schema + REST CRUD
- Project page with **Project DAW** (single user)
- Manual + auto snapshots (preview before restore)
- Plugin: `set_project` + auto-sync (default on)
- Multipart clip upload → shared audio-processing lambda (project branch); local `bufferRegistry` playback until processed audio is ready

**Exit criteria:** One user creates a project, edits in browser, opens in plugin, records in Logic, exports WAV, imports back via web (Step 18b).

### Phase 1b — Context & sharing (REST-only)

- Import from Sterio track/collab
- Team/camp projects with collaborator cap: `min(teamSize, 25)`
- Invites + member management
- **Pre-realtime policy:** invited editors get sync warning, or viewer-only until Phase 2 (see [decisions.md](./decisions.md))

### Phase 2 — Real-time collaboration

- WebSocket sync service + minimal presence
- Track-level locking; REST and WS both enforce locks
- Conflict rules (see [realtime-sync.md](./realtime-sync.md))

**Exit criteria:** Two users edit same project; changes appear within acceptable latency; locks prevent clobbering.

### Phase 3 — Post-MVP polish

- Plugin zoomed-out timeline view
- Publish project mixdown to public feed
- Asset library UI + auto-cleanup

---

## Relationship to existing features

| Existing | Relationship to projects |
|---|---|
| **Tracks / collabs** | Separate product surface. Import copies audio — no live link. |
| **Teams / Camps** | Similar invite/role UX. Validate membership on project create. |
| **mix_gains on tracks** | Import maps stems → project tracks/clips. |
| **Plugin (track mode)** | Reuse `StemPlaybackEngine`; new `set_project` / `project_sync` messages. |
| **audio-processing lambda** | Extend with `asset_id` branch for project format conversion. |

---

## Infrastructure gaps

| Gap | Notes |
|---|---|
| **Server WebSocket** | Net-new API Gateway WS + Lambda (not in CDK today; API deploys via GitHub Actions) |
| **WS auth** | Must design before Milestone 7 |
| **Plugin local WS** | Unchanged — web forwards `project_sync` to `localhost:59327` |

Ephemeral state in **Neon** — no DynamoDB.

---

## Feature flag

Gate UI **and** API behind `projects` feature flag until beta-ready.
