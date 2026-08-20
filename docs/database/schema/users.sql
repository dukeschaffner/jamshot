CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(40) NOT NULL,
  username VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255), -- Hashed with bcrypt (nullable for OAuth users)
  profile_pic_url VARCHAR(255), -- S3 URL for profile pic
  bio TEXT, -- Optional short bio
  tiktok_url VARCHAR(255), -- Optional TikTok profile URL
  youtube_url VARCHAR(255), -- Optional YouTube profile URL
  instagram_url VARCHAR(255), -- Optional Instagram profile URL
  facebook_url VARCHAR(255), -- Optional Facebook profile URL
  x_url VARCHAR(255), -- Optional X profile URL
  verified BOOL not null default false, -- Reserved for well-known artists
  email_verified BOOL not null default false, -- For email verification
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_private BOOLEAN NOT NULL DEFAULT FALSE,
  is_supporter BOOLEAN NOT NULL DEFAULT FALSE,
  terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  privacy_policy_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  policy_accepted_at TIMESTAMP,
  policy_accepted_ip VARCHAR(45),
  policy_version VARCHAR(10) DEFAULT '1.0',
  subscription_tier VARCHAR(20) NOT NULL DEFAULT 'free',
  subscription_expires_at TIMESTAMP,
  stripe_customer_id VARCHAR(255),
  stripe_subscription_id VARCHAR(255),
  date_of_birth DATE,
  analytics_consent BOOLEAN NOT NULL DEFAULT FALSE,
  analytics_consent_at TIMESTAMP,
  analytics_consent_ip VARCHAR(45),
  stripe_account_id VARCHAR(255),
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  outreach_link_id INT -- FK added in outreach.sql (after outreach_links exists)
);

CREATE INDEX IF NOT EXISTS idx_users_outreach_link_id ON users(outreach_link_id);

CREATE INDEX idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX idx_users_subscription_expires_at ON users(subscription_expires_at);

CREATE INDEX IF NOT EXISTS idx_users_privacy_dob ON users(privacy_policy_accepted, date_of_birth) WHERE privacy_policy_accepted = true AND date_of_birth IS NOT NULL;
