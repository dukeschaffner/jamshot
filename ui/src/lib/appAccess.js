export const HAS_LOGGED_IN_KEY = 'sterio_has_logged_in';

export function markHasLoggedInBefore() {
  if (typeof window === 'undefined') return;
  localStorage.setItem(HAS_LOGGED_IN_KEY, 'true');
}

export function readHasLoggedInBefore() {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(HAS_LOGGED_IN_KEY) === 'true';
}
