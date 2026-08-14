#!/usr/bin/env node
/**
 * Delete all rows in the ephemeral DB except feature_flags, and empty the ephemeral R2 bucket.
 *
 *   npm run ephemeral:wipe
 *   JAMSHOT_ENV=ephemeral node scripts/ephemeral-env/wipe.mjs --confirm
 */
import path from 'node:path';
import { createRequire } from 'node:module';
import { loadDevEnv, REPO_ROOT } from '@sterio/dev-env';

const require = createRequire(path.join(REPO_ROOT, 'api/lambda/package.json'));
const { Client } = require('pg');
const {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} = require('@aws-sdk/client-s3');

const KEEP_TABLES = new Set(['feature_flags']);

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function parseDbName(connectionString) {
  const url = new URL(connectionString);
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!dbName) {
    throw new Error('DB_CONNECTION_STRING is missing a database name');
  }
  return dbName;
}

function assertEphemeralTarget({ profile, dbName, bucket }) {
  if (profile !== 'ephemeral') {
    throw new Error(`Refusing to wipe unless JAMSHOT_ENV=ephemeral (got ${profile})`);
  }
  if (!/ephemeral/i.test(dbName)) {
    throw new Error(`Refusing to wipe database "${dbName}" (name must contain "ephemeral")`);
  }
  if (!bucket || !/ephemeral/i.test(bucket)) {
    throw new Error(`Refusing to wipe R2 bucket "${bucket || ''}" (name must contain "ephemeral")`);
  }
}

function getS3Client() {
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const endpoint = process.env.R2_ENDPOINT;
  if (!accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error('R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT are required');
  }

  return new S3Client({
    region: 'auto',
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
  });
}

async function wipeDatabase(connectionString) {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const { rows } = await client.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> ALL($1::text[])
      ORDER BY tablename
    `, [[...KEEP_TABLES]]);

    const tables = rows.map((row) => row.tablename);
    if (tables.length === 0) {
      return { truncated: [] };
    }

    await client.query(`TRUNCATE TABLE ${tables.map(quoteIdent).join(', ')} RESTART IDENTITY`);
    return { truncated: tables };
  } finally {
    await client.end();
  }
}

async function emptyBucket(bucket) {
  const s3 = getS3Client();
  let continuationToken;
  let deleted = 0;

  do {
    const listResult = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      })
    );

    const keys = (listResult.Contents || [])
      .map((object) => object.Key)
      .filter(Boolean)
      .map((key) => ({ Key: key }));

    if (keys.length > 0) {
      const deleteResult = await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: keys, Quiet: true },
        })
      );

      deleted += keys.length - (deleteResult.Errors?.length ?? 0);
      if (deleteResult.Errors?.length) {
        const first = deleteResult.Errors[0];
        throw new Error(`Failed to delete R2 object ${first.Key}: ${first.Message}`);
      }
    }

    continuationToken = listResult.IsTruncated
      ? listResult.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return deleted;
}

async function main() {
  if (!process.env.JAMSHOT_ENV) {
    process.env.JAMSHOT_ENV = 'ephemeral';
  }

  const confirm = process.argv.includes('--confirm');
  const loaded = loadDevEnv({ required: true });
  if (loaded.skipped) {
    throw new Error(`Refusing to wipe (env skipped: ${loaded.skipped})`);
  }

  const connectionString = process.env.DB_CONNECTION_STRING;
  if (!connectionString) {
    throw new Error('DB_CONNECTION_STRING is not set after loading env');
  }

  const dbName = parseDbName(connectionString);
  const bucket = process.env.R2_BUCKET;
  assertEphemeralTarget({ profile: loaded.profile, dbName, bucket });

  console.log(`Target DB: ${dbName}`);
  console.log(`Target R2: ${bucket}`);
  console.log(`Keeping tables: ${[...KEEP_TABLES].join(', ')}`);

  if (!confirm) {
    console.log('\nDry run. Re-run with --confirm to delete.');
    return;
  }

  const dbResult = await wipeDatabase(connectionString);
  console.log(`Truncated ${dbResult.truncated.length} tables`);

  const deletedObjects = await emptyBucket(bucket);
  console.log(`Deleted ${deletedObjects} R2 objects from ${bucket}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
