CREATE TABLE likes (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, track_id) -- Prevent duplicate likes
);



CREATE TABLE comments (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  parent_comment_id INT REFERENCES comments(id) ON DELETE CASCADE
);



CREATE TABLE featured_tracks (
  id SERIAL PRIMARY KEY,
  track_id INT UNIQUE REFERENCES tracks(id) ON DELETE CASCADE,
  featured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP -- When it drops off the featured page
);



CREATE TABLE follows (
  id SERIAL PRIMARY KEY,
  follower_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  following_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (follower_id, following_id) -- No duplicate follows
);

CREATE TABLE reposts (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, track_id) -- Prevent duplicate reposts
);

CREATE TABLE follow_requests (
  id SERIAL PRIMARY KEY,
  requester_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  target_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (requester_id, target_id) -- Prevent duplicate requests
);

-- Create trigger to automatically update the updated_at timestamp when a comment is edited
CREATE OR REPLACE FUNCTION update_comment_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_comment_timestamp
BEFORE UPDATE ON comments
FOR EACH ROW
EXECUTE FUNCTION update_comment_timestamp();

CREATE TABLE track_mentions (
  id SERIAL PRIMARY KEY,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  mentioned_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  mentioned_by_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (track_id, mentioned_user_id) -- Prevent duplicate mentions
);

CREATE INDEX idx_track_mentions_track_id ON track_mentions(track_id);
CREATE INDEX idx_track_mentions_mentioned_user_id ON track_mentions(mentioned_user_id);
CREATE INDEX idx_track_mentions_mentioned_by_user_id ON track_mentions(mentioned_by_user_id);

-- Add function to extract mentions from text
CREATE OR REPLACE FUNCTION extract_mentions(text_content TEXT)
RETURNS TEXT[] AS $$
DECLARE
  mentions TEXT[] := '{}';
  match TEXT;
BEGIN
  -- Find all @username patterns in the text
  FOR match IN SELECT regexp_matches(text_content, '@([a-zA-Z0-9_]+)', 'g')
  LOOP
    mentions := array_append(mentions, match);
  END LOOP;
  
  RETURN mentions;
END;
$$ LANGUAGE plpgsql;

CREATE INDEX IF NOT EXISTS idx_likes_track_id_created_at ON likes(track_id, created_at);
CREATE INDEX IF NOT EXISTS idx_comments_track_id_created_at ON comments(track_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reposts_track_id_created_at ON reposts(track_id, created_at);
CREATE INDEX IF NOT EXISTS idx_follows_following_id_created_at ON follows(following_id, created_at);
