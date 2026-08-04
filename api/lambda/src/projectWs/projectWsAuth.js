import { auth } from '../../auth.js';

/**
 * Authenticate a WebSocket $connect request.
 * Production: `token` query param (Better Auth bearer token).
 * Dev: `devUserId` query param when NODE_ENV=dev.
 *
 * @param {Record<string, string|undefined>|null|undefined} queryParams
 * @returns {Promise<{ ok: true, userId: string } | { ok: false, statusCode: number }>}
 */
export async function authenticateWsConnect(queryParams) {
  const devUserId = queryParams?.devUserId;
  if (
    process.env.NODE_ENV === 'dev' &&
    typeof devUserId === 'string' &&
    devUserId.trim()
  ) {
    return { ok: true, userId: devUserId.trim() };
  }

  const token = queryParams?.token;
  if (typeof token !== 'string' || !token.trim()) {
    return { ok: false, statusCode: 401 };
  }

  try {
    const session = await auth.api.getSession({
      headers: { authorization: `Bearer ${token.trim()}` },
    });

    if (!session?.user?.id) {
      return { ok: false, statusCode: 401 };
    }

    return { ok: true, userId: session.user.id };
  } catch (error) {
    console.error('Project WS auth error:', error);
    return { ok: false, statusCode: 401 };
  }
}
