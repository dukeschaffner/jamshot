-- Outreach tracking: campaigns, message variants, short links, clicks, user attribution

CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_slug ON outreach_campaigns(slug);
CREATE INDEX IF NOT EXISTS idx_outreach_campaigns_created_at ON outreach_campaigns(created_at);

CREATE TABLE IF NOT EXISTS outreach_message_variants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  body TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outreach_message_variants_slug ON outreach_message_variants(slug);
CREATE INDEX IF NOT EXISTS idx_outreach_message_variants_created_at ON outreach_message_variants(created_at);

CREATE TABLE IF NOT EXISTS outreach_links (
  id SERIAL PRIMARY KEY,
  campaign_id INT NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  message_variant_id INT NOT NULL REFERENCES outreach_message_variants(id) ON DELETE RESTRICT,
  platform VARCHAR(50) NOT NULL,
  method VARCHAR(50) NOT NULL,
  artist_handle VARCHAR(255),
  code VARCHAR(16) UNIQUE NOT NULL,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT outreach_links_unique_effort UNIQUE NULLS NOT DISTINCT (
    campaign_id,
    platform,
    method,
    message_variant_id,
    artist_handle
  )
);

CREATE INDEX IF NOT EXISTS idx_outreach_links_campaign_id ON outreach_links(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_links_message_variant_id ON outreach_links(message_variant_id);
CREATE INDEX IF NOT EXISTS idx_outreach_links_code ON outreach_links(code);
CREATE INDEX IF NOT EXISTS idx_outreach_links_created_at ON outreach_links(created_at);

CREATE TABLE IF NOT EXISTS outreach_clicks (
  id SERIAL PRIMARY KEY,
  outreach_link_id INT NOT NULL REFERENCES outreach_links(id) ON DELETE CASCADE,
  visited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_agent TEXT,
  ip_address VARCHAR(45),
  referrer_url TEXT,
  country_code VARCHAR(2),
  region VARCHAR(100),
  city VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_outreach_clicks_link_id ON outreach_clicks(outreach_link_id);
CREATE INDEX IF NOT EXISTS idx_outreach_clicks_visited_at ON outreach_clicks(visited_at);

CREATE OR REPLACE FUNCTION update_outreach_campaign_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_outreach_campaign_timestamp ON outreach_campaigns;
CREATE TRIGGER update_outreach_campaign_timestamp
BEFORE UPDATE ON outreach_campaigns
FOR EACH ROW
EXECUTE FUNCTION update_outreach_campaign_timestamp();

CREATE OR REPLACE FUNCTION update_outreach_message_variant_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_outreach_message_variant_timestamp ON outreach_message_variants;
CREATE TRIGGER update_outreach_message_variant_timestamp
BEFORE UPDATE ON outreach_message_variants
FOR EACH ROW
EXECUTE FUNCTION update_outreach_message_variant_timestamp();

CREATE OR REPLACE FUNCTION update_outreach_link_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_outreach_link_timestamp ON outreach_links;
CREATE TRIGGER update_outreach_link_timestamp
BEFORE UPDATE ON outreach_links
FOR EACH ROW
EXECUTE FUNCTION update_outreach_link_timestamp();

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS outreach_link_id INT REFERENCES outreach_links(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_outreach_link_id ON users(outreach_link_id);
