import { createLambdaPool } from '@sterio/db-config';
import {
  ASSET_AUTO_DELETE_GRACE_DAYS,
  PROCESSING_ASSET_GRACE_SECONDS,
} from '@sterio/subscription-utils';
import { deleteProjectAssetBlobs } from './r2Client.js';

const DEFAULT_BATCH_LIMIT = 100;

let _pool = null;

function getPool() {
  if (!_pool) {
    _pool = createLambdaPool();
  }
  return _pool;
}

function parseDryRun(value, fallback = true) {
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

function formatAssetSummary(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    processingStatus: row.processing_status,
    storageKey: row.storage_key,
    waveformKey: row.waveform_url,
    lastReferencedAt: row.last_referenced_at,
    createdAt: row.created_at,
  };
}

/**
 * Find project assets eligible for auto-cleanup per assets.md protection rules.
 */
export async function findEligibleProjectAssets({
  limit = DEFAULT_BATCH_LIMIT,
  projectId = null,
} = {}) {
  const pool = getPool();
  const params = [
    ASSET_AUTO_DELETE_GRACE_DAYS,
    PROCESSING_ASSET_GRACE_SECONDS,
    limit,
  ];
  let projectFilterSql = '';

  if (projectId != null) {
    params.splice(2, 0, projectId);
    projectFilterSql = `AND pa.project_id = $3`;
  }

  const limitParamIndex = projectId != null ? 4 : 3;

  const result = await pool.query(
    `SELECT
       pa.id,
       pa.project_id,
       pa.name,
       pa.storage_key,
       pa.waveform_url,
       pa.processing_status,
       pa.last_referenced_at,
       pa.created_at
     FROM project_assets pa
     WHERE pa.deleted_at IS NULL
       AND pa.last_referenced_at < NOW() - ($1::int * INTERVAL '1 day')
       AND NOT EXISTS (
         SELECT 1 FROM project_clips pc WHERE pc.asset_id = pa.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM project_snapshot_assets psa WHERE psa.asset_id = pa.id
       )
       AND (
         pa.processing_status = 'completed'
         OR (
           pa.processing_status = 'failed'
           AND pa.created_at < NOW() - ($2::int * INTERVAL '1 second')
         )
       )
       ${projectFilterSql}
     ORDER BY pa.last_referenced_at ASC, pa.id ASC
     LIMIT $${limitParamIndex}`,
    params
  );

  return result.rows;
}

async function softDeleteAsset(client, assetId, projectId) {
  const result = await client.query(
    `UPDATE project_assets
     SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = $1
       AND project_id = $2
       AND deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM project_clips pc WHERE pc.asset_id = $1)
       AND NOT EXISTS (SELECT 1 FROM project_snapshot_assets psa WHERE psa.asset_id = $1)
     RETURNING storage_key, waveform_url`,
    [assetId, projectId]
  );

  return result.rows[0] ?? null;
}

/**
 * Run the auto-cleanup job. Defaults to dry-run.
 *
 * @param {object} options
 * @param {boolean} [options.dryRun=true]
 * @param {number} [options.limit=100]
 * @param {number|null} [options.projectId=null]
 */
export async function runProjectAssetCleanup({
  dryRun = true,
  limit = DEFAULT_BATCH_LIMIT,
  projectId = null,
} = {}) {
  const effectiveDryRun = parseDryRun(
    dryRun,
    parseDryRun(process.env.PROJECT_ASSET_CLEANUP_DRY_RUN, true)
  );

  const eligibleRows = await findEligibleProjectAssets({ limit, projectId });
  const eligible = eligibleRows.map(formatAssetSummary);

  if (effectiveDryRun) {
    return {
      dryRun: true,
      eligibleCount: eligible.length,
      deletedCount: 0,
      eligible,
      deleted: [],
      r2Errors: [],
    };
  }

  const pool = getPool();
  const deleted = [];
  const r2Errors = [];

  for (const asset of eligible) {
    const client = await pool.connect();
    let deletedRow = null;

    try {
      await client.query('BEGIN');
      deletedRow = await softDeleteAsset(client, asset.id, asset.projectId);
      if (!deletedRow) {
        await client.query('ROLLBACK');
        continue;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('Failed to soft-delete project asset:', asset.id, err.message);
      throw err;
    } finally {
      client.release();
    }

    const blobResult = await deleteProjectAssetBlobs({
      storageKey: deletedRow.storage_key,
      waveformKey: deletedRow.waveform_url,
    });

    if (blobResult.errors.length > 0) {
      r2Errors.push({
        assetId: asset.id,
        errors: blobResult.errors,
      });
    }

    deleted.push({
      ...asset,
      storageKey: deletedRow.storage_key,
      waveformKey: deletedRow.waveform_url,
    });
  }

  return {
    dryRun: false,
    eligibleCount: eligible.length,
    deletedCount: deleted.length,
    eligible,
    deleted,
    r2Errors,
  };
}
