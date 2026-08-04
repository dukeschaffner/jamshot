#!/usr/bin/env node
/**
 * Manual test: join with stale revision → server sends full `state` + lock snapshots.
 *
 * Usage:
 *   node api/lambda/testing/project-ws-resync-test.js --projectId=1
 *   node api/lambda/testing/project-ws-resync-test.js --projectGuid=<uuid>
 *
 * Requires project-ws dev server running (npm run dev in functions/lambda/project-ws).
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { PROJECT_WS_DEV_PORT } = await import('../src/projectWs/projectWsConfig.js');
const { shouldSendFullStateOnJoin } = await import('../src/projectWs/projectWsResync.js');

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

function collectMessages(ws, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const messages = [];
    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      resolve(messages);
    }, timeoutMs);

    const onMessage = (data) => {
      messages.push(JSON.parse(data.toString()));
    };

    ws.on('message', onMessage);
    ws.once('error', (err) => {
      clearTimeout(timer);
      ws.off('message', onMessage);
      reject(err);
    });
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRef = args.projectGuid || args.projectId;
  if (!projectRef) {
    console.error('Provide --projectId=<id> or --projectGuid=<uuid>');
    process.exit(1);
  }

  process.env.NODE_ENV = process.env.NODE_ENV || 'dev';

  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  let projectId;
  let serverRevision;

  try {
    const projectQuery = /^\d+$/.test(String(projectRef))
      ? 'SELECT id, revision FROM projects WHERE id = $1'
      : 'SELECT id, revision FROM projects WHERE guid = $1::uuid';
    const projectResult = await pool.query(projectQuery, [projectRef]);
    if (projectResult.rows.length === 0) {
      console.error('Project not found');
      process.exit(1);
    }
    projectId = projectResult.rows[0].id;
    serverRevision = Number(projectResult.rows[0].revision);
  } finally {
    await pool.end();
  }

  const staleRevision = serverRevision > 1 ? serverRevision - 1 : null;
  const currentRevision = serverRevision;

  console.log(`Server revision: ${serverRevision}`);
  console.log(`Stale join revision: ${staleRevision}`);
  console.log(`shouldSendFullStateOnJoin(stale): ${shouldSendFullStateOnJoin(staleRevision, serverRevision)}`);
  console.log(`shouldSendFullStateOnJoin(current): ${shouldSendFullStateOnJoin(currentRevision, serverRevision)}`);

  if (!shouldSendFullStateOnJoin(staleRevision, serverRevision)) {
    console.error('Test setup error: stale revision should trigger resync');
    process.exit(1);
  }

  if (shouldSendFullStateOnJoin(currentRevision, serverRevision)) {
    console.error('Test setup error: current revision should not trigger resync');
    process.exit(1);
  }

  const url = `${WS_URL}?devUserId=${encodeURIComponent(DEV_USER_ID)}`;
  console.log(`Connecting to ${url}`);

  const ws = new WebSocket(url);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });

  const collector = collectMessages(ws);

  ws.send(
    JSON.stringify({
      type: 'join',
      projectId: projectRef,
      revision: staleRevision,
      protocolVersion: 1,
    })
  );

  const messages = await collector;
  ws.close();

  const joined = messages.find((msg) => msg.type === 'joined');
  const state = messages.find((msg) => msg.type === 'state');
  const lockMessages = messages.filter((msg) => msg.type === 'lock');

  console.log('Messages received:', messages.map((msg) => msg.type));

  if (!joined) {
    console.error('Expected joined response');
    process.exit(1);
  }

  if (joined.revision !== serverRevision) {
    console.error(`Expected joined.revision ${serverRevision}, got ${joined.revision}`);
    process.exit(1);
  }

  if (!state) {
    console.error('Expected state response for stale revision join');
    process.exit(1);
  }

  if (state.revision !== serverRevision) {
    console.error(`Expected state.revision ${serverRevision}, got ${state.revision}`);
    process.exit(1);
  }

  if (!state.project || !Array.isArray(state.project.tracks)) {
    console.error('Expected state.project with tracks array');
    process.exit(1);
  }

  console.log(`Lock snapshots: ${lockMessages.length}`);
  console.log(`State tracks: ${state.project.tracks.length}`);
  console.log('✅ Step 38 reconnect + full resync test passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
