import { getUserPlan, SUBSCRIPTION_TIERS } from '@sterio/subscription-utils';
import pool from '../config/db.js';
import { getProjectLimitsForContext } from './projectAccess.js';

/**
 * Sum of non-deleted asset bytes for a project (user-facing quota).
 *
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {number} projectId
 * @returns {Promise<number>}
 */
async function getProjectStorageUsage(executor, projectId) {
  const result = await executor.query(
    `SELECT COALESCE(SUM(file_size_bytes), 0)::bigint AS used_bytes
     FROM project_assets
     WHERE project_id = $1
       AND deleted_at IS NULL`,
    [projectId]
  );
  return Number(result.rows[0]?.used_bytes ?? 0);
}

/**
 * Enforce per-project storage cap before accepting a new upload.
 *
 * @param {Object} project - projects row (id, team_id, camp_id)
 * @param {Object} user - users row (subscription fields)
 * @param {number} incomingBytes - size of the file about to be uploaded
 * @param {number} [currentUsageBytes] - skip DB lookup when caller already has usage
 * @param {import('pg').Pool | import('pg').PoolClient} [executor=pool] - use transaction client when pool max is held
 * @returns {Promise<{ allowed: true, usedBytes: number, maxBytes: number } | { allowed: false, reason: string, status: number, usedBytes: number, maxBytes: number, upgrade_link?: string }>}
 */
async function checkProjectStorageLimit(
  project,
  user,
  incomingBytes,
  currentUsageBytes = null,
  executor = pool
) {
  const limits = await getProjectLimitsForContext(project, user, executor);
  const maxBytes = limits.max_project_storage_bytes;

  const usedBytes =
    currentUsageBytes != null
      ? currentUsageBytes
      : await getProjectStorageUsage(executor, project.id);

  if (maxBytes === -1) {
    return { allowed: true, usedBytes, maxBytes };
  }

  const incoming = Number(incomingBytes) || 0;
  if (usedBytes + incoming > maxBytes) {
    const limitResponse = {
      allowed: false,
      reason: `Project storage limit reached (${formatBytes(usedBytes)} / ${formatBytes(maxBytes)})`,
      status: 403,
      usedBytes,
      maxBytes,
    };

    if (!project.team_id && !project.camp_id) {
      const tier = getUserPlan(user).id;
      if (tier === SUBSCRIPTION_TIERS.FREE || tier === SUBSCRIPTION_TIERS.BASIC) {
        limitResponse.upgrade_link = `${process.env.FRONTEND_URL || ''}/subscribe`;
      }
    }

    return limitResponse;
  }

  return { allowed: true, usedBytes, maxBytes };
}

function formatBytes(bytes) {
  if (bytes == null || !Number.isFinite(bytes)) return '0 B';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb % 1 === 0 ? gb : gb.toFixed(1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb % 1 === 0 ? mb : mb.toFixed(1)} MB`;
  }
  const kb = bytes / 1024;
  if (kb >= 1) {
    return `${Math.round(kb)} KB`;
  }
  return `${Math.round(bytes)} B`;
}

export { getProjectStorageUsage, checkProjectStorageLimit, formatBytes };
