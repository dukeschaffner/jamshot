import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { WebSocketServer } = require('ws');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../api/lambda/.env') });

process.env.NODE_ENV = process.env.NODE_ENV || 'dev';

const { routeProjectWsEvent } = await import(
  '../../../api/lambda/src/projectWs/projectWsRouter.js'
);
const { PROJECT_WS_DEV_PORT } = await import(
  '../../../api/lambda/src/projectWs/projectWsConfig.js'
);

const PORT = Number(process.env.PROJECT_WS_PORT || PROJECT_WS_DEV_PORT);

/** @type {Map<string, { socket: import('ws').WebSocket, projectId?: number }>} */
const connectionRegistry = new Map();

const wss = new WebSocketServer({ port: PORT });

function buildApiGatewayEvent({ routeKey, connectionId, query, body }) {
  return {
    requestContext: {
      routeKey,
      connectionId,
      domainName: 'localhost',
      stage: 'dev',
    },
    queryStringParameters: query ?? null,
    body: body != null ? (typeof body === 'string' ? body : JSON.stringify(body)) : null,
    isBase64Encoded: false,
  };
}

function createSendContext(connectionId, socket) {
  return {
    mode: 'local',
    connectionId,
    send: async (payload) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(payload));
      }
    },
    setProjectId: (projectId) => {
      const entry = connectionRegistry.get(connectionId);
      if (entry) {
        entry.projectId = projectId;
      }
    },
    broadcastToProject: async (projectId, payload) => {
      const body = JSON.stringify(payload);
      for (const [id, entry] of connectionRegistry) {
        if (entry.projectId === projectId && entry.socket.readyState === entry.socket.OPEN) {
          entry.socket.send(body);
        }
      }
    },
  };
}

wss.on('connection', (socket, request) => {
  const connectionId = crypto.randomUUID();
  const query = Object.fromEntries(new URL(request.url, 'http://localhost').searchParams.entries());

  connectionRegistry.set(connectionId, { socket });
  const sendContext = createSendContext(connectionId, socket);

  (async () => {
    const connectResult = await routeProjectWsEvent(
      buildApiGatewayEvent({ routeKey: '$connect', connectionId, query }),
      sendContext
    );

    if (connectResult.statusCode !== 200) {
      connectionRegistry.delete(connectionId);
      socket.close(connectResult.statusCode === 401 ? 4401 : 4404, 'Connect rejected');
      return;
    }

    console.log(`[project-ws-dev] connected ${connectionId} user=${query.devUserId || 'token'}`);
  })().catch((error) => {
    console.error('[project-ws-dev] connect error:', error);
    connectionRegistry.delete(connectionId);
    socket.close(1011, 'Connect failed');
  });

  socket.on('message', async (data) => {
    try {
      const body = data.toString();
      await routeProjectWsEvent(
        buildApiGatewayEvent({ routeKey: '$default', connectionId, body }),
        sendContext
      );
    } catch (error) {
      console.error('[project-ws-dev] message error:', error);
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify({ type: 'error', code: 'INTERNAL_ERROR', message: 'Server error' }));
      }
    }
  });

  socket.on('close', async () => {
    try {
      await routeProjectWsEvent(
        buildApiGatewayEvent({ routeKey: '$disconnect', connectionId }),
        sendContext
      );
      console.log(`[project-ws-dev] disconnected ${connectionId}`);
    } catch (error) {
      console.error('[project-ws-dev] disconnect error:', error);
    } finally {
      connectionRegistry.delete(connectionId);
    }
  });
});

console.log(`Project WS dev server listening on ws://localhost:${PORT}`);
console.log('Connect with ?devUserId=USER_ID (NODE_ENV=dev) or ?token=BEARER_TOKEN');
