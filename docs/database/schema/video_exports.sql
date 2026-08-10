-- Video exports table for tracking video export jobs
CREATE TABLE video_exports (
  id SERIAL PRIMARY KEY,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  video_url VARCHAR(1000), -- R2 URL when completed
  start_time FLOAT, -- Start timestamp in seconds
  duration FLOAT, -- Duration in seconds
  error_message TEXT, -- User-friendly error message
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_video_exports_user_id ON video_exports(user_id);
CREATE INDEX idx_video_exports_track_id ON video_exports(track_id);
CREATE INDEX idx_video_exports_status ON video_exports(status);
CREATE INDEX idx_video_exports_created_at ON video_exports(created_at);

-- Trigger to automatically update updated_at timestamp for video_exports
CREATE OR REPLACE FUNCTION update_video_export_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_video_export_timestamp
BEFORE UPDATE ON video_exports
FOR EACH ROW
EXECUTE FUNCTION update_video_export_timestamp();
