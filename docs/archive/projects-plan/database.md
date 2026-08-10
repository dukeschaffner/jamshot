# Projects — Database Design

> **Status:** Aligned with [decisions.md](./decisions.md). Implementation: Step 4 of [implementation-steps.md](./implementation-steps.md).

---

## Design principles

1. **Project state is a mutable document**, not an append-only collab tree.
2. **Audio blobs live in `project_assets`**; timeline clips reference assets by `asset_id` (not embedded in JSON).
3. **Snapshots are immutable copies** of project state at a point in time (metadata + clip refs; audio files are not duplicated).
4. **Snapshot asset refs are denormalized** in `project_snapshot_assets` so cleanup and the files panel avoid scanning JSONB.
5. **Locks and WS connections are ephemeral** — stored in **Neon (Postgres)** alongside project data (Phase 2).
6. **Project clips do not count** toward social track upload quotas (enforced in API, not DB).
7. **Audio URLs are public R2 paths** — store `storage_key`; resolve `${R2_PUBLIC_URL}/{storage_key}` at API layer (no signed URLs).

Asset lifecycle, retention, and cleanup: [assets.md](./assets.md).

---

## Proposed core tables

### `projects`

```sql
CREATE TABLE projects (
  id SERIAL PRIMARY KEY,
  guid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id INT REFERENCES teams(id) ON DELETE SET NULL,
  camp_id INT REFERENCES camps(id) ON DELETE SET NULL,
  bpm INTEGER,
  time_signature VARCHAR(10) NOT NULL DEFAULT '4/4',
  metronome_offset FLOAT DEFAULT 0,
  duration_seconds FLOAT NOT NULL DEFAULT 60
    CHECK (duration_seconds <= 300),
  is_private BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revision BIGINT NOT NULL DEFAULT 1,
  CONSTRAINT projects_team_or_camp CHECK (
    team_id IS NULL OR camp_id IS NULL
  )
);
```

`duration_seconds` capped at **300**. Enforce `MAX_PROJECT_TRACKS` (default **20**) at API layer.

**Team/camp delete:** `ON DELETE SET NULL` — project becomes personal orphan under `owner_id`. Document in product copy; consider blocking team delete while projects exist (future).

---

### `project_members`

```sql
CREATE TABLE project_members (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, user_id)
);

-- One owner per project
CREATE UNIQUE INDEX idx_project_members_one_owner
  ON project_members (project_id) WHERE role = 'owner';
```

`projects.owner_id` must match the `owner` row in `project_members` (enforce in app on create/transfer).

**Member caps** — enforced at invite accept / member add:

- Personal: `limits.max_project_members` from subscription tier.
- Team/camp: `min(activeTeamOrCampMemberCount, MAX_TEAM_CAMP_COLLABORATORS)`.

---

### `project_tracks`

```sql
CREATE TABLE project_tracks (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  name VARCHAR(200) NOT NULL,
  color VARCHAR(20),
  gain FLOAT NOT NULL DEFAULT 0.8,
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  is_solo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Max **20** tracks per project.

**Track delete:** soft-delete all clips (`deleted_at`). **Never hard-delete** `project_tracks` rows that have any `project_clips` rows (including soft-deleted) — required for snapshot restore. Only hard-delete tracks with zero clip rows ever.

---

### `project_assets`

```sql
CREATE TABLE project_assets (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_key VARCHAR(500),   -- R2 object key, e.g. projects/{projectId}/{assetId}/audio.wav
  audio_url VARCHAR(1000),  -- public URL or same as storage_key path; null while processing
  waveform_url VARCHAR(1000),  -- R2 key for preview peaks JSON, e.g. waveforms/projects/{projectId}/{assetId}.json
  name VARCHAR(200),
  duration_seconds FLOAT,
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  processing_status TEXT DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_error TEXT,
  last_referenced_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**No `combined_audio_url`**. **Server preview peaks** at 256 resolution (generated during audio-processing; same JSON format as social tracks). Timeline playback still uses full WAV; Files panel and library UI fetch peaks only.

---

### `project_clips`

```sql
CREATE TABLE project_clips (
  id SERIAL PRIMARY KEY,
  project_track_id INT NOT NULL REFERENCES project_tracks(id) ON DELETE RESTRICT,
  asset_id INT NOT NULL REFERENCES project_assets(id) ON DELETE RESTRICT,
  start_time_seconds FLOAT NOT NULL DEFAULT 0
    CHECK (start_time_seconds >= 0),
  trim_start_seconds FLOAT NOT NULL DEFAULT 0,
  trim_end_seconds FLOAT,
  deleted_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

`ON DELETE RESTRICT` on `project_track_id` prevents accidental hard-delete of tracks with clips.

**Clip + asset lifecycle:** both rows are created on successful clip upload `POST` (before lambda). `processing_status` on the linked asset drives playback eligibility; failed assets keep their clip row for retry/delete (see [web-daw.md](./web-daw.md)).

**App-level validation:** clip end ≤ project `duration_seconds`; `asset.project_id` must match track's `project_id`; no overlapping clips on same track (reject on server).

---

### `project_snapshots`

```sql
CREATE TABLE project_snapshots (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  label VARCHAR(200),
  snapshot_kind VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (snapshot_kind IN ('manual', 'auto', 'pre_restore')),
  revision BIGINT NOT NULL,  -- projects.revision at create time (informational)
  state JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Prune oldest `auto` snapshots when over tier cap; never auto-prune `pre_restore` or `manual` without explicit policy.

---

### `project_snapshot_assets`

```sql
CREATE TABLE project_snapshot_assets (
  snapshot_id INT NOT NULL REFERENCES project_snapshots(id) ON DELETE CASCADE,
  asset_id INT NOT NULL REFERENCES project_assets(id) ON DELETE RESTRICT,
  PRIMARY KEY (snapshot_id, asset_id)
);
```

Populated on snapshot create: `INSERT ... ON CONFLICT DO NOTHING`.

---

### `project_invites`

```sql
CREATE TABLE project_invites (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  token VARCHAR(64) UNIQUE NOT NULL,
  role VARCHAR(20) NOT NULL
    CHECK (role IN ('admin', 'editor', 'viewer')),
  expires_at TIMESTAMP NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),
  revoked_at TIMESTAMP,
  accepted_at TIMESTAMP,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Cannot invite as `owner`. Default expiry from `INVITE_DEFAULT_EXPIRY_DAYS`.

---

## Realtime tables (Phase 2 — Milestone 7)

### `project_ws_connections`

```sql
CREATE TABLE project_ws_connections (
  connection_id VARCHAR(128) PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  editing_track_id INT REFERENCES project_tracks(id) ON DELETE SET NULL,
  connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_project_ws_connections_project ON project_ws_connections(project_id);
CREATE INDEX idx_project_ws_connections_user ON project_ws_connections(user_id);
```

On `$disconnect`: mark stale; release locks after **30–45s grace** if user does not reconnect (see [realtime-sync.md](./realtime-sync.md)).

### `project_track_locks`

```sql
CREATE TABLE project_track_locks (
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  track_id INT NOT NULL REFERENCES project_tracks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (project_id, track_id)
);
```

**Acquire:** `INSERT ... ON CONFLICT DO UPDATE` only if expired or same `user_id`/`connection_id`.

**Heartbeat:** batch `UPDATE expires_at` per client per interval.

---

## Snapshot `state` JSON shape

Store `assetId` — resolve `audio_url` from `project_assets` at read time (do not embed expiring URLs):

```json
{
  "bpm": 120,
  "timeSignature": "4/4",
  "metronomeOffset": 0,
  "durationSeconds": 120,
  "tracks": [
    {
      "id": 1,
      "sortOrder": 0,
      "name": "Drums",
      "gain": 0.8,
      "muted": false,
      "solo": false,
      "clips": [
        {
          "id": 10,
          "assetId": 42,
          "startTime": 0,
          "trimStart": 0,
          "trimEnd": 4.5,
          "duration": 4.5
        }
      ]
    }
  ]
}
```

Use `projectUtils.serializeProjectState()` for REST GET, snapshots, and plugin-payload.

---

## Restore algorithm (canonical)

Transaction; auto pre-restore snapshot first:

1. **Project metadata** — `UPDATE projects SET bpm, time_signature, metronome_offset, duration_seconds, revision = revision + 1 FROM snapshot.state`
2. **Tracks** — for each track in snapshot: `INSERT ... ON CONFLICT (id) DO UPDATE` name, sort_order, gain, mute, solo
3. **Clips in snapshot** — for each clip:
   - If row exists: `UPDATE project_clips SET deleted_at = NULL, start_time_seconds, trim_*, project_track_id`
   - Else: `INSERT` with snapshot id (or remap ids if collision — prefer stable ids from snapshot)
4. **Clips not in snapshot** — `UPDATE project_clips SET deleted_at = NOW() WHERE project_id = ? AND id NOT IN (snapshot clip ids) AND deleted_at IS NULL`
5. **Tracks with no clips after restore** — leave in place (empty tracks allowed)

Do **not** re-insert clip rows (deletes old rows via CASCADE). Do **not** hard-delete tracks.

Phase 2: broadcast `state` + `locks_clear` after restore.

---

## Indexes

```sql
CREATE INDEX idx_projects_owner ON projects(owner_id);
CREATE INDEX idx_projects_team ON projects(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_projects_camp ON projects(camp_id) WHERE camp_id IS NOT NULL;
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_project_tracks_project ON project_tracks(project_id);
CREATE INDEX idx_project_assets_project ON project_assets(project_id);
CREATE INDEX idx_project_assets_cleanup ON project_assets(project_id, last_referenced_at)
  WHERE deleted_at IS NULL AND processing_status = 'completed';
CREATE INDEX idx_project_clips_track ON project_clips(project_track_id);
CREATE INDEX idx_project_clips_asset ON project_clips(asset_id);
CREATE INDEX idx_project_clips_active ON project_clips(project_track_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_project_snapshots_project ON project_snapshots(project_id, created_at DESC);
CREATE INDEX idx_project_snapshot_assets_asset ON project_snapshot_assets(asset_id);
CREATE INDEX idx_project_invites_project ON project_invites(project_id);
CREATE INDEX idx_project_track_locks_expires ON project_track_locks(expires_at);
```

Add `updated_at` triggers on `projects`, `project_tracks`, `project_assets`, `project_clips` (match teams/camps).

---

## Migration notes

- Add DDL to `api/db-updates.txt` when implementing.
- Update `app documentation/db-schema.txt` after merge.
- **No FK to social `tracks`** — import is copy-only.
- Realtime tables in separate migration (Step 33).

---

## Access model

- Projects are **private, invite-only** by default.
- `GET /projects/:id` → **403** for non-members.
- `GET /projects` lists only projects where user is in `project_members`.
