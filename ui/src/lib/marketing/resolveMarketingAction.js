import { APP_HOME_PATH } from '@/lib/appRoutes';

const AUTH_ENTRY_HREFS = new Set(['/register', '/login']);

export function resolveMarketingAction(action, { isAuthenticated, user } = {}) {
  if (!action?.label || !action?.href) return null;
  if (!isAuthenticated) return action;

  if (!AUTH_ENTRY_HREFS.has(action.href)) return action;

  if (action.href === '/login' && user?.username) {
    return {
      ...action,
      href: `/user/${user.username}`,
      label: 'My Profile',
    };
  }

  return {
    ...action,
    href: APP_HOME_PATH,
    label: 'Go to Feed',
  };
}
