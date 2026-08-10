CREATE TABLE tracks (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE, -- Who uploaded it
  title VARCHAR(100) NOT NULL,
  audio_url VARCHAR(1000) NOT NULL, -- S3 URL for the clip
  combined_audio_url VARCHAR(1000),
  waveform_url VARCHAR(1000), -- R2 URL for pre-computed waveform peaks
  combined_waveform_url VARCHAR(1000), -- R2 URL for combined waveform peaks
  duration FLOAT NOT NULL, -- Seconds, for UI display
  layer INT NOT NULL, -- 0-4 (max 5 collaborators)
  parent_track_id INT REFERENCES tracks(id) ON DELETE SET NULL, -- Null for originals, links to parent for versions
  root_id INT REFERENCES tracks(id) ON DELETE SET NULL, -- Root track of the collaboration tree
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  play_count INT DEFAULT 0,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  is_loop BOOLEAN NOT NULL DEFAULT FALSE, -- Indicates if track is a loop (disables arrangement features)
  metronome_bpm INTEGER,
  metronome_offset FLOAT DEFAULT 0,
  time_signature VARCHAR(10) NOT NULL DEFAULT '4/4',
  secret_token VARCHAR(64), -- For secure sharing of private tracks
  allow_download BOOLEAN NOT NULL DEFAULT TRUE,
  is_competition_entry BOOLEAN NOT NULL DEFAULT FALSE,
  competition_id INT REFERENCES competitions(id) ON DELETE SET NULL, -- used to indicate both competition entries and hosted competitions
  processing_status TEXT DEFAULT 'completed' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'waiting_for_approval', 'rejected')),
  processing_error TEXT,
  rejection_reason TEXT,
  team_id INT REFERENCES teams(id) ON DELETE CASCADE,
  team_folder_id INT REFERENCES team_folders(id) ON DELETE SET NULL,
  camp_id INT REFERENCES camps(id) ON DELETE CASCADE,
  room_id INT REFERENCES rooms(id) ON DELETE CASCADE,
  key VARCHAR(10), -- Musical key (e.g., "C Major", "A Minor")
  guid UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  collab_count INT NOT NULL DEFAULT 0, -- Number of collaborations (maintained by application logic)
  like_count INT NOT NULL DEFAULT 0, -- Number of likes (maintained by application logic)
  repost_count INT NOT NULL DEFAULT 0, -- Number of reposts (maintained by application logic)
  comment_count INT NOT NULL DEFAULT 0 -- Number of comments (maintained by application logic)
);

CREATE INDEX idx_tracks_guid ON tracks(guid);
CREATE INDEX idx_tracks_processing_status ON tracks(processing_status);
CREATE INDEX idx_tracks_root_id_created_at ON tracks(root_id, created_at);
CREATE INDEX idx_tracks_processing_status_root_id_created_at ON tracks(processing_status, root_id, created_at) WHERE processing_status = 'waiting_for_approval';
CREATE INDEX idx_tracks_parent_status_created_id
  ON tracks (parent_track_id, processing_status, created_at, id);

CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON tracks(user_id, created_at);

CREATE INDEX idx_tracks_is_competition_entry ON tracks(is_competition_entry);
CREATE INDEX idx_tracks_competition_id ON tracks(competition_id);

CREATE INDEX idx_tracks_team_id ON tracks(team_id);
CREATE INDEX idx_tracks_team_folder_id ON tracks(team_folder_id);

CREATE INDEX idx_tracks_camp_id ON tracks(camp_id);
CREATE INDEX idx_tracks_room_id ON tracks(room_id);
