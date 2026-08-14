import '@sterio/dev-env/config';
import { createLambdaPool } from '@sterio/db-config';
import { handler, timerHandler } from './index.js';

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

  if (!process.env.DB_HOST) {
    console.error('Missing DB_HOST — check env/.env.dev.');
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
