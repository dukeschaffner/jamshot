# Projects — Real-Time Sync

> **Status:** Phase 2 (Milestone 7). **No existing server-side WebSocket infra** in this repo.

---

## Current state

| Component | Behavior |
|---|---|
| `PluginWebSocketContext` (web) | Client → `ws://localhost:59327` (plugin WS **server**) |
| `ConnectionManager` (plugin) | Local IXWebSocket server; `set_track`, `stem_metadata_sync`, `set_project`, `project_sync` |
| API Lambda | REST only — no WS |

Project collaboration requires a **central** sync service all browser sessions connect to. Plugin sync remains local WS (web forwards project updates to plugin).

---

## Architecture

| Layer | Choice |
|---|---|
| **Transport** | API Gateway WebSocket + Lambda handlers |
| **Deploy** | New CDK construct **or** dedicated GitHub workflow (API Lambda today is not in CDK) |
| **Ephemeral state** | Neon — `project_ws_connections`, `project_track_locks` |
| **Project state** | Neon — ops persist in same transaction as lock checks |

Phase 1 skips realtime — REST autosave only. **REST mutating routes must enforce locks** once Step 35 ships (not WS-only).

---

## Authentication

1. **`$connect`:** pass session JWT or auth token in query string; validate before accepting connection.
2. **`join`:** verify `projectAccess` (membership + role); reject viewers from sending ops (viewers may receive broadcasts).
3. **Cap:** reject join when active connections ≥ `effectiveMaxMembers`.

---

## Protocol (`protocolVersion: 1`)

### Client → server

```json
{ "type": "join", "projectId": 123, "revision": 42, "protocolVersion": 1 }
{ "type": "lock_acquire", "resource": { "type": "track", "id": 1 } }
{ "type": "lock_release", "resource": { "type": "track", "id": 1 } }
{ "type": "lock_heartbeat", "trackIds": [1, 2] }
{ "type": "op", "opId": "uuid", "baseRevision": 42, "payload": { "kind": "clip.move", ... } }
{ "type": "presence", "editingTrackId": 1 }
```

### Server → client

```json
{ "type": "state", "revision": 42, "project": { ... } }
{ "type": "op_ack", "opId": "uuid", "revision": 43 }
{ "type": "op", "fromUserId": "...", "revision": 43, "payload": { ... } }
{ "type": "op_nack", "opId": "uuid", "code": "REVISION_MISMATCH|LOCK_DENIED|VALIDATION_ERROR", "message": "..." }
{ "type": "lock", "action": "acquired|released", "resource": { "type": "track", "id": 1 }, "userId": "..." }
{ "type": "presence", "users": [ ... ] }
{ "type": "asset.processing_update", "clipId": 10, "assetId": 42, "status": "completed|failed", "error": "..." }
{ "type": "locks_clear" }
{ "type": "error", "code": "LOCK_DENIED", "message": "..." }
```

**Idempotency:** server dedupes by `(connection_id, opId)`.

**Ordering:** clients apply remote ops in `revision` order, not arrival order.

---

## Locking

Config: `LOCK_TTL_SECONDS` = 60, `LOCK_HEARTBEAT_INTERVAL_SECONDS` = 15.

### Edit modes

| Edit | Locks required |
|---|---|
| Trim / move on same track | Source track |
| Record / upload | Armed track |
| Track metadata | That track |
| Cross-track move | Source + destination (lower `trackId` first) |
| `track.reorder` | **Project metadata lock** (short TTL, one per project) |
| `project.transport` (BPM, duration) | **Project metadata lock** |

### Cross-track moves

1. `mousedown` → acquire source track lock
2. Debounced hover on dest (~150ms) → acquire dest lock; deny → snap back
3. `drop` → `clip.move_to_track` op → release both
4. `ESC` → release all held locks

### Disconnect

- On `$disconnect`: mark connection stale; **do not** immediately release locks.
- After **30–45s** grace: release locks if user has not reconnected (same `user_id` may re-acquire from new `connection_id`).
- Same user, two tabs: allow lock steal from self (same `user_id`, new `connection_id`).

### Server-side enforcement

| Op | Lock rule |
|---|---|
| `clip.move`, `clip.trim`, `clip.delete` | Holder of `trackId` |
| `clip.move_to_track` | Holder of **both** tracks |
| `track.update`, `track.delete`, clip upload | Holder of `trackId` |
| `track.reorder`, `project.transport` | Project metadata lock |
| REST `PATCH`/`POST`/`DELETE` | Same rules as WS |

---

## Operation kinds

- `clip.move`, `clip.trim`, `clip.move_to_track`, `clip.delete`
- `track.create`, `track.delete`, `track.update`, `track.reorder`
- `project.transport`

Uploads and import remain REST; server pushes `asset.processing_update` to room when lambda finishes (`status: completed|failed`). Recording user's local buffer is session-only — collaborators see spinner until `completed` or error state on `failed`.

Snapshot restore: block if non-expired locks held (or admin `force`); broadcast `state` + `locks_clear`.

---

## Conflict resolution

| Scenario | Handling |
|---|---|
| Different tracks, concurrent edits | Both apply if ops commute |
| Lock holder edits | Others blocked |
| `REVISION_MISMATCH` on op | NACK; client rebases or prompts (Step 21) |
| Lock expires mid-edit | Re-acquire; on failure revert UI |
| Remote op during local drag | Buffer remote ops until drop, then apply |

No undo/redo — conflicts that slip past locks require snapshot restore.

---

## Web DAW integration

`ProjectSyncContext` (separate from `PluginWebSocketContext`):

1. Load project via REST
2. Open WS; send `join`
3. Remote ops → `TrackManager` via event bus
4. Local edits → `op` message (when connected); else `useProjectPersistence` REST fallback

On reconnect: `join` with `revision`; if behind, server sends full `state` + `locks` (no diff for MVP).

---

## Plugin path

When realtime op received and auto-sync on: debounced `project_sync` via local plugin WS.

---

## Observability

- Connection count per project
- Op latency p50/p99
- Lock contention / `LOCK_DENIED` rate
- Reconnect rate
- PostHog: `project_ws_join_failed`, `project_op_nack`

Feature-flagged beta: alert if sync error rate exceeds threshold.
