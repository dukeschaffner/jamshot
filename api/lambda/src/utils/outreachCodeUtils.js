import pool from '../config/db.js';
import {
  OUTREACH_CODE_LENGTH,
  OUTREACH_RANDOM_SLUG_LENGTH,
} from '../config/outreachConfig.js';
import { getOutreachShortUrlKind } from './outreachDestinationPath.js';

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const SLUG_TABLES = new Set(['outreach_campaigns', 'outreach_message_variants']);

function randomToken(length) {
  let token = '';
  for (let i = 0; i < length; i++) {
    token += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  }
  return token;
}

/**
 * Generate a unique short tracking code for an outreach link.
 * @returns {Promise<string>}
 */
export async function generateUniqueOutreachCode() {
  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    const code = randomToken(OUTREACH_CODE_LENGTH);
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
 * Random unique slug when none is provided (used in UTM params).
 * @param {string} table - outreach_campaigns | outreach_message_variants
 * @returns {Promise<string>}
 */
export async function generateUniqueRandomSlug(table) {
  if (!SLUG_TABLES.has(table)) {
    throw new Error('Invalid table for slug uniqueness check');
  }

  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    const slug = randomToken(OUTREACH_RANDOM_SLUG_LENGTH);
    const existing = await pool.query(
      `SELECT id FROM ${table} WHERE slug = $1`,
      [slug]
    );
    if (existing.rows.length === 0) {
      return slug;
    }
    attempts++;
  }

  throw new Error('Failed to generate unique slug');
}

/**
 * Use a provided slug, or generate a short random unique slug if omitted.
 * @param {string} table - outreach_campaigns | outreach_message_variants
 * @param {string|null|undefined} providedSlug
 * @returns {Promise<string>}
 */
export async function resolveOutreachSlug(table, providedSlug) {
  const trimmed =
    typeof providedSlug === 'string' ? providedSlug.trim() : '';
  if (!trimmed) {
    return generateUniqueRandomSlug(table);
  }

  const baseSlug = slugifyOutreachName(trimmed);
  if (!baseSlug) {
    const err = new Error('Enter a valid slug or leave it blank');
    err.status = 400;
    err.userFacing = true;
    throw err;
  }

  return ensureUniqueSlug(table, baseSlug);
}

/**
 * Ensure slug is unique in the given table; append numeric suffix if needed.
 * @param {string} table - outreach_campaigns | outreach_message_variants
 * @param {string} baseSlug
 * @returns {Promise<string>}
 */
export async function ensureUniqueSlug(table, baseSlug) {
  if (!SLUG_TABLES.has(table)) {
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
 * Track destinations become /r/track/{code}; other pages use their first
 * path segment the same way. Homepage stays /r/{code}.
 * @param {string} code
 * @param {string|null|undefined} [destinationPath]
 * @returns {string}
 */
export function buildOutreachShortUrl(code, destinationPath) {
  const frontendUrl = (process.env.FRONTEND_URL || 'https://sterio.fm').replace(/\/$/, '');
  const kind = getOutreachShortUrlKind(destinationPath);
  if (kind) {
    return `${frontendUrl}/r/${kind}/${code}`;
  }
  return `${frontendUrl}/r/${code}`;
}
