import { isFeatureEnabled } from '../utils/featureFlags.js';
import { authenticateWsConnect } from './projectWsAuth.js';
import {
  countProjectConnections,
  getConnectionAuthUserId,
  removeConnectionAuth,
  removeProjectConnection,
  storeConnectionAuth,
} from './projectWsConnections.js';
import { handleOpMessage } from './handleOps.js';
import { handleClipAnnounceMessage } from './handleClipAnnounce.js';
import { handleJoinMessage } from './handleJoin.js';
import {
  handleLockAcquireMessage,
  handleLockHeartbeatMessage,
  handleLockReleaseMessage,
} from './handleLocks.js';
import { handlePresenceMessage } from './handlePresence.js';
import { shortenLocksOnDisconnect, LOCK_DISCONNECT_GRACE_SECONDS } from '../utils/projectTrackLocks.js';
import { shortenMetadataLockOnDisconnect } from '../utils/projectMetadataLocks.js';
import { broadcastProjectPresence, getGatewayContextFromSendContext } from './projectWsPresence.js';
import { maybeCreateAutoSnapshot } from '../utils/projectSnapshotAutoUtils.js';

/**
 * @typedef {object} WsSendContext
 * @property {'local'|'apigateway'} [mode]
 * @property {string} [connectionId]
 * @property {string} [domainName]
 * @property {string} [stage]
 * @property {(payload: object) => Promise<void>|void} [send]
 * @property {(projectId: number) => void} [setProjectId]
 * @property {(projectId: number, payload: object, options?: { excludeConnectionId?: string|null }) => Promise<void>} [broadcastToProject]
 */

/**
 * @param {import('aws-lambda').APIGatewayProxyWebsocketEventV2} event
 * @param {WsSendContext} [localSendContext]
 */
export async function routeProjectWsEvent(event, localSendContext = null) {
  const routeKey = event.requestContext?.routeKey;
  const connectionId = event.requestContext?.connectionId;

  if (!connectionId) {
    return { statusCode: 500, body: 'Missing connection id' };
  }

  const sendContext =
    localSendContext ??
    /** @type {WsSendContext} */ ({
      mode: 'apigateway',
      connectionId,
      domainName: event.requestContext.domainName,
      stage: event.requestContext.stage,
    });

  if (routeKey === '$connect') {
    return handleConnect(event, connectionId);
  }

  if (routeKey === '$disconnect') {
    return handleDisconnect(connectionId, sendContext);
  }

  return handleDefault(event, connectionId, sendContext);
}

async function handleConnect(event, connectionId) {
  const projectsEnabled = await isFeatureEnabled('projects', false);
  if (!projectsEnabled) {
    return { statusCode: 404 };
  }

  const auth = await authenticateWsConnect(event.queryStringParameters);
  if (!auth.ok) {
    return { statusCode: auth.statusCode };
  }

  await storeConnectionAuth(connectionId, auth.userId);
  return { statusCode: 200 };
}

async function handleDisconnect(connectionId, sendContext) {
  await shortenLocksOnDisconnect(connectionId);
  await shortenMetadataLockOnDisconnect(connectionId, LOCK_DISCONNECT_GRACE_SECONDS);

  const userId = await getConnectionAuthUserId(connectionId);
  const projectId = await removeProjectConnection(connectionId);
  await removeConnectionAuth(connectionId);

  if (projectId != null && sendContext) {
    const gatewayContext = getGatewayContextFromSendContext(sendContext);
    await broadcastProjectPresence(projectId, gatewayContext);

    const remaining = await countProjectConnections(projectId);
    if (remaining === 0) {
      // Dirty leave flush: ignore cooldown so a short edit session still checkpoints.
      try {
        await maybeCreateAutoSnapshot({
          projectId,
          userId,
          ignoreCooldown: true,
        });
      } catch (err) {
        console.error('[auto-snapshot] leave flush failed', {
          projectId,
          error: err?.message ?? String(err),
        });
      }
    }
  }

  return { statusCode: 200 };
}

async function handleDefault(event, connectionId, sendContext) {
  const projectsEnabled = await isFeatureEnabled('projects', false);
  if (!projectsEnabled) {
    return { statusCode: 404 };
  }

  let body = event.body;
  if (body && event.isBase64Encoded) {
    body = Buffer.from(body, 'base64').toString('utf8');
  }

  let parsed;
  try {
    parsed = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  if (parsed?.type === 'join') {
    return handleJoinMessage({ connectionId, body, sendContext });
  }

  if (parsed?.type === 'presence') {
    return handlePresenceMessage({ connectionId, body, sendContext });
  }

  if (parsed?.type === 'lock_acquire') {
    return handleLockAcquireMessage({ connectionId, body, sendContext });
  }

  if (parsed?.type === 'lock_release') {
    return handleLockReleaseMessage({ connectionId, body, sendContext });
  }

  if (parsed?.type === 'lock_heartbeat') {
    return handleLockHeartbeatMessage({ connectionId, body });
  }

  if (parsed?.type === 'op') {
    return handleOpMessage({ connectionId, body, sendContext });
  }

  if (parsed?.type === 'clip_announce') {
    return handleClipAnnounceMessage({ connectionId, body, sendContext });
  }

  return { statusCode: 400, body: 'Unsupported message type' };
}

export { handleConnect, handleDisconnect, handleDefault };
