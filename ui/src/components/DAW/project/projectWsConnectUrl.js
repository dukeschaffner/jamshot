import Cookies from 'js-cookie';
import { getProjectWsUrl } from './ProjectsConfig';

/**
 * Build the project sync WebSocket URL with auth query params.
 * Dev: `?devUserId=` (matches API `NODE_ENV=dev` spoof).
 * Production: `?token=` bearer from accessToken cookie.
 */
export function buildProjectWsConnectUrl(userId) {
  const baseUrl = getProjectWsUrl();
  if (!baseUrl) {
    throw new Error('Project WebSocket URL is not configured');
  }

  if (process.env.NODE_ENV === 'development') {
    return `${baseUrl}?devUserId=${encodeURIComponent(userId)}`;
  }

  const token = Cookies.get('accessToken');
  if (!token) {
    throw new Error('Authentication required');
  }

  return `${baseUrl}?token=${encodeURIComponent(token)}`;
}
