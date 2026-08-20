-- Optional site-relative redirect path on outreach short links

ALTER TABLE outreach_links
  ADD COLUMN IF NOT EXISTS destination_path VARCHAR(500) NOT NULL DEFAULT '/';

ALTER TABLE outreach_links
  DROP CONSTRAINT IF EXISTS outreach_links_unique_effort;

ALTER TABLE outreach_links
  ADD CONSTRAINT outreach_links_unique_effort UNIQUE NULLS NOT DISTINCT (
    campaign_id,
    platform,
    method,
    message_variant_id,
    artist_handle,
    destination_path
  );
