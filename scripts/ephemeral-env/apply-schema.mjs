#!/usr/bin/env node
/**
 * Apply docs/database/schema/*.sql to the database from the loaded env overlay.
 *
 *   npm run ephemeral:setup
 *   JAMSHOT_ENV=ephemeral node scripts/ephemeral-env/apply-schema.mjs
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDevEnv, REPO_ROOT } from '@sterio/dev-env';

const require = createRequire(path.join(REPO_ROOT, 'api/lambda/package.json'));
const { Client } = require('pg');

const SCHEMA_DIR = path.join(REPO_ROOT, 'docs/database/schema');

// FK-safe order. tracks.competition_id is deferred until after competitions.sql.
const SCHEMA_FILES = [
  'users.sql',
  'landing.sql',
  'feature_flags.sql',
  'release_notes.sql',
  'predefined_groups.sql',
  'auth.sql',
  'teams.sql',
  'camps.sql',
  'tracks.sql',
  'competitions.sql',
  'taxonomies.sql',
  'social.sql',
  'payments.sql',
  'user_bans.sql',
  'video_exports.sql',
  'analytics.sql',
  'projects.sql',
  'project_realtime.sql',
  'notifications.sql',
  'outreach.sql',
];

const TRACKS_COMPETITION_FK = `
ALTER TABLE tracks
  ADD CONSTRAINT tracks_competition_id_fkey
  FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL;
`;

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseConnection(connectionString) {
  const url = new URL(connectionString);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName) {
    throw new Error('DB_CONNECTION_STRING is missing a database name');
  }
  const maintenance = new URL(connectionString);
  maintenance.pathname = '/postgres';
  return { dbName, maintenanceConnectionString: maintenance.toString() };
}

function prepareSql(filename, sql) {
  let prepared = sql;
  if (filename === 'tracks.sql') {
    prepared = prepared.replace(
      /competition_id INT REFERENCES competitions\(id\) ON DELETE SET NULL/,
      'competition_id INT'
    );
  }
  return prepared.replace(
    /CREATE\s+(UNIQUE\s+)?INDEX\s+(?!IF\s+NOT\s+EXISTS)/gi,
    (_match, unique) => `CREATE ${unique || ''}INDEX IF NOT EXISTS `
  );
}

async function ensureDatabase(connectionString, dbName) {
  const { maintenanceConnectionString } = parseConnection(connectionString);
  const client = new Client({ connectionString: maintenanceConnectionString });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (existing.rowCount > 0) {
      return;
    }
    console.log(`Creating database ${dbName}...`);
    await client.query(`CREATE DATABASE ${quoteIdent(dbName)}`);
  } finally {
    await client.end();
  }
}

async function applySchema(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

    for (const filename of SCHEMA_FILES) {
      const filePath = path.join(SCHEMA_DIR, filename);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Schema file not found: ${filePath}`);
      }
      const sql = prepareSql(filename, fs.readFileSync(filePath, 'utf8'));
      process.stdout.write(`  ${filename}...`);
      await client.query(sql);
      if (filename === 'competitions.sql') {
        await client.query(TRACKS_COMPETITION_FK);
      }
      console.log(' ok');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

async function main() {
  if (!process.env.JAMSHOT_ENV) {
    process.env.JAMSHOT_ENV = 'ephemeral';
  }

  const loaded = loadDevEnv({ required: true });
  const connectionString = process.env.DB_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('DB_CONNECTION_STRING is not set after loading env');
  }

  const { dbName } = parseConnection(connectionString);
  const names = loaded.files.map((filePath) => path.relative(REPO_ROOT, filePath));
  console.log(`Applying schema to ${dbName}`);
  console.log(`Env: ${loaded.profile} (${names.join(' → ')})`);

  await ensureDatabase(connectionString, dbName);
  await applySchema(connectionString);

  console.log(`Schema applied to ${dbName}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
