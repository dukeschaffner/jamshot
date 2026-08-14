import '@sterio/dev-env/config';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { WebSocketServer } = require('ws');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.NODE_ENV = process.env.NODE_ENV || 'dev';

const { routeProjectWsEvent } = await import(
  '../../../api/lambda/src/projectWs/projectWsRouter.js'
);
const {
  PROJECT_WS_DEV_PORT,
  PROJECT_WS_LOCAL_CONTROL_PATH,
} = await import(
  '../../../api/lambda/src/projectWs/projectWsConfig.js'
);

const PORT = Number(process.env.PROJECT_WS_PORT || PROJECT_WS_DEV_PORT);

/** @type {Map<string, { socket: import('ws').WebSocket, projectId?: number }>} */
const connectionRegistry = new Map();

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
    broadcastToProject: async (projectId, payload, options = {}) => {
      const body = JSON.stringify(payload);
      const excludeConnectionId = options.excludeConnectionId ?? null;
      for (const [id, entry] of connectionRegistry) {
        if (excludeConnectionId && id === excludeConnectionId) {
          continue;
        }
        if (entry.projectId === projectId && entry.socket.readyState === entry.socket.OPEN) {
          entry.socket.send(body);
        }
      }
    },
  };
}

/**
 * REST → local WS control: notify/close sockets and fan out room events.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
async function handleLocalControl(req, res) {
  if (req.method !== 'POST' || req.url !== PROJECT_WS_LOCAL_CONTROL_PATH) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  let body;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Invalid JSON' }));
    return;
  }

  const evictConnectionIds = Array.isArray(body.evictConnectionIds)
    ? body.evictConnectionIds.map(String)
    : [];
  const evictMessage = body.evictMessage ?? null;
  const broadcasts = Array.isArray(body.broadcasts) ? body.broadcasts : [];

  for (const connectionId of evictConnectionIds) {
    const entry = connectionRegistry.get(connectionId);
    if (!entry) {
      continue;
    }

    if (evictMessage && entry.socket.readyState === entry.socket.OPEN) {
      try {
        entry.socket.send(JSON.stringify(evictMessage));
      } catch (error) {
        console.error(`[project-ws-dev] failed to notify ${connectionId}:`, error);
      }
    }

    entry.projectId = undefined;
    try {
      entry.socket.close(4003, 'Access revoked');
    } catch (error) {
      console.error(`[project-ws-dev] failed to close ${connectionId}:`, error);
    }
  }

  for (const item of broadcasts) {
    const projectId = Number(item?.projectId);
    const payload = item?.payload;
    if (!Number.isFinite(projectId) || !payload) {
      continue;
    }
    const message = JSON.stringify(payload);
    for (const [id, entry] of connectionRegistry) {
      if (evictConnectionIds.includes(id)) {
        continue;
      }
      if (entry.projectId === projectId && entry.socket.readyState === entry.socket.OPEN) {
        entry.socket.send(message);
      }
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, evicted: evictConnectionIds.length }));
}

const server = http.createServer((req, res) => {
  handleLocalControl(req, res).catch((error) => {
    console.error('[project-ws-dev] control error:', error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Server error' }));
    }
  });
});

const wss = new WebSocketServer({ server });

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

server.listen(PORT, () => {
  console.log(`Project WS dev server listening on ws://localhost:${PORT}`);
  console.log(`Local control: POST http://127.0.0.1:${PORT}${PROJECT_WS_LOCAL_CONTROL_PATH}`);
  console.log('Connect with ?devUserId=USER_ID (NODE_ENV=dev) or ?token=BEARER_TOKEN');
});
