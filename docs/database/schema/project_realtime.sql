-- Project realtime / WebSocket tables (see projects-plan/database.md)

CREATE TABLE project_ws_connections (
  connection_id VARCHAR(128) PRIMARY KEY,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  editing_track_id INT REFERENCES project_tracks(id) ON DELETE SET NULL,
  gateway_domain VARCHAR(255),
  gateway_stage VARCHAR(64),
  connected_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_ws_connection_auth (
  connection_id VARCHAR(128) PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_track_locks (
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  track_id INT NOT NULL REFERENCES project_tracks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (project_id, track_id)
);

CREATE INDEX idx_project_ws_connections_project
  ON project_ws_connections(project_id);
CREATE INDEX idx_project_ws_connections_user
  ON project_ws_connections(user_id);
CREATE INDEX idx_project_ws_connections_last_seen
  ON project_ws_connections(project_id, last_seen_at);
CREATE INDEX idx_project_track_locks_expires
  ON project_track_locks(expires_at);

CREATE TABLE project_ws_op_dedup (
  connection_id VARCHAR(128) NOT NULL,
  op_id VARCHAR(64) NOT NULL,
  revision BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (connection_id, op_id)
);

CREATE INDEX idx_project_ws_op_dedup_created
  ON project_ws_op_dedup(created_at);

CREATE TABLE project_metadata_locks (
  project_id INT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  connection_id VARCHAR(128) NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX idx_project_metadata_locks_expires
  ON project_metadata_locks(expires_at);
