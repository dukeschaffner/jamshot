import { isFeatureEnabled } from '../utils/featureFlags.js';
import {
  checkProjectAccess,
  getProjectLimitsForContext,
  resolveProjectRef,
} from '../utils/projectAccess.js';
import pool from '../config/db.js';
import { PROJECT_WS_PROTOCOL_VERSION } from './projectWsConfig.js';
import {
  countProjectConnections,
  getConnectionAuthUserId,
  upsertProjectConnection,
} from './projectWsConnections.js';
import { sendWsMessage } from './projectWsApiGateway.js';

function parseJoinMessage(body) {
  let parsed;
  try {
    parsed = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return { ok: false, error: 'Invalid JSON message' };
  }

  if (!parsed || parsed.type !== 'join') {
    return { ok: false, error: 'Unsupported message type' };
  }

  const protocolVersion = parsed.protocolVersion ?? parsed.protocol_version;
  if (protocolVersion != null && Number(protocolVersion) !== PROJECT_WS_PROTOCOL_VERSION) {
    return {
      ok: false,
      error: `Unsupported protocol version (expected ${PROJECT_WS_PROTOCOL_VERSION})`,
    };
  }

  const projectRef = parsed.projectId ?? parsed.project_id;
  if (projectRef == null || String(projectRef).trim() === '') {
    return { ok: false, error: 'projectId is required' };
  }

  return { ok: true, projectRef: String(projectRef).trim(), revision: parsed.revision ?? null };
}

/**
 * Handle a `join` message — validates membership and records the connection row.
 *
 * @param {object} params
 * @param {string} params.connectionId
 * @param {string|object|null} params.body
 * @param {import('./projectWsApiGateway.js').WsSendContext} params.sendContext
 */
export async function handleJoinMessage({ connectionId, body, sendContext }) {
  const projectsEnabled = await isFeatureEnabled('projects', false);
  if (!projectsEnabled) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'NOT_FOUND',
      message: 'Not found',
    });
    return { statusCode: 404 };
  }

  const parsed = parseJoinMessage(body);
  if (!parsed.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'VALIDATION_ERROR',
      message: parsed.error,
    });
    return { statusCode: 400 };
  }

  const userId = await getConnectionAuthUserId(connectionId);
  if (!userId) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });
    return { statusCode: 401 };
  }

  const resolved = await resolveProjectRef(parsed.projectRef);
  if (!resolved.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: resolved.status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
      message: resolved.error,
    });
    return { statusCode: resolved.status };
  }

  const access = await checkProjectAccess(resolved.projectId, userId);
  if (!access.hasAccess) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: access.status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
      message: access.error,
    });
    return { statusCode: access.status };
  }

  const userResult = await pool.query(
    'SELECT id, subscription_tier, subscription_expires_at FROM users WHERE id = $1',
    [userId]
  );
  if (userResult.rows.length === 0) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });
    return { statusCode: 401 };
  }

  const limits = await getProjectLimitsForContext(access.project, userResult.rows[0]);
  const activeConnections = await countProjectConnections(resolved.projectId);
  const maxConnections = limits.effective_max_members;

  if (maxConnections !== -1 && activeConnections >= maxConnections) {
    const existing = await pool.query(
      'SELECT 1 FROM project_ws_connections WHERE connection_id = $1 AND project_id = $2',
      [connectionId, resolved.projectId]
    );
    if (existing.rows.length === 0) {
      await sendWsMessage(sendContext, {
        type: 'error',
        code: 'ROOM_FULL',
        message: 'Project connection limit reached',
      });
      return { statusCode: 403 };
    }
  }

  await upsertProjectConnection({
    connectionId,
    projectId: resolved.projectId,
    userId,
  });

  await sendWsMessage(sendContext, {
    type: 'joined',
    projectId: resolved.projectId,
    revision: access.project.revision != null ? Number(access.project.revision) : null,
    role: access.role,
    protocolVersion: PROJECT_WS_PROTOCOL_VERSION,
  });

  return { statusCode: 200 };
}
