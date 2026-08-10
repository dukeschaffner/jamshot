CREATE TABLE teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  product_version VARCHAR(20) NOT NULL CHECK (product_version IN ('5_users', '10_users', '25_users', '50_users', '100_users', 'enterprise')),
  stripe_subscription_id VARCHAR(255), -- Stripe subscription ID for recurring billing
  stripe_customer_id VARCHAR(255), -- Stripe customer ID
  subscription_status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (subscription_status IN ('active', 'canceled', 'past_due', 'unpaid', 'trialing')),
  subscription_expires_at TIMESTAMP, -- For tracking subscription end date
  team_code VARCHAR(64) UNIQUE NOT NULL, -- For invite links
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create team_members junction table (many-to-many relationship)
CREATE TABLE team_members (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  team_id INT REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'contributor', 'viewer', 'owner')) DEFAULT 'contributor',
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, team_id) -- User can only be in each team once
);

-- Create team_folders table for organizing team tracks
CREATE TABLE team_folders (
  id SERIAL PRIMARY KEY,
  team_id INT REFERENCES teams(id) ON DELETE CASCADE NOT NULL,
  name VARCHAR(100) NOT NULL,
  parent_folder_id INT REFERENCES team_folders(id) ON DELETE CASCADE, -- For nested folders
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (team_id, name, parent_folder_id) -- Folder names must be unique within a team and parent folder
);


-- Create indexes for performance
CREATE INDEX idx_teams_created_by ON teams(created_by);
CREATE INDEX idx_teams_product_version ON teams(product_version);
CREATE INDEX idx_teams_subscription_status ON teams(subscription_status);
CREATE INDEX idx_teams_stripe_subscription_id ON teams(stripe_subscription_id);
CREATE INDEX idx_teams_stripe_customer_id ON teams(stripe_customer_id);
CREATE INDEX idx_teams_team_code ON teams(team_code);

CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_role ON team_members(role);

CREATE INDEX idx_team_folders_team_id ON team_folders(team_id);
CREATE INDEX idx_team_folders_parent_folder_id ON team_folders(parent_folder_id);

-- Create trigger to automatically update the updated_at timestamp for teams
CREATE OR REPLACE FUNCTION update_team_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_team_timestamp
BEFORE UPDATE ON teams
FOR EACH ROW
EXECUTE FUNCTION update_team_timestamp();

-- Create trigger to automatically update the updated_at timestamp for team_folders
CREATE OR REPLACE FUNCTION update_team_folder_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_team_folder_timestamp
BEFORE UPDATE ON team_folders
FOR EACH ROW
EXECUTE FUNCTION update_team_folder_timestamp();
