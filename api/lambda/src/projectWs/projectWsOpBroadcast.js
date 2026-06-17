import { getProjectConnectionIds } from './projectWsConnections.js';
import { postToConnection } from './projectWsApiGateway.js';

/**
 * Fan out an op event to every connection in the project room.
 *
 * @param {number} projectId
 * @param {object} payload
 * @param {import('./projectWsPresence.js').WsGatewayContext} gatewayContext
 */
export async function broadcastProjectOpEvent(projectId, payload, gatewayContext) {
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
        console.error(`Failed to post op event to connection ${connectionId}:`, error);
      })
    )
  );
}

/**
 * Push asset processing status to all connections in a project room.
 *
 * @param {number} projectId
 * @param {object} update
 * @param {number} update.clipId
 * @param {number} update.assetId
 * @param {'completed'|'failed'|'processing'|'pending'} update.status
 * @param {string|null} [update.error]
 * @param {import('./projectWsPresence.js').WsGatewayContext} gatewayContext
 */
export async function broadcastAssetProcessingUpdate(projectId, update, gatewayContext) {
  const payload = {
    type: 'asset.processing_update',
    clipId: update.clipId,
    assetId: update.assetId,
    status: update.status,
    error: update.error ?? null,
  };

  await broadcastProjectOpEvent(projectId, payload, gatewayContext);
}
