/**
 * Last slug segment is the outreach code: /r/{code} or /r/track/{code}.
 * @param {string|string[]|undefined|null} slug
 * @returns {string|null}
 */
export function extractOutreachCodeFromSlug(slug) {
  if (slug == null) {
    return null;
  }

  const parts = Array.isArray(slug) ? slug : [slug];
  const last = parts[parts.length - 1];
  if (typeof last !== 'string') {
    return null;
  }

  const code = last.trim();
  return code.length > 0 ? code : null;
}

export function isOutreachShortPath(pathname) {
  if (!pathname) {
    return false;
  }
  return pathname === '/r' || pathname.startsWith('/r/');
}
