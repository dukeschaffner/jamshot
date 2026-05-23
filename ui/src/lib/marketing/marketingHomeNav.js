const MARKETING_HOME_ALLOW_KEY = 'sterio:allow-marketing-home';

/** Mark the next visit to `/` as intentional marketing navigation. */
export function markMarketingHomeNavigation() {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(MARKETING_HOME_ALLOW_KEY, '1');
}

/** Returns true once if the user navigated to `/` from the marketing shell. */
export function consumeMarketingHomeNavigation() {
  if (typeof window === 'undefined') return false;
  const allowed = sessionStorage.getItem(MARKETING_HOME_ALLOW_KEY) === '1';
  if (allowed) sessionStorage.removeItem(MARKETING_HOME_ALLOW_KEY);
  return allowed;
}

export function marketingHomeLinkProps(href) {
  if (href !== '/') return {};
  return { onClick: markMarketingHomeNavigation };
}
