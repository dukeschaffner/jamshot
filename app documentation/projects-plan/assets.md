# Projects — Audio Assets & Cleanup

Product requirement: manage project audio blobs separately from timeline clips so snapshots, restore, and storage cleanup stay correct.

**Source of truth:** [decisions.md](./decisions.md) · Schema: [database.md](./database.md) · Snapshots: [snapshots.md](./snapshots.md)

---

## Why a separate assets table

Timeline clips (`project_clips`) answer *where* audio sits. `project_assets` answer *what* audio exists.

Benefits:

- Upload to library without placing on timeline (post-MVP)
- One asset → multiple clips
- Re-record replaces clip's `asset_id`; old blob stays if snapshots reference it
- Snapshot index avoids JSONB scans in cleanup jobs
- Files panel lists all project audio

---

## Storage & URLs

- R2 keys in `project_assets.storage_key` (e.g. `projects/{projectId}/{assetId}/audio.wav`)
- Public URLs: `${R2_PUBLIC_URL}/{storage_key}` — **no signed URLs**
- Upload: multipart to API → `temp/projects/...` → audio-processing lambda → final key

---

## Protection rules (when NOT to delete)

An asset is **protected** if any of:

1. Referenced by a live clip (`deleted_at IS NULL`)
2. Referenced by a **soft-deleted** clip (restorable)
3. Listed in `project_snapshot_assets` for a retained snapshot
4. `last_referenced_at` within grace window
5. `processing_status` in `pending`, `processing`, or `failed` before `PROCESSING_ASSET_GRACE_SECONDS`

Failed assets referenced by a live clip stay protected until the user deletes the clip or retries (new asset via `clip_id` re-upload). Orphaned failed assets become cleanup-eligible after `PROCESSING_ASSET_GRACE_SECONDS`.

---

## Timestamps

| Column | Set when |
|---|---|
| `created_at` | Upload / import completes |
| `last_referenced_at` | Clip placed/moved; snapshot includes asset; plugin-payload fetch; preview playback |

---

## Track delete behavior

`DELETE /projects/:id/tracks/:trackId`:

- Soft-delete all clips on track (`deleted_at`)
- **Do not** hard-delete the track row if any clip rows exist (including soft-deleted)
- **Do not** delete assets

Only hard-delete `project_tracks` with **zero clip rows ever**.

---

## Manual asset delete

1. Soft-delete all referencing clips (`deleted_at`)
2. Set `project_assets.deleted_at`
3. Async R2 delete after DB commit
4. Block or require `force=true` if asset in retained snapshot

---

## Snapshot asset index

On every snapshot create:

1. Serialize state via `projectUtils`
2. Extract all `asset_id` values
3. `INSERT INTO project_snapshot_assets ... ON CONFLICT DO NOTHING`

Cleanup jobs use this table only — never parse `state` JSONB.

---

## Auto-cleanup job (post-MVP)

Nightly Lambda; **dry-run mode** first.

Eligible when:

- `processing_status = 'completed'` (or `failed` after `PROCESSING_ASSET_GRACE_SECONDS`)
- `deleted_at IS NULL`
- `last_referenced_at` older than `ASSET_AUTO_DELETE_GRACE_DAYS`
- No clip references (including soft-deleted)
- No `project_snapshot_assets` row

---

## Phasing

| Phase | Scope |
|---|---|
| **1a** | `project_assets` table; multipart upload; lambda branch; snapshot index; soft-delete clips |
| **1b** | Import copies into assets |
| **Post-MVP** | Files panel + manual delete API + auto-cleanup Lambda |

---

## API

See [api.md](./api.md).
