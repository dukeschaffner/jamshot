import { logger } from '@/lib/logger';

const FORWARDED_HEADER_NAMES = [
  'cf-connecting-ip',
  'cf-ipcity',
  'cf-region-code',
  'cf-ipcountry',
  'cf-region',
  'x-forwarded-for',
  'user-agent',
  'referer',
];

function getOutreachApiBase() {
  return (
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_URL ||
    'http://localhost:5001/api'
  ).replace(/\/$/, '');
}

function outreachApiHeaders(incomingHeaders) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const cfSecret = process.env.CF_SECRET;
  if (cfSecret) {
    headers['x-internal-auth'] = cfSecret;
  }

  if (!incomingHeaders || typeof incomingHeaders.get !== 'function') {
    return headers;
  }

  for (const name of FORWARDED_HEADER_NAMES) {
    const value = incomingHeaders.get(name);
    if (value) {
      headers[name] = value;
    }
  }

  return headers;
}

/**
 * Public link lookup (no click). Used for Open Graph on /r/... pages.
 */
export async function fetchPublicOutreachLink(code) {
  if (!code) {
    return null;
  }

  try {
    const response = await fetch(
      `${getOutreachApiBase()}/outreach/r/${encodeURIComponent(code)}`,
      {
        method: 'GET',
        headers: outreachApiHeaders(),
        next: { revalidate: 300 },
      }
    );

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch (error) {
    logger.error('Outreach link lookup failed:', error);
    return null;
  }
}

/**
 * Record a click and return the Sterio redirect URL.
 */
export async function recordOutreachClick(code, incomingHeaders) {
  if (!code) {
    return null;
  }

  try {
    const response = await fetch(
      `${getOutreachApiBase()}/outreach/r/${encodeURIComponent(code)}/click`,
      {
        method: 'POST',
        headers: outreachApiHeaders(incomingHeaders),
        cache: 'no-store',
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.redirectUrl || null;
  } catch (error) {
    logger.error('Outreach click resolve failed:', error);
    return null;
  }
}
