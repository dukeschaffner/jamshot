INSERT INTO feature_flags (flag_key, flag_value, description)
VALUES (
  'projects',
  true,
  'Enable collaborative Projects (web DAW, snapshots, plugin sync). When disabled, hides nav/routes and returns 404 on /api/projects/*.'
)
ON CONFLICT (flag_key) DO NOTHING;

CREATE TABLE IF NOT EXISTS projects (
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

CREATE TABLE IF NOT EXISTS project_members (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_members_one_owner
  ON project_members (project_id) WHERE role = 'owner';

CREATE TABLE IF NOT EXISTS project_tracks (
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

CREATE TABLE IF NOT EXISTS project_assets (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  storage_key VARCHAR(500),
  audio_url VARCHAR(1000),
  waveform_url VARCHAR(1000),
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

CREATE TABLE IF NOT EXISTS project_clips (
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

CREATE TABLE IF NOT EXISTS project_snapshots (
  id SERIAL PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  label VARCHAR(200),
  snapshot_kind VARCHAR(20) NOT NULL DEFAULT 'manual'
    CHECK (snapshot_kind IN ('manual', 'auto', 'pre_restore')),
  revision BIGINT NOT NULL,
  state JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_snapshot_assets (
  snapshot_id INT NOT NULL REFERENCES project_snapshots(id) ON DELETE CASCADE,
  asset_id INT NOT NULL REFERENCES project_assets(id) ON DELETE RESTRICT,
  PRIMARY KEY (snapshot_id, asset_id)
);

CREATE TABLE IF NOT EXISTS project_invites (
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

CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_projects_team ON projects(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_camp ON projects(camp_id) WHERE camp_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_members_user ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_tracks_project ON project_tracks(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assets_project ON project_assets(project_id);
CREATE INDEX IF NOT EXISTS idx_project_assets_cleanup ON project_assets(project_id, last_referenced_at)
  WHERE deleted_at IS NULL AND processing_status = 'completed';
CREATE INDEX IF NOT EXISTS idx_project_clips_track ON project_clips(project_track_id);
CREATE INDEX IF NOT EXISTS idx_project_clips_asset ON project_clips(asset_id);
CREATE INDEX IF NOT EXISTS idx_project_clips_active ON project_clips(project_track_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_project_snapshots_project ON project_snapshots(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_snapshot_assets_asset ON project_snapshot_assets(asset_id);
CREATE INDEX IF NOT EXISTS idx_project_invites_project ON project_invites(project_id);

CREATE OR REPLACE FUNCTION update_project_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_project_timestamp ON projects;
CREATE TRIGGER update_project_timestamp
BEFORE UPDATE ON projects
FOR EACH ROW
EXECUTE FUNCTION update_project_timestamp();

CREATE OR REPLACE FUNCTION update_project_track_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_project_track_timestamp ON project_tracks;
CREATE TRIGGER update_project_track_timestamp
BEFORE UPDATE ON project_tracks
FOR EACH ROW
EXECUTE FUNCTION update_project_track_timestamp();

CREATE OR REPLACE FUNCTION update_project_asset_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_project_asset_timestamp ON project_assets;
CREATE TRIGGER update_project_asset_timestamp
BEFORE UPDATE ON project_assets
FOR EACH ROW
EXECUTE FUNCTION update_project_asset_timestamp();

CREATE OR REPLACE FUNCTION update_project_clip_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_project_clip_timestamp ON project_clips;
CREATE TRIGGER update_project_clip_timestamp
BEFORE UPDATE ON project_clips
FOR EACH ROW
EXECUTE FUNCTION update_project_clip_timestamp();

CREATE TABLE IF NOT EXISTS project_ws_connections (
  connection_id VARCHAR(128) PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  editing_track_id INT REFERENCES project_tracks(id) ON DELETE SET NULL,
  gateway_domain VARCHAR(255),
  gateway_stage VARCHAR(64),
  connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_ws_connection_auth (
  connection_id VARCHAR(128) PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_track_locks (
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  track_id INT NOT NULL REFERENCES project_tracks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (project_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_project_ws_connections_project
  ON project_ws_connections(project_id);
CREATE INDEX IF NOT EXISTS idx_project_ws_connections_user
  ON project_ws_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_project_track_locks_expires
  ON project_track_locks(expires_at);

CREATE TABLE IF NOT EXISTS project_ws_op_dedup (
  connection_id VARCHAR(128) NOT NULL,
  op_id VARCHAR(64) NOT NULL,
  revision BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (connection_id, op_id)
);

CREATE INDEX IF NOT EXISTS idx_project_ws_op_dedup_created
  ON project_ws_op_dedup(created_at);

CREATE TABLE IF NOT EXISTS project_metadata_locks (
  project_id INT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_metadata_locks_expires
  ON project_metadata_locks(expires_at);

ALTER TABLE project_assets ADD COLUMN IF NOT EXISTS waveform_url VARCHAR(1000);

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS access_revoked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_deletion_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retention_reason TEXT,
  ADD COLUMN IF NOT EXISTS deletion_warning_7d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_warning_1d_sent_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_projects_scheduled_deletion
  ON projects (scheduled_deletion_at)
  WHERE scheduled_deletion_at IS NOT NULL;

ALTER TABLE project_invites
  ADD COLUMN IF NOT EXISTS invited_user_id TEXT REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS project_invite_id INT REFERENCES project_invites(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_project_invites_invited_user
  ON project_invites(invited_user_id)
  WHERE invited_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_project_invite_id
  ON notifications(project_invite_id)
  WHERE project_invite_id IS NOT NULL;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS source_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_root_id INTEGER;

ALTER TABLE project_assets
  ADD COLUMN IF NOT EXISTS source_track_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_project_assets_source_track
  ON project_assets(project_id, source_track_id);

CREATE INDEX IF NOT EXISTS idx_projects_source_root
  ON projects(source_root_id)
  WHERE source_root_id IS NOT NULL;

ALTER TABLE project_clips
  ADD COLUMN IF NOT EXISTS loop_end_seconds FLOAT;

CREATE INDEX IF NOT EXISTS idx_project_ws_connections_last_seen
  ON project_ws_connections(project_id, last_seen_at);

ALTER TABLE project_ws_connections
  ADD COLUMN IF NOT EXISTS gateway_domain VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gateway_stage VARCHAR(64);