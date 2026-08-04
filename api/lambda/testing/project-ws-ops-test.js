#!/usr/bin/env node
/**
 * Manual test: WS op broadcast — Tab A clip.move → Tab B receives op.
 *
 * Usage:
 *   node api/lambda/testing/project-ws-ops-test.js --projectId=1 --clipId=1 --trackId=1
 */
import dotenv from 'dotenv';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { PROJECT_WS_DEV_PORT } = await import('../src/projectWs/projectWsConfig.js');
const pool = (await import('../src/config/db.js')).default;

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

function waitForMessage(ws, predicate, timeoutMs = 8000) {
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

  const joined = await waitForMessage(ws, (msg) => msg.type === 'joined');
  return { ws, joined };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRef = args.projectGuid || args.projectId;
  const clipId = Number(args.clipId || 1);
  const trackId = Number(args.trackId || 1);
  const startTime = Number(args.startTime ?? 5);

  if (!projectRef) {
    console.error('Provide --projectId=<id> or --projectGuid=<uuid>');
    process.exit(1);
  }

  process.env.NODE_ENV = process.env.NODE_ENV || 'dev';
  const secondUserId = args.secondUserId || '13';

  const revisionResult = await pool.query('SELECT revision FROM projects WHERE id = $1', [
    Number(projectRef) || projectRef,
  ]);
  let baseRevision = revisionResult.rows[0]?.revision
    ? Number(revisionResult.rows[0].revision)
    : 1;

  const clientA = await connectAndJoin(projectRef, DEV_USER_ID);
  baseRevision = clientA.joined.revision ?? baseRevision;
  const clientB = await connectAndJoin(projectRef, secondUserId);

  clientA.ws.send(
    JSON.stringify({
      type: 'lock_acquire',
      resource: { type: 'track', id: trackId },
    })
  );
  await waitForMessage(
    clientA.ws,
    (msg) => msg.type === 'lock' && msg.action === 'acquired' && msg.resource?.id === trackId
  );

  const opId = randomUUID();
  const opPromise = waitForMessage(
    clientB.ws,
    (msg) =>
      msg.type === 'op' &&
      msg.payload?.kind === 'clip.move' &&
      msg.payload?.clipId === clipId &&
      msg.payload?.startTime === startTime
  );

  clientA.ws.send(
    JSON.stringify({
      type: 'op',
      opId,
      baseRevision,
      payload: {
        kind: 'clip.move',
        clipId,
        trackId,
        startTime,
      },
    })
  );

  const ack = await waitForMessage(
    clientA.ws,
    (msg) => msg.type === 'op_ack' && msg.opId === opId
  );

  const remoteOp = await opPromise;

  if (remoteOp.fromUserId !== DEV_USER_ID) {
    console.error('Expected remote op from user A');
    process.exit(1);
  }

  if (ack.revision !== remoteOp.revision) {
    console.error('ACK revision should match broadcast revision');
    process.exit(1);
  }

  const clipRow = await pool.query(
    'SELECT start_time_seconds FROM project_clips WHERE id = $1',
    [clipId]
  );
  if (Number(clipRow.rows[0]?.start_time_seconds) !== startTime) {
    console.error('Clip start_time_seconds not persisted');
    process.exit(1);
  }

  console.log('✅ Step 36 WS op broadcast test passed');
  clientA.ws.close();
  clientB.ws.close();
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await pool.end();
  } catch {
    // ignore
  }
  process.exit(1);
});
