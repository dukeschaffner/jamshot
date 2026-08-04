import Cookies from 'js-cookie';
import { authClient } from '@/lib/auth-client';
import { getProjectWsUrl } from './ProjectsConfig';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

/**
 * Resolve a Better Auth bearer token for project WS `$connect`.
 * Web login uses httpOnly session cookies (not the legacy `accessToken` cookie).
 */
async function resolveProjectWsBearerToken() {
  const legacyToken = Cookies.get('accessToken');
  if (legacyToken) {
    return legacyToken;
  }

  const { data } = await authClient.getSession();
  const sessionToken = data?.session?.token;
  if (typeof sessionToken === 'string' && sessionToken.trim()) {
    return sessionToken.trim();
  }

  const res = await fetch(`${API_URL}/plugin-auth/tokens`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Authentication required');
  }
  const body = await res.json();
  const token = body?.accessToken;
  if (typeof token !== 'string' || !token.trim()) {
    throw new Error('Authentication required');
  }
  return token.trim();
}

/**
 * Build the project sync WebSocket URL with auth query params.
 * Dev: `?devUserId=` (matches API `NODE_ENV=dev` spoof).
 * Production: `?token=` Better Auth session bearer.
 *
 * @param {string} userId
 * @returns {Promise<string>}
 */
export async function buildProjectWsConnectUrl(userId) {
  const baseUrl = getProjectWsUrl();
  if (!baseUrl) {
    throw new Error('Project WebSocket URL is not configured');
  }

  if (process.env.NODE_ENV === 'development') {
    return `${baseUrl}?devUserId=${encodeURIComponent(userId)}`;
  }

  const token = await resolveProjectWsBearerToken();
  return `${baseUrl}?token=${encodeURIComponent(token)}`;
}
