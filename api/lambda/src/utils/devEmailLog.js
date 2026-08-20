/**
 * Local/dev-only email link logging so agents can complete verification
 * without access to the recipient inbox.
 *
 * Never logs in production. Lines are greppable as `[DEV EMAIL]`.
 */
export function logDevEmailLink(kind, to, url) {
  const env = process.env.NODE_ENV;
  if (env === 'prod' || env === 'production') return;
  if (!url) return;
  console.log(`[DEV EMAIL] ${kind} url for ${to}: ${url}`);
}
