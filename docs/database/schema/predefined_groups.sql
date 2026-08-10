-- Create predefined_groups table
CREATE TABLE predefined_groups (
  id SERIAL PRIMARY KEY,
  group_name VARCHAR(100) UNIQUE NOT NULL, -- URL slug (e.g., 'life-church')
  display_name VARCHAR(255), -- Human readable name (e.g., 'Life Church Worship Team')
  type VARCHAR(10) NOT NULL CHECK (type IN ('team', 'camp')),
  visits INT NOT NULL DEFAULT 0,
  has_been_visited BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for predefined_groups
CREATE INDEX idx_predefined_groups_group_name ON predefined_groups(group_name);
CREATE INDEX idx_predefined_groups_type ON predefined_groups(type);

-- Create group_visits table for detailed visit tracking
CREATE TABLE group_visits (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES predefined_groups(id) ON DELETE CASCADE NOT NULL,
  visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_address VARCHAR(45),
  referrer_url TEXT,
  country_code VARCHAR(2),
  region VARCHAR(100),
  city VARCHAR(100)
);

-- Create indexes for group_visits
CREATE INDEX idx_group_visits_group_id ON group_visits(group_id);
CREATE INDEX idx_group_visits_visited_at ON group_visits(visited_at);

-- Create trigger to automatically update the updated_at timestamp for predefined_groups
CREATE OR REPLACE FUNCTION update_predefined_group_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_predefined_group_timestamp
BEFORE UPDATE ON predefined_groups
FOR EACH ROW
EXECUTE FUNCTION update_predefined_group_timestamp();
