import pool from '../config/db.js';
import {
  OUTREACH_METHODS,
  OUTREACH_PLATFORMS,
  OUTREACH_CODE_QUERY_PARAM,
} from '../config/outreachConfig.js';
import { getGeolocationFromRequest } from '../utils/geolocation.js';
import {
  buildOutreachShortUrl,
  generateUniqueOutreachCode,
  normalizeArtistHandle,
  resolveOutreachSlug,
} from '../utils/outreachCodeUtils.js';
import {
  buildOutreachRedirectUrl,
  normalizeOutreachDestinationPath,
} from '../utils/outreachDestinationPath.js';

function userFacingError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.userFacing = true;
  return err;
}

export function getOutreachMeta() {
  return {
    platforms: OUTREACH_PLATFORMS,
    methods: OUTREACH_METHODS,
  };
}

export async function listCampaigns() {
  const result = await pool.query(
    `SELECT c.id, c.name, c.slug, c.created_by, c.created_at, c.updated_at,
            COUNT(l.id)::int AS link_count
     FROM outreach_campaigns c
     LEFT JOIN outreach_links l ON l.campaign_id = c.id
     GROUP BY c.id
     ORDER BY c.created_at DESC`
  );
  return result.rows;
}

export async function getCampaignById(campaignId) {
  const result = await pool.query(
    `SELECT id, name, slug, created_by, created_at, updated_at
     FROM outreach_campaigns
     WHERE id = $1`,
    [campaignId]
  );
  return result.rows[0] || null;
}

export async function createCampaign({ name, slug, createdBy }) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw userFacingError('Campaign name is required');
  }

  const uniqueSlug = await resolveOutreachSlug('outreach_campaigns', slug);

  try {
    const result = await pool.query(
      `INSERT INTO outreach_campaigns (name, slug, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug, created_by, created_at, updated_at`,
      [name.trim(), uniqueSlug, createdBy]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw userFacingError('A campaign with this slug already exists');
    }
    throw error;
  }
}

export async function listMessageVariants() {
  const result = await pool.query(
    `SELECT id, name, slug, body, created_by, created_at, updated_at
     FROM outreach_message_variants
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function getMessageVariantById(variantId) {
  const result = await pool.query(
    `SELECT id, name, slug, body, created_by, created_at, updated_at
     FROM outreach_message_variants
     WHERE id = $1`,
    [variantId]
  );
  return result.rows[0] || null;
}

export async function createMessageVariant({ name, slug, body, createdBy }) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw userFacingError('Message variant name is required');
  }

  const uniqueSlug = await resolveOutreachSlug('outreach_message_variants', slug);

  try {
    const result = await pool.query(
      `INSERT INTO outreach_message_variants (name, slug, body, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, slug, body, created_by, created_at, updated_at`,
      [name.trim(), uniqueSlug, body ?? null, createdBy]
    );
    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') {
      throw userFacingError('A message variant with this slug already exists');
    }
    throw error;
  }
}

export async function listLinks({ campaignId } = {}) {
  const params = [];
  let where = '';
  if (campaignId != null) {
    params.push(campaignId);
    where = `WHERE l.campaign_id = $${params.length}`;
  }

  const result = await pool.query(
    `SELECT l.id, l.campaign_id, l.message_variant_id, l.platform, l.method,
            l.artist_handle, l.destination_path, l.code, l.created_by,
            l.created_at, l.updated_at,
            c.name AS campaign_name, c.slug AS campaign_slug,
            v.name AS message_variant_name, v.slug AS message_variant_slug,
            COUNT(cl.id)::int AS click_count
     FROM outreach_links l
     JOIN outreach_campaigns c ON c.id = l.campaign_id
     JOIN outreach_message_variants v ON v.id = l.message_variant_id
     LEFT JOIN outreach_clicks cl ON cl.outreach_link_id = l.id
     ${where}
     GROUP BY l.id, c.name, c.slug, v.name, v.slug
     ORDER BY l.created_at DESC`,
    params
  );

  return result.rows.map((row) => ({
    ...row,
    short_url: buildOutreachShortUrl(row.code),
  }));
}

export async function createLink({
  campaignId,
  messageVariantId,
  platform,
  method,
  artistHandle,
  destinationPath,
  createdBy,
}) {
  if (!campaignId) {
    throw userFacingError('Campaign is required');
  }
  if (!messageVariantId) {
    throw userFacingError('Message variant is required');
  }
  if (!OUTREACH_PLATFORMS.includes(platform)) {
    throw userFacingError('Invalid platform');
  }
  if (!OUTREACH_METHODS.includes(method)) {
    throw userFacingError('Invalid method');
  }

  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    throw userFacingError('Campaign not found', 404);
  }

  const variant = await getMessageVariantById(messageVariantId);
  if (!variant) {
    throw userFacingError('Message variant not found', 404);
  }

  const normalizedHandle = normalizeArtistHandle(artistHandle);
  const normalizedDestination = normalizeOutreachDestinationPath(destinationPath);
  const code = await generateUniqueOutreachCode();

  try {
    const result = await pool.query(
      `INSERT INTO outreach_links
         (campaign_id, message_variant_id, platform, method, artist_handle,
          destination_path, code, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, campaign_id, message_variant_id, platform, method, artist_handle,
                 destination_path, code, created_by, created_at, updated_at`,
      [
        campaignId,
        messageVariantId,
        platform,
        method,
        normalizedHandle,
        normalizedDestination,
        code,
        createdBy,
      ]
    );

    const link = result.rows[0];
    return {
      ...link,
      campaign_slug: campaign.slug,
      message_variant_slug: variant.slug,
      short_url: buildOutreachShortUrl(link.code),
    };
  } catch (error) {
    if (error.code === '23505') {
      throw userFacingError(
        'An outreach link with this campaign, platform, method, message, artist, and destination already exists'
      );
    }
    throw error;
  }
}

/**
 * Record a click and return the Sterio redirect URL with UTM + oc params.
 */
export async function resolveAndRecordClick(code, requestMeta = {}) {
  if (!code || typeof code !== 'string') {
    throw userFacingError('Invalid outreach code', 404);
  }

  const linkResult = await pool.query(
    `SELECT l.id, l.code, l.platform, l.method, l.destination_path,
            c.slug AS campaign_slug,
            v.slug AS message_variant_slug
     FROM outreach_links l
     JOIN outreach_campaigns c ON c.id = l.campaign_id
     JOIN outreach_message_variants v ON v.id = l.message_variant_id
     WHERE l.code = $1`,
    [code.trim()]
  );

  if (linkResult.rows.length === 0) {
    throw userFacingError('Outreach link not found', 404);
  }

  const link = linkResult.rows[0];
  const ipAddress = requestMeta.ipAddress || null;
  const userAgent = requestMeta.userAgent || null;
  const referrerUrl = requestMeta.referrerUrl || null;

  let geoData = { country_code: null, region: null, city: null };
  try {
    geoData = await getGeolocationFromRequest(requestMeta.headers, ipAddress);
  } catch {
    // Continue without geolocation
  }

  await pool.query(
    `INSERT INTO outreach_clicks
       (outreach_link_id, user_agent, ip_address, referrer_url, country_code, region, city)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      link.id,
      userAgent,
      ipAddress,
      referrerUrl,
      geoData.country_code,
      geoData.region,
      geoData.city,
    ]
  );

  const redirectUrl = buildOutreachRedirectUrl({
    destinationPath: link.destination_path,
    platform: link.platform,
    method: link.method,
    campaignSlug: link.campaign_slug,
    messageVariantSlug: link.message_variant_slug,
    code: link.code,
    outreachCodeParam: OUTREACH_CODE_QUERY_PARAM,
  });

  return {
    redirectUrl,
    code: link.code,
  };
}

/**
 * First-touch attribution: set users.outreach_link_id if currently null.
 */
export async function attributeUserToOutreachCode(userId, outreachCode) {
  if (!userId || !outreachCode || typeof outreachCode !== 'string') {
    return { attributed: false };
  }

  const linkResult = await pool.query(
    'SELECT id FROM outreach_links WHERE code = $1',
    [outreachCode.trim()]
  );

  if (linkResult.rows.length === 0) {
    throw userFacingError('Outreach link not found', 404);
  }

  const linkId = linkResult.rows[0].id;

  const result = await pool.query(
    `UPDATE users
     SET outreach_link_id = $1
     WHERE id = $2 AND outreach_link_id IS NULL
     RETURNING id, outreach_link_id`,
    [linkId, userId]
  );

  if (result.rows.length === 0) {
    // Already attributed or user missing — treat as no-op success
    const existing = await pool.query(
      'SELECT id, outreach_link_id FROM users WHERE id = $1',
      [userId]
    );
    if (existing.rows.length === 0) {
      throw userFacingError('User not found', 404);
    }
    return {
      attributed: false,
      outreach_link_id: existing.rows[0].outreach_link_id,
    };
  }

  return {
    attributed: true,
    outreach_link_id: result.rows[0].outreach_link_id,
  };
}
