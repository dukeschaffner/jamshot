# Projects — Snapshots (Replaces Undo/Redo)

Product requirement: **no undo/redo** in project DAW. Use **project snapshots** instead.

**Source of truth:** [decisions.md](./decisions.md) · Implementation: Steps 22–25 of [implementation-steps.md](./implementation-steps.md).

---

## User-facing behavior

| Action | Behavior |
|---|---|
| Manual snapshot | Toolbar button → optional label → saved |
| Auto snapshot | Server-side interval (`AUTO_SNAPSHOT_INTERVAL_SECONDS`) while project has active editors |
| List snapshots | Sidebar or modal with timestamp, author, label, kind |
| Preview snapshot | **Read-only DAW audition** — hear that version without mutating live project |
| Restore | Confirm dialog → auto pre-restore snapshot → full state replace |

---

## When to create snapshots

1. **Manual** — `snapshot_kind = 'manual'`
2. **Auto** — `snapshot_kind = 'auto'`; server-triggered (not client-only timer)
3. **Pre-restore** — `snapshot_kind = 'pre_restore'`; automatic before any restore

No snapshot-on-member-join for MVP.

---

## Storage strategy

**MVP:** Full state JSON in `project_snapshots.state`.

Audio files are **not** duplicated — snapshot references `asset_id`s via clips and `project_snapshot_assets`.

**JSON shape:** store `assetId` only — resolve public R2 URLs from `project_assets` at preview/playback time (no signed URLs, no embedded URLs).

On snapshot create: `INSERT INTO project_snapshot_assets` for every `asset_id` in serialized state.

---

## Restore semantics

Canonical algorithm — see [database.md](./database.md#restore-algorithm-canonical):

1. Create pre-restore snapshot
2. Upsert project metadata from snapshot
3. Upsert tracks; undelete/update clips in snapshot
4. Soft-delete live clips **not** in snapshot
5. Bump `revision`
6. Phase 1: clients reload via REST. Phase 2: broadcast `state` + `locks_clear`

**Do not** hard-delete and re-insert clip rows.

**Who can restore:** owner, admin, editor (not viewer).

---

## Retention

Tier-based `max_snapshots`.

When limit exceeded on **auto** snapshot create: prune oldest `auto` snapshots until under cap.

Do not auto-prune `manual` or `pre_restore` without explicit product rule.

Pruning cascades `project_snapshot_assets`; assets only in pruned snapshots may become cleanup-eligible after grace ([assets.md](./assets.md)).

---

## UI placement

- Project page toolbar: **Snapshot** dropdown (Create / History / Preview / Restore)
- Hide undo/redo in project mode (`TransportControls`)
- Do not initialize `UndoManager` (see [web-daw.md](./web-daw.md))

---

## API

See [api.md](./api.md) — `POST/GET /projects/:id/snapshots`, `POST .../restore`.
