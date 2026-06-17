import pool from '../config/db.js';
import { getProjectConnectionIds } from './projectWsConnections.js';
import { postToConnection } from './projectWsApiGateway.js';

/**
 * @typedef {object} WsGatewayContext
 * @property {'local'|'apigateway'} mode
 * @property {string} [domainName]
 * @property {string} [stage]
 * @property {(projectId: number, payload: object) => Promise<void>} [broadcastToProject]
 */

/**
 * Build deduplicated presence list — one entry per distinct userId.
 * When a user has multiple tabs, uses the most recently seen connection.
 *
 * @param {number} projectId
 * @returns {Promise<Array<{ userId: string, username: string, profilePicUrl: string|null, editingTrackId?: number }>>}
 */
export async function getProjectPresenceUsers(projectId) {
  const result = await pool.query(
    `SELECT DISTINCT ON (c.user_id)
       c.user_id,
       u.username,
       u.profile_pic_url,
       c.editing_track_id
     FROM project_ws_connections c
     JOIN users u ON u.id = c.user_id
     WHERE c.project_id = $1
     ORDER BY c.user_id, c.last_seen_at DESC`,
    [projectId]
  );

  return result.rows.map((row) => {
    const user = {
      userId: row.user_id,
      username: row.username,
      profilePicUrl: row.profile_pic_url ?? null,
    };
    if (row.editing_track_id != null) {
      user.editingTrackId = Number(row.editing_track_id);
    }
    return user;
  });
}

/**
 * @param {number} projectId
 * @returns {Promise<{ type: 'presence', users: Awaited<ReturnType<typeof getProjectPresenceUsers>> }>}
 */
export async function buildPresenceMessage(projectId) {
  const users = await getProjectPresenceUsers(projectId);
  return { type: 'presence', users };
}

/**
 * Fan out a presence snapshot to every connection in the project room.
 *
 * @param {number} projectId
 * @param {WsGatewayContext} gatewayContext
 */
export async function broadcastProjectPresence(projectId, gatewayContext) {
  const payload = await buildPresenceMessage(projectId);
  const connectionIds = await getProjectConnectionIds(projectId);

  if (connectionIds.length === 0) {
    return;
  }

  if (gatewayContext.mode === 'local' && gatewayContext.broadcastToProject) {
    await gatewayContext.broadcastToProject(projectId, payload);
    return;
  }

  if (!gatewayContext.domainName || !gatewayContext.stage) {
    throw new Error('Missing API Gateway broadcast context');
  }

  await Promise.allSettled(
    connectionIds.map((connectionId) =>
      postToConnection({
        domainName: gatewayContext.domainName,
        stage: gatewayContext.stage,
        connectionId,
        payload,
      }).catch((error) => {
        if (error?.name === 'GoneException' || error?.$metadata?.httpStatusCode === 410) {
          return;
        }
        console.error(`Failed to post presence to connection ${connectionId}:`, error);
      })
    )
  );
}

/**
 * @param {import('./projectWsApiGateway.js').WsSendContext} sendContext
 * @returns {WsGatewayContext}
 */
export function getGatewayContextFromSendContext(sendContext) {
  if (sendContext?.mode === 'local') {
    return {
      mode: 'local',
      broadcastToProject: sendContext.broadcastToProject,
    };
  }

  return {
    mode: 'apigateway',
    domainName: sendContext?.domainName,
    stage: sendContext?.stage,
  };
}
