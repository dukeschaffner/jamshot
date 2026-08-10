CREATE TABLE user_bans (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ban_type VARCHAR(20) NOT NULL, -- 'upload', 'full' (future)
  reason TEXT,
  created_by TEXT REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP -- NULL = permanent
);

CREATE INDEX idx_user_bans_user_type_expires
  ON user_bans (user_id, ban_type, expires_at);
