import {
  getProjectUserConnections,
  removeProjectUserConnections,
} from './projectWsConnections.js';
import {
  buildLockMessage,
  buildMetadataLockMessage,
  broadcastProjectLockEvent,
} from './projectWsLockBroadcast.js';
import {
  broadcastProjectPresence,
  buildPresenceMessage,
} from './projectWsPresence.js';
import {
  deleteWsConnection,
  postToConnection,
} from './projectWsApiGateway.js';
import { releaseAllTrackLocksForUser } from '../utils/projectTrackLocks.js';
import { releaseMetadataLockForUser } from '../utils/projectMetadataLocks.js';
import {
  PROJECT_WS_DEV_PORT,
  PROJECT_WS_LOCAL_CONTROL_PATH,
} from './projectWsConfig.js';

/**
 * @param {Array<{ gatewayDomain: string|null, gatewayStage: string|null }>} connections
 * @returns {{ mode: 'local' } | { mode: 'apigateway', domainName: string, stage: string } | null}
 */
function resolveGatewayContextFromConnections(connections) {
  const withGateway = connections.find(
    (row) => row.gatewayDomain && row.gatewayStage
  );
  if (!withGateway) {
    return null;
  }

  if (
    withGateway.gatewayDomain === 'localhost' ||
    withGateway.gatewayDomain === '127.0.0.1'
  ) {
    return { mode: 'local' };
  }

  return {
    mode: 'apigateway',
    domainName: withGateway.gatewayDomain,
    stage: withGateway.gatewayStage,
  };
}

function getLocalControlUrl() {
  const base =
    process.env.PROJECT_WS_LOCAL_CONTROL_URL ||
    `http://127.0.0.1:${process.env.PROJECT_WS_PORT || PROJECT_WS_DEV_PORT}`;
  return `${base.replace(/\/$/, '')}${PROJECT_WS_LOCAL_CONTROL_PATH}`;
}

/**
 * Best-effort notify + close + room broadcasts via the local WS control HTTP API.
 *
 * @param {object} body
 */
async function postLocalWsControl(body) {
  const url = getLocalControlUrl();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.error('[project-ws] local control failed', {
        status: response.status,
        url,
      });
    }
  } catch (error) {
    console.error('[project-ws] local control unreachable', {
      url,
      error: error?.message ?? String(error),
    });
  }
}

/**
 * Force-release track + metadata locks held by a user in a project.
 *
 * @param {number} projectId
 * @param {string} userId
 * @returns {Promise<object[]>} lock event payloads to broadcast
 */
export async function collectReleasedLockPayloads(projectId, userId) {
  const payloads = [];

  const trackIds = await releaseAllTrackLocksForUser({ projectId, userId });
  for (const trackId of trackIds) {
    payloads.push(buildLockMessage(trackId, userId, 'released'));
  }

  const metadataReleased = await releaseMetadataLockForUser({ projectId, userId });
  if (metadataReleased) {
    payloads.push(buildMetadataLockMessage(userId, 'released'));
  }

  return payloads;
}

/**
 * Release edit locks for a member who can no longer edit (e.g. demoted to viewer).
 * Connection stays in the room so they can still receive fanout.
 *
 * @param {number} projectId
 * @param {string} userId
 */
export async function revokeProjectMemberEditSession(projectId, userId) {
  const connections = await getProjectUserConnections(projectId, userId);
  const lockPayloads = await collectReleasedLockPayloads(projectId, userId);
  if (lockPayloads.length === 0) {
    return { ok: true, releasedLocks: 0 };
  }

  const gatewayContext = resolveGatewayContextFromConnections(connections);
  if (!gatewayContext) {
    console.warn('[project-ws] revoked locks without gateway context to broadcast', {
      projectId,
      userId,
    });
    return { ok: true, releasedLocks: lockPayloads.length, broadcast: false };
  }

  if (gatewayContext.mode === 'local') {
    await postLocalWsControl({
      broadcasts: lockPayloads.map((payload) => ({ projectId, payload })),
    });
    return { ok: true, releasedLocks: lockPayloads.length, broadcast: true };
  }

  for (const payload of lockPayloads) {
    await broadcastProjectLockEvent(projectId, payload, gatewayContext);
  }

  return { ok: true, releasedLocks: lockPayloads.length, broadcast: true };
}

/**
 * Cut a user's live project session: release locks, drop room rows, notify + close sockets.
 * Call after membership delete (kick / leave).
 *
 * @param {number} projectId
 * @param {string} userId
 * @param {{ reason?: 'removed'|'left' }} [options]
 */
export async function evictProjectMemberSessions(
  projectId,
  userId,
  options = {}
) {
  const reason = options.reason === 'left' ? 'left' : 'removed';
  const connections = await getProjectUserConnections(projectId, userId);
  const connectionIds = connections.map((row) => row.connectionId);

  const lockPayloads = await collectReleasedLockPayloads(projectId, userId);
  await removeProjectUserConnections(projectId, userId);

  const revokeMessage = {
    type: 'error',
    code: 'ACCESS_REVOKED',
    message:
      reason === 'left'
        ? 'You left this project'
        : 'You no longer have access to this project',
  };

  if (connectionIds.length === 0 && lockPayloads.length === 0) {
    return { ok: true, evicted: 0 };
  }

  const gatewayContext = resolveGatewayContextFromConnections(connections);
  if (!gatewayContext) {
    console.warn('[project-ws] evicted sessions without gateway context', {
      projectId,
      userId,
      connectionIds: connectionIds.length,
    });
    return { ok: true, evicted: connectionIds.length, notified: false };
  }

  if (gatewayContext.mode === 'local') {
    const presencePayload = await buildPresenceMessage(projectId);
    await postLocalWsControl({
      evictConnectionIds: connectionIds,
      evictMessage: revokeMessage,
      broadcasts: [
        ...lockPayloads.map((payload) => ({ projectId, payload })),
        { projectId, payload: presencePayload },
      ],
    });

    return { ok: true, evicted: connectionIds.length, notified: true };
  }

  await Promise.allSettled(
    connections.map(async (row) => {
      try {
        await postToConnection({
          domainName: row.gatewayDomain,
          stage: row.gatewayStage,
          connectionId: row.connectionId,
          payload: revokeMessage,
        });
      } catch (error) {
        if (
          error?.name !== 'GoneException' &&
          error?.$metadata?.httpStatusCode !== 410
        ) {
          console.error(
            `Failed to notify evicted connection ${row.connectionId}:`,
            error
          );
        }
      }

      try {
        await deleteWsConnection({
          domainName: row.gatewayDomain,
          stage: row.gatewayStage,
          connectionId: row.connectionId,
        });
      } catch (error) {
        if (
          error?.name !== 'GoneException' &&
          error?.$metadata?.httpStatusCode !== 410
        ) {
          console.error(
            `Failed to close evicted connection ${row.connectionId}:`,
            error
          );
        }
      }
    })
  );

  for (const payload of lockPayloads) {
    await broadcastProjectLockEvent(projectId, payload, gatewayContext);
  }

  await broadcastProjectPresence(projectId, gatewayContext);

  return { ok: true, evicted: connectionIds.length, notified: true };
}
