import pool from '../config/db.js';
import { OUTREACH_CODE_LENGTH } from '../config/outreachConfig.js';

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

/**
 * Generate a unique short tracking code for an outreach link.
 * @returns {Promise<string>}
 */
export async function generateUniqueOutreachCode() {
  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    let code = '';
    for (let i = 0; i < OUTREACH_CODE_LENGTH; i++) {
      code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
    }

    const existing = await pool.query(
      'SELECT id FROM outreach_links WHERE code = $1',
      [code]
    );

    if (existing.rows.length === 0) {
      return code;
    }
    attempts++;
  }

  throw new Error('Failed to generate unique outreach code');
}

/**
 * Slugify a display name for campaigns / message variants.
 * @param {string} name
 * @returns {string}
 */
export function slugifyOutreachName(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }

  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
}

/**
 * Ensure slug is unique in the given table; append numeric suffix if needed.
 * @param {string} table - outreach_campaigns | outreach_message_variants
 * @param {string} baseSlug
 * @returns {Promise<string>}
 */
export async function ensureUniqueSlug(table, baseSlug) {
  const allowed = new Set(['outreach_campaigns', 'outreach_message_variants']);
  if (!allowed.has(table)) {
    throw new Error('Invalid table for slug uniqueness check');
  }

  let candidate = baseSlug || 'item';
  let suffix = 0;

  while (suffix < 1000) {
    const result = await pool.query(
      `SELECT id FROM ${table} WHERE slug = $1`,
      [candidate]
    );
    if (result.rows.length === 0) {
      return candidate;
    }
    suffix += 1;
    const truncated = baseSlug.slice(0, Math.max(1, 100 - String(suffix).length - 1));
    candidate = `${truncated}_${suffix}`;
  }

  throw new Error('Failed to generate unique slug');
}

/**
 * Normalize optional artist handle (strip leading @, trim).
 * @param {string|null|undefined} handle
 * @returns {string|null}
 */
export function normalizeArtistHandle(handle) {
  if (handle == null || typeof handle !== 'string') {
    return null;
  }
  const trimmed = handle.trim().replace(/^@+/, '');
  return trimmed.length > 0 ? trimmed.slice(0, 255) : null;
}

/**
 * Build public short URL for an outreach code.
 * @param {string} code
 * @returns {string}
 */
export function buildOutreachShortUrl(code) {
  const frontendUrl = (process.env.FRONTEND_URL || 'https://sterio.fm').replace(/\/$/, '');
  return `${frontendUrl}/r/${code}`;
}
