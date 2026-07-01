import { runProjectAssetCleanup } from './utils/projectAssetCleanup.js';

/**
 * AWS Lambda handler for nightly project asset auto-cleanup.
 *
 * Triggered by EventBridge (nightly) or manual invocation.
 *
 * Event:
 * {
 *   "dryRun": true,
 *   "limit": 100,
 *   "projectId": 123
 * }
 *
 * Env:
 * - PROJECT_ASSET_CLEANUP_DRY_RUN (default "true")
 */

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

  const envDryRunDefault = parseEventBoolean(process.env.PROJECT_ASSET_CLEANUP_DRY_RUN, true);

  const dryRun = parseEventBoolean(source.dryRun ?? source.dry_run, envDryRunDefault);

  const limitRaw = source.limit ?? source.batchLimit ?? source.batch_limit;
  const limit = Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 100;

  const projectIdRaw = source.projectId ?? source.project_id;
  const projectId =
    projectIdRaw != null && String(projectIdRaw).trim() !== ''
      ? Number(projectIdRaw)
      : null;

  return {
    dryRun,
    limit,
    projectId: Number.isFinite(projectId) ? projectId : null,
  };
}

export const handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  console.log('Project asset cleanup lambda started');
  console.log('Event:', JSON.stringify(event, null, 2));

  const options = parseEventOptions(event);
  console.log('Options:', JSON.stringify(options, null, 2));

  try {
    const result = await runProjectAssetCleanup(options);

    const summary = {
      status: 'success',
      operation: result.dryRun ? 'dry_run' : 'cleanup',
      dryRun: result.dryRun,
      eligibleCount: result.eligibleCount,
      deletedCount: result.deletedCount,
      r2ErrorCount: result.r2Errors.length,
      timestamp: new Date().toISOString(),
    };

    console.log('Cleanup summary:', JSON.stringify(summary, null, 2));

    if (result.eligibleCount > 0) {
      console.log(
        'Eligible assets:',
        JSON.stringify(
          result.eligible.map((asset) => ({
            id: asset.id,
            projectId: asset.projectId,
            name: asset.name,
            processingStatus: asset.processingStatus,
            lastReferencedAt: asset.lastReferencedAt,
          })),
          null,
          2
        )
      );
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        ...summary,
        eligible: result.eligible,
        deleted: result.deleted,
        r2Errors: result.r2Errors,
      }),
    };
  } catch (error) {
    console.error('Project asset cleanup failed:', error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};

/**
 * Nightly EventBridge entry point. Dry-run by default until explicitly disabled.
 */
export const timerHandler = async (event, context) => {
  console.log('Scheduled project asset cleanup triggered');

  const modifiedEvent = {
    dryRun: parseEventBoolean(process.env.PROJECT_ASSET_CLEANUP_DRY_RUN, true),
    limit: 100,
  };

  return handler(modifiedEvent, context);
};
