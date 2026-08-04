/**
 * Reload the project page so the route shows the access-denied screen
 * ("You do not have access to this project" / Back to Projects).
 */
export function reloadForProjectAccessRevoked() {
  if (typeof window === 'undefined') {
    return;
  }
  window.location.reload();
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isProjectAccessDeniedError(err) {
  return err?.response?.status === 403;
}
