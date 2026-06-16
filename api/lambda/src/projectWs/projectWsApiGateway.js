import {
  ApiGatewayManagementApiClient,
  PostToConnectionCommand,
} from '@aws-sdk/client-apigatewaymanagementapi';

/**
 * Send a JSON message to a WebSocket connection via API Gateway Management API.
 */
export async function postToConnection({ domainName, stage, connectionId, payload }) {
  const endpoint = `https://${domainName}/${stage}`;
  const client = new ApiGatewayManagementApiClient({ endpoint });
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload);

  await client.send(
    new PostToConnectionCommand({
      ConnectionId: connectionId,
      Data: Buffer.from(body),
    })
  );
}

/**
 * @typedef {object} WsSendContext
 * @property {'local'|'apigateway'} [mode]
 * @property {string} [connectionId]
 * @property {string} [domainName]
 * @property {string} [stage]
 * @property {(payload: object) => Promise<void>|void} [send]
 */

/**
 * Send a JSON message to a WebSocket connection via API Gateway Management API.
 * @param {WsSendContext} sendContext
 */
export async function sendWsMessage(sendContext, payload) {
  if (sendContext?.mode === 'local' && sendContext.send) {
    await sendContext.send(payload);
    return;
  }

  if (!sendContext?.domainName || !sendContext?.stage || !sendContext?.connectionId) {
    throw new Error('Missing API Gateway send context');
  }

  await postToConnection({
    domainName: sendContext.domainName,
    stage: sendContext.stage,
    connectionId: sendContext.connectionId,
    payload,
  });
}
