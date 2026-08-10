CREATE TYPE notification_type AS ENUM ('new_version', 'like', 'comment', 'featured', 'repost', 'follow', 'follow_request', 'mention', 'competition_winner', 'competition_entry', 'competition_started', 'competition_ended', 'project_invite', 'track_rejected');

CREATE TYPE activity_summary_frequency AS ENUM ('daily', 'weekly', 'monthly', 'none');

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  related_track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  related_user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  competition_id INT REFERENCES competitions(id) ON DELETE CASCADE,
  project_invite_id INT REFERENCES project_invites(id) ON DELETE CASCADE
); 

CREATE INDEX idx_notifications_user_id_created_at ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_id_is_read ON notifications(user_id, is_read);
CREATE INDEX idx_notifications_type ON notifications(type);


CREATE TABLE notification_preferences (
  id SERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  activity_summary_frequency activity_summary_frequency NOT NULL DEFAULT 'weekly',
  collab_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id)
);

CREATE INDEX idx_notification_preferences_user_id ON notification_preferences(user_id);
CREATE INDEX idx_notification_preferences_activity_summary ON notification_preferences(activity_summary_frequency);

-- Trigger function to automatically create notification preferences for new users
CREATE OR REPLACE FUNCTION create_default_notification_preferences()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notification_preferences (user_id, activity_summary_frequency, collab_email_enabled)
  VALUES (NEW.id, 'weekly', TRUE);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for new users
DROP TRIGGER IF EXISTS trigger_create_notification_preferences ON users;
CREATE TRIGGER trigger_create_notification_preferences
  AFTER INSERT ON users
  FOR EACH ROW
  EXECUTE FUNCTION create_default_notification_preferences();

-- Add updated_at trigger function for notification_preferences
CREATE OR REPLACE FUNCTION update_notification_preferences_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create updated_at trigger
CREATE TRIGGER trigger_notification_preferences_updated_at
  BEFORE UPDATE ON notification_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_notification_preferences_timestamp();

CREATE INDEX idx_notifications_competition_id ON notifications(competition_id);

CREATE INDEX idx_notifications_project_invite_id ON notifications(project_invite_id) WHERE project_invite_id IS NOT NULL;
