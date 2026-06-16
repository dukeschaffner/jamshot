import { isFeatureEnabled } from '../utils/featureFlags.js';
import { authenticateWsConnect } from './projectWsAuth.js';
import {
  removeConnectionAuth,
  removeProjectConnection,
  storeConnectionAuth,
  touchConnectionLastSeen,
} from './projectWsConnections.js';
import { handleJoinMessage } from './handleJoin.js';

/**
 * @typedef {object} WsSendContext
 * @property {'local'|'apigateway'} [mode]
 * @property {string} [connectionId]
 * @property {string} [domainName]
 * @property {string} [stage]
 * @property {(payload: object) => Promise<void>|void} [send]
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
    return handleDisconnect(connectionId);
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

async function handleDisconnect(connectionId) {
  await removeProjectConnection(connectionId);
  await removeConnectionAuth(connectionId);
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
    await touchConnectionLastSeen(connectionId);
    return { statusCode: 200 };
  }

  return { statusCode: 400, body: 'Unsupported message type' };
}

export { handleConnect, handleDisconnect, handleDefault };
