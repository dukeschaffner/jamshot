export const APP_HOME_PATH = '/feed';

/** Default post-auth destination; legacy `/` redirects to the app home feed. */
export function resolvePostAuthRedirect(redirectUrl) {
  if (!redirectUrl || redirectUrl === '/') return APP_HOME_PATH;
  return redirectUrl;
}
