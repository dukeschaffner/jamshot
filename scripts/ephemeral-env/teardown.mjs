#!/usr/bin/env node
/**
 * Drop the ephemeral local database. Does not delete env/.env.ephemeral.
 *
 *   npm run ephemeral:teardown
 *   JAMSHOT_ENV=ephemeral node scripts/ephemeral-env/teardown.mjs --confirm
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadDevEnv, REPO_ROOT } from '@sterio/dev-env';

const require = createRequire(path.join(REPO_ROOT, 'api/lambda/package.json'));
const { Client } = require('pg');

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

function assertEphemeralTarget({ profile, dbName }) {
  if (profile !== 'ephemeral') {
    throw new Error(`Refusing to teardown unless JAMSHOT_ENV=ephemeral (got ${profile})`);
  }
  if (!/ephemeral/i.test(dbName)) {
    throw new Error(`Refusing to drop database "${dbName}" (name must contain "ephemeral")`);
  }
}

async function dropDatabase(maintenanceConnectionString, dbName) {
  const client = new Client({ connectionString: maintenanceConnectionString });
  await client.connect();
  try {
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (existing.rowCount === 0) {
      return false;
    }

    await client.query(
      `
      SELECT pg_terminate_backend(pid)
      FROM pg_stat_activity
      WHERE datname = $1
        AND pid <> pg_backend_pid()
      `,
      [dbName]
    );
    await client.query(`DROP DATABASE ${quoteIdent(dbName)}`);
    return true;
  } finally {
    await client.end();
  }
}

async function main() {
  if (!process.env.JAMSHOT_ENV) {
    process.env.JAMSHOT_ENV = 'ephemeral';
  }

  const confirm = process.argv.includes('--confirm');
  const loaded = loadDevEnv({ required: true });
  if (loaded.skipped) {
    throw new Error(`Refusing to teardown (env skipped: ${loaded.skipped})`);
  }

  const connectionString = process.env.DB_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('DB_CONNECTION_STRING is not set after loading env');
  }

  const { dbName, maintenanceConnectionString } = parseConnection(connectionString);
  assertEphemeralTarget({ profile: loaded.profile, dbName });

  console.log(`Target DB: ${dbName}`);

  if (!confirm) {
    console.log('\nDry run. Re-run with --confirm to drop the database.');
    return;
  }

  const dropped = await dropDatabase(maintenanceConnectionString, dbName);
  if (dropped) {
    console.log(`Dropped database ${dbName}`);
  } else {
    console.log(`Database ${dbName} does not exist`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
