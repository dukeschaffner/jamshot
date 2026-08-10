-- Feature Flags Table
-- Allows dynamic enabling/disabling of features without code deployments

CREATE TABLE feature_flags (
  id SERIAL PRIMARY KEY,
  flag_key VARCHAR(255) UNIQUE NOT NULL,
  flag_value BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feature_flags_flag_key ON feature_flags(flag_key);

-- Trigger function for updated_at timestamp
CREATE OR REPLACE FUNCTION update_feature_flag_timestamp()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_feature_flag_timestamp
BEFORE UPDATE ON feature_flags
FOR EACH ROW
EXECUTE FUNCTION update_feature_flag_timestamp();

INSERT INTO feature_flags (flag_key, flag_value, description)
VALUES (
  'projects',
  true,
  'Enable collaborative Projects (web DAW, snapshots, plugin sync). When disabled, hides nav/routes and returns 404 on /api/projects/*.'
)
ON CONFLICT (flag_key) DO NOTHING;

INSERT INTO feature_flags (flag_key, flag_value, description)
VALUES (
  'moderation',
  false,
  'Enable moderation system for loop track uploads. When enabled, loop tracks are set to waiting_for_approval status until approved by admins.'
)
ON CONFLICT (flag_key) DO NOTHING;
