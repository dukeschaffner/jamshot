import { OUTREACH_DESTINATION_PATH_MAX_LENGTH } from '../config/outreachConfig.js';

function userFacingError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  err.userFacing = true;
  return err;
}

export function getFrontendBaseUrl() {
  return (process.env.FRONTEND_URL || 'https://sterio.fm').replace(/\/$/, '');
}

/**
 * Normalize a site-relative destination to pathname + search (no hash).
 * Accepts `/track/abc`, `track/abc`, or a full URL on the Sterio origin.
 * Empty input becomes `/`.
 * @param {string|null|undefined} input
 * @param {string} [frontendUrl]
 * @returns {string}
 */
export function normalizeOutreachDestinationPath(
  input,
  frontendUrl = getFrontendBaseUrl()
) {
  const base = new URL(`${frontendUrl}/`);
  let candidate = typeof input === 'string' ? input.trim() : '';
  if (!candidate) {
    return '/';
  }

  if (/^[a-zA-Z][a-zA-Z+\-.]*:/.test(candidate)) {
    let absolute;
    try {
      absolute = new URL(candidate);
    } catch {
      throw userFacingError('Enter a valid site path, such as /track/abc');
    }
    if (absolute.origin !== base.origin) {
      throw userFacingError('Redirect path must be on the Sterio site');
    }
    candidate = `${absolute.pathname}${absolute.search}`;
  }

  if (candidate.startsWith('//') || candidate.includes('\\')) {
    throw userFacingError('Enter a valid site path, such as /track/abc');
  }

  if (!candidate.startsWith('/')) {
    candidate = `/${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate, base);
  } catch {
    throw userFacingError('Enter a valid site path, such as /track/abc');
  }

  if (parsed.origin !== base.origin) {
    throw userFacingError('Redirect path must be on the Sterio site');
  }

  let pathname = parsed.pathname || '/';
  if (pathname.length > 1) {
    pathname = pathname.replace(/\/+$/, '');
  }
  if (!pathname || pathname.startsWith('//')) {
    throw userFacingError('Enter a valid site path, such as /track/abc');
  }

  const normalized = `${pathname}${parsed.search}`;
  if (normalized.length > OUTREACH_DESTINATION_PATH_MAX_LENGTH) {
    throw userFacingError('Redirect path is too long');
  }

  return normalized;
}

/**
 * Build the post-click Sterio URL for an outreach link (destination + UTM + oc).
 * Invalid stored paths fall back to `/`.
 */
export function buildOutreachRedirectUrl({
  destinationPath,
  platform,
  method,
  campaignSlug,
  messageVariantSlug,
  code,
  outreachCodeParam,
  frontendUrl = getFrontendBaseUrl(),
}) {
  const base = new URL(`${frontendUrl}/`);
  let path = '/';
  try {
    path = normalizeOutreachDestinationPath(destinationPath, frontendUrl);
  } catch {
    path = '/';
  }

  const url = new URL(path, base);
  if (url.origin !== base.origin) {
    url.href = base.href;
  }

  url.searchParams.set('utm_source', platform);
  url.searchParams.set('utm_medium', method);
  url.searchParams.set('utm_campaign', campaignSlug);
  url.searchParams.set('utm_content', messageVariantSlug);
  url.searchParams.set(outreachCodeParam, code);

  return url.toString();
}
