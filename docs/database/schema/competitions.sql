-- Create competitions table
CREATE TABLE competitions (
  id SERIAL PRIMARY KEY,
  startdate TIMESTAMP NOT NULL,
  enddate TIMESTAMP NOT NULL,
  track_id INT REFERENCES tracks(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(255), -- Used for sponsored competitions only
  description TEXT, -- Used for sponsored competitions only
  prize_amount INT, -- In cents, null for sponsored competitions with non-cash prizes
  host_id TEXT REFERENCES users(id) ON DELETE SET NULL, -- Null for sponsored competitions
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  sponsored BOOLEAN NOT NULL DEFAULT FALSE,
  sponsor_name VARCHAR(255), -- Used for sponsored competitions only
  image_url VARCHAR(1000), -- Used for sponsored competitions only
  voucher_code VARCHAR(100), -- For gifted/preconfigured competitions
  winner_selection_method VARCHAR(20) NOT NULL CHECK (winner_selection_method IN ('curated', 'automated')),
  winner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  backup_winner_id TEXT REFERENCES users(id) ON DELETE SET NULL, -- Determined at competition end if not automated
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for competitions table
CREATE INDEX idx_competitions_track_id ON competitions(track_id);
CREATE INDEX idx_competitions_host_id ON competitions(host_id);
CREATE INDEX idx_competitions_startdate ON competitions(startdate);
CREATE INDEX idx_competitions_enddate ON competitions(enddate);
CREATE INDEX idx_competitions_pinned ON competitions(pinned);
CREATE INDEX idx_competitions_sponsored ON competitions(sponsored);
CREATE INDEX idx_competitions_winner_id ON competitions(winner_id);

-- Add indexes for competition entries
CREATE INDEX idx_tracks_is_competition_entry ON tracks(is_competition_entry);
CREATE INDEX idx_tracks_competition_id ON tracks(competition_id);

-- Create trigger to automatically update the updated_at timestamp for competitions
CREATE OR REPLACE FUNCTION update_competition_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_competition_timestamp
BEFORE UPDATE ON competitions
FOR EACH ROW
EXECUTE FUNCTION update_competition_timestamp();
