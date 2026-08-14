#!/usr/bin/env node
/**
 * Manual test: track lock acquire denied for second user on same track.
 *
 * Usage:
 *   node api/lambda/testing/project-ws-locks-test.js --projectId=1
 */
import '@sterio/dev-env/config';
import WebSocket from 'ws';

const { PROJECT_WS_DEV_PORT } = await import('../src/projectWs/projectWsConfig.js');

const DEV_USER_ID = process.env.PROJECT_WS_TEST_USER_ID || 'RS2VUuNZAjDEMD5oJywuiO9IKBN3N2NE';
const WS_URL = process.env.PROJECT_WS_URL || `ws://localhost:${PROJECT_WS_DEV_PORT}`;

function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const [key, value] = arg.slice(2).split('=');
    args[key] = value ?? true;
  }
  return args;
}

function waitForMessage(ws, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WS message')), timeoutMs);

    const handler = (data) => {
      const parsed = JSON.parse(data.toString());
      if (predicate(parsed)) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(parsed);
      }
    };

    ws.on('message', handler);
    ws.once('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function connectAndJoin(projectRef, userId) {
  const url = `${WS_URL}?devUserId=${encodeURIComponent(userId)}`;
  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  ws.send(
    JSON.stringify({
      type: 'join',
      projectId: projectRef,
      revision: 1,
      protocolVersion: 1,
    })
  );

  await waitForMessage(ws, (msg) => msg.type === 'joined');
  return ws;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRef = args.projectGuid || args.projectId;
  const trackId = Number(args.trackId || 1);
  if (!projectRef) {
    console.error('Provide --projectId=<id> or --projectGuid=<uuid>');
    process.exit(1);
  }

  process.env.NODE_ENV = process.env.NODE_ENV || 'dev';
  const secondUserId = args.secondUserId || '13';

  const clientA = await connectAndJoin(projectRef, DEV_USER_ID);
  const clientB = await connectAndJoin(projectRef, secondUserId);

  clientA.send(
    JSON.stringify({
      type: 'lock_acquire',
      resource: { type: 'track', id: trackId },
    })
  );

  const lockA = await waitForMessage(
    clientA,
    (msg) => msg.type === 'lock' && msg.action === 'acquired' && msg.resource?.id === trackId
  );
  if (lockA.userId !== DEV_USER_ID) {
    console.error('Expected user A to acquire lock');
    process.exit(1);
  }

  clientB.send(
    JSON.stringify({
      type: 'lock_acquire',
      resource: { type: 'track', id: trackId },
    })
  );

  const deniedB = await waitForMessage(
    clientB,
    (msg) => msg.type === 'error' && msg.code === 'LOCK_DENIED'
  );
  if (!deniedB.message) {
    console.error('Expected LOCK_DENIED for user B');
    process.exit(1);
  }

  clientA.send(
    JSON.stringify({
      type: 'lock_release',
      resource: { type: 'track', id: trackId },
    })
  );

  await waitForMessage(
    clientB,
    (msg) => msg.type === 'lock' && msg.action === 'released' && msg.resource?.id === trackId
  );

  clientB.send(
    JSON.stringify({
      type: 'lock_acquire',
      resource: { type: 'track', id: trackId },
    })
  );

  const lockB = await waitForMessage(
    clientB,
    (msg) => msg.type === 'lock' && msg.action === 'acquired' && msg.resource?.id === trackId
  );
  if (lockB.userId !== secondUserId) {
    console.error('Expected user B to acquire lock after release');
    process.exit(1);
  }

  console.log('✅ Step 35 track lock test passed');
  clientA.close();
  clientB.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
