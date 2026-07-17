import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { createLambdaPool } from '@sterio/db-config';
import { handler, timerHandler } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DB_HOST) {
  dotenv.config({ path: path.join(__dirname, '.env') });
}

const mockContext = {
  callbackWaitsForEmptyEventLoop: false,
  functionName: 'data-cleanup-local',
  getRemainingTimeInMillis: () => 900000,
};

async function checkDatabaseConnection() {
  const pool = createLambdaPool();
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    console.log('Database connection OK');
  } finally {
    client.release();
    await pool.end();
  }
}

async function main() {
  const mode = process.argv[2] || 'dry-run';
  const projectIdArg = process.argv[3];

  if (!fs.existsSync(path.join(__dirname, '.env')) && !process.env.DB_HOST) {
    console.error('Missing .env — copy api/lambda/.env or configure DB_* env vars.');
    process.exit(1);
  }

  await checkDatabaseConnection();

  const projectId =
    projectIdArg != null && String(projectIdArg).trim() !== ''
      ? Number(projectIdArg)
      : null;

  if (mode === 'timer') {
    const response = await timerHandler({}, mockContext);
    console.log(JSON.stringify(JSON.parse(response.body), null, 2));
    return;
  }

  if (mode === 'assets') {
    const response = await handler(
      {
        tasks: ['assetCleanup'],
        dryRun: true,
        assetCleanup: {
          projectId: Number.isFinite(projectId) ? projectId : null,
        },
      },
      mockContext
    );
    console.log(JSON.stringify(JSON.parse(response.body), null, 2));
    return;
  }

  if (mode === 'retention') {
    const response = await handler(
      {
        tasks: ['retention'],
        dryRun: true,
      },
      mockContext
    );
    console.log(JSON.stringify(JSON.parse(response.body), null, 2));
    return;
  }

  if (mode === 'execute') {
    const response = await handler(
      {
        dryRun: false,
        assetCleanup: {
          projectId: Number.isFinite(projectId) ? projectId : null,
        },
      },
      mockContext
    );
    console.log(JSON.stringify(JSON.parse(response.body), null, 2));
    return;
  }

  const response = await handler(
    {
      dryRun: true,
      assetCleanup: {
        projectId: Number.isFinite(projectId) ? projectId : null,
      },
    },
    mockContext
  );
  console.log(JSON.stringify(JSON.parse(response.body), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
