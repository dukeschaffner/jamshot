#!/usr/bin/env node
/**
 * Manual test: two WS clients join same project and receive presence broadcasts.
 *
 * Usage:
 *   node api/lambda/testing/project-ws-presence-test.js --projectId=1
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

async function connectAndJoin(projectRef, userId, label) {
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

  const joined = await waitForMessage(ws, (msg) => msg.type === 'joined');
  console.log(`[${label}] joined project ${joined.projectId}`);

  const presence = await waitForMessage(ws, (msg) => msg.type === 'presence');
  console.log(`[${label}] presence users:`, presence.users?.length ?? 0);

  return { ws, presence };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRef = args.projectGuid || args.projectId;
  if (!projectRef) {
    console.error('Provide --projectId=<id> or --projectGuid=<uuid>');
    process.exit(1);
  }

  process.env.NODE_ENV = process.env.NODE_ENV || 'dev';

  const secondUserId = args.secondUserId || '13';

  const clientA = await connectAndJoin(projectRef, DEV_USER_ID, 'A');

  const presencePromiseA = waitForMessage(
    clientA.ws,
    (msg) => msg.type === 'presence' && msg.users?.length >= 2
  );

  const clientB = await connectAndJoin(projectRef, secondUserId, 'B');

  const presenceA = await presencePromiseA;
  const presenceB = clientB.presence;

  if (presenceB.users.length < 2) {
    console.error('Client B expected 2 users on join, got', presenceB.users.length);
    process.exit(1);
  }

  if (presenceA.users.length < 2) {
    console.error('Client A expected broadcast with 2 users, got', presenceA.users.length);
    process.exit(1);
  }

  console.log('✅ Step 34 presence broadcast test passed');
  clientA.ws.close();
  clientB.ws.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
