#!/usr/bin/env node
/**
 * Manual test: connect to project WS, send join, verify DB row.
 *
 * Usage:
 *   node api/lambda/testing/project-ws-connect-test.js --projectId=1
 *   node api/lambda/testing/project-ws-connect-test.js --projectGuid=<uuid>
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

function waitForMessage(ws, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for WS message')), timeoutMs);
    ws.once('message', (data) => {
      clearTimeout(timer);
      resolve(JSON.parse(data.toString()));
    });
    ws.once('error', (err) => {
      clearTimeout(timer);
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

  const url = `${WS_URL}?devUserId=${encodeURIComponent(DEV_USER_ID)}`;
  console.log(`Connecting to ${url}`);

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

  const response = await waitForMessage(ws);
  console.log('Server response:', response);

  if (response.type !== 'joined') {
    console.error('Expected joined response');
    process.exit(1);
  }

  const pool = new pg.Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const rows = await pool.query(
      `SELECT connection_id, project_id, user_id
       FROM project_ws_connections
       WHERE user_id = $1 AND project_id = $2
       ORDER BY connected_at DESC
       LIMIT 1`,
      [DEV_USER_ID, response.projectId]
    );

    if (rows.rows.length === 0) {
      console.error('No project_ws_connections row found after join');
      process.exit(1);
    }

    console.log('DB row:', rows.rows[0]);
    console.log('✅ Step 33 connect + join test passed');
  } finally {
    ws.close();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
