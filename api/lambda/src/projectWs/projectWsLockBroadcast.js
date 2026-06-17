import { getProjectConnectionIds } from './projectWsConnections.js';
import { postToConnection } from './projectWsApiGateway.js';

/**
 * @param {number} trackId
 * @param {string} userId
 * @param {'acquired'|'released'} action
 */
export function buildLockMessage(trackId, userId, action) {
  return {
    type: 'lock',
    action,
    resource: { type: 'track', id: trackId },
    userId,
  };
}

/**
 * Fan out a lock event to every connection in the project room.
 *
 * @param {number} projectId
 * @param {object} payload
 * @param {import('./projectWsPresence.js').WsGatewayContext} gatewayContext
 */
export async function broadcastProjectLockEvent(projectId, payload, gatewayContext) {
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
        console.error(`Failed to post lock event to connection ${connectionId}:`, error);
      })
    )
  );
}
