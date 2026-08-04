import { runProjectAssetCleanup } from './utils/projectAssetCleanup.js';
import { runProjectRetention } from './utils/projectRetention.js';

/**
 * Nightly data-cleanup lambda.
 *
 * Tasks:
 * - projectAssetCleanup: unused project assets past grace
 * - projectRetention: subscription expiry/downgrade lock, warning emails, hard-delete
 *
 * Event:
 * {
 *   "tasks": ["assetCleanup", "retention"],  // optional; default both
 *   "dryRun": true,
 *   "assetCleanup": { "dryRun": true, "limit": 100, "projectId": 123 },
 *   "retention": { "dryRun": true, "limit": 50 }
 * }
 *
 * Env:
 * - PROJECT_ASSET_CLEANUP_DRY_RUN (default "true")
 * - PROJECT_RETENTION_DRY_RUN (default "true")
 */

const ALL_TASKS = ['assetCleanup', 'retention'];

function parseEventBoolean(value, fallback) {
  if (value === undefined || value === null) {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return fallback;
}

function parseEventOptions(event = {}) {
  const detail = event.detail && typeof event.detail === 'object' ? event.detail : {};
  const source = { ...detail, ...event };

  let tasks = ALL_TASKS;
  if (Array.isArray(source.tasks) && source.tasks.length > 0) {
    tasks = source.tasks
      .map((t) => {
        if (t === 'projectAssetCleanup' || t === 'asset_cleanup') return 'assetCleanup';
        if (t === 'projectRetention' || t === 'project_retention') return 'retention';
        return t;
      })
      .filter((t) => ALL_TASKS.includes(t));
    if (tasks.length === 0) {
      tasks = ALL_TASKS;
    }
  }

  const globalDryRun =
    source.dryRun != null || source.dry_run != null
      ? parseEventBoolean(source.dryRun ?? source.dry_run, undefined)
      : undefined;

  const assetOpts = source.assetCleanup || source.asset_cleanup || {};
  const retentionOpts = source.retention || {};

  return {
    tasks,
    assetCleanup: {
      dryRun:
        assetOpts.dryRun != null || assetOpts.dry_run != null
          ? parseEventBoolean(assetOpts.dryRun ?? assetOpts.dry_run, true)
          : globalDryRun,
      limit: assetOpts.limit ?? assetOpts.batchLimit ?? assetOpts.batch_limit,
      projectId: assetOpts.projectId ?? assetOpts.project_id ?? source.projectId ?? source.project_id,
    },
    retention: {
      dryRun:
        retentionOpts.dryRun != null || retentionOpts.dry_run != null
          ? parseEventBoolean(retentionOpts.dryRun ?? retentionOpts.dry_run, true)
          : globalDryRun,
      limit: retentionOpts.limit ?? source.limit,
    },
  };
}

async function runTask(name, fn) {
  const startedAt = Date.now();
  try {
    const result = await fn();
    return {
      status: 'success',
      durationMs: Date.now() - startedAt,
      result,
    };
  } catch (error) {
    console.error(`Task ${name} failed:`, error);
    return {
      status: 'error',
      durationMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.log('Data cleanup lambda started');
  console.log('Event:', JSON.stringify(event, null, 2));

  const options = parseEventOptions(event);
  console.log('Options:', JSON.stringify(options, null, 2));

  const results = {};

  if (options.tasks.includes('assetCleanup')) {
    const assetArgs = {
      limit: options.assetCleanup.limit,
      projectId:
        options.assetCleanup.projectId != null &&
        Number.isFinite(Number(options.assetCleanup.projectId))
          ? Number(options.assetCleanup.projectId)
          : null,
    };
    if (options.assetCleanup.dryRun !== undefined) {
      assetArgs.dryRun = options.assetCleanup.dryRun;
    }
    results.assetCleanup = await runTask('assetCleanup', () =>
      runProjectAssetCleanup(assetArgs)
    );
  }

  if (options.tasks.includes('retention')) {
    const retentionArgs = {};
    if (options.retention.dryRun !== undefined) {
      retentionArgs.dryRun = options.retention.dryRun;
    }
    if (options.retention.limit !== undefined) {
      retentionArgs.limit = options.retention.limit;
    }
    results.retention = await runTask('retention', () =>
      runProjectRetention(retentionArgs)
    );
  }

  const anyError = Object.values(results).some((r) => r.status === 'error');
  const summary = {
    status: anyError ? 'partial_error' : 'success',
    tasks: options.tasks,
    timestamp: new Date().toISOString(),
    results,
  };

  console.log('Data cleanup summary:', JSON.stringify(summary, null, 2));

  return {
    statusCode: anyError ? 500 : 200,
    body: JSON.stringify(summary),
  };
};

/**
 * Nightly EventBridge entry point.
 */
export const timerHandler = async (event, context) => {
  console.log('Scheduled data cleanup triggered');
  return handler(
    {
      tasks: ALL_TASKS,
    },
    context
  );
};
