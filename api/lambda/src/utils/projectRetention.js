import {
  getUserPlan,
  getTeamPlan,
  PROJECT_RETENTION_GRACE_DAYS,
  PROJECT_RETENTION_MIN_SCHEDULE_DAYS,
} from '@sterio/subscription-utils';
import pool from '../config/db.js';

export const RETENTION_REASONS = {
  OWNER_DOWNGRADE: 'owner_downgrade',
  TEAM_DOWNGRADE: 'team_downgrade',
  TEAM_EXPIRED: 'team_expired',
  CAMP_ENDED: 'camp_ended',
};

/**
 * Compute scheduled_deletion_at = triggerDate + grace days, floored so both
 * 7-day and 1-day warning emails can always be sent (min schedule days from now).
 *
 * @param {Date|string|null} triggerDate - expiry or downgrade moment
 * @param {Date} [now]
 * @returns {Date}
 */
export function computeScheduledDeletionAt(triggerDate, now = new Date()) {
  const trigger = triggerDate ? new Date(triggerDate) : now;
  const graceEnd = new Date(trigger);
  graceEnd.setUTCDate(graceEnd.getUTCDate() + PROJECT_RETENTION_GRACE_DAYS);

  const minSchedule = new Date(now);
  minSchedule.setUTCDate(minSchedule.getUTCDate() + PROJECT_RETENTION_MIN_SCHEDULE_DAYS);

  return graceEnd > minSchedule ? graceEnd : minSchedule;
}

/**
 * Clear retention fields (restore access after upgrade/resubscribe).
 *
 * @param {import('pg').Pool | import('pg').PoolClient} executor
 * @param {number[]} projectIds
 */
async function clearProjectRetention(executor, projectIds) {
  if (!projectIds.length) return;
  await executor.query(
    `UPDATE projects SET
       access_revoked_at = NULL,
       scheduled_deletion_at = NULL,
       retention_reason = NULL,
       deletion_warning_7d_sent_at = NULL,
       deletion_warning_1d_sent_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ANY($1::int[])`,
    [projectIds]
  );
}

/**
 * Lock personal projects over the owner's current plan limit (oldest first).
 * Restores any previously locked projects that now fit under the limit.
 *
 * @param {string} userId
 * @param {Object} [options]
 * @param {Date|string|null} [options.triggerDate] - when the downgrade/expiry took effect
 * @param {import('pg').Pool | import('pg').PoolClient} [options.executor]
 * @returns {Promise<{ locked: number[], restored: number[], kept: number[], maxProjects: number }>}
 */
async function reconcileOwnerProjects(userId, options = {}) {
  const executor = options.executor || pool;
  const triggerDate = options.triggerDate ?? new Date();

  const userResult = await executor.query(
    `SELECT id, subscription_tier, subscription_expires_at, stripe_subscription_id
     FROM users WHERE id = $1`,
    [userId]
  );

  if (userResult.rows.length === 0) {
    return { locked: [], restored: [], kept: [], maxProjects: 0 };
  }

  const user = userResult.rows[0];
  const plan = getUserPlan(user);
  const maxProjects = plan.limits.max_projects;

  const projectsResult = await executor.query(
    `SELECT id, created_at, access_revoked_at
     FROM projects
     WHERE owner_id = $1
       AND team_id IS NULL
       AND camp_id IS NULL
     ORDER BY created_at DESC, id DESC`,
    [userId]
  );

  const projects = projectsResult.rows;

  if (maxProjects === -1) {
    const toRestore = projects
      .filter((p) => p.access_revoked_at != null)
      .map((p) => p.id);
    await clearProjectRetention(executor, toRestore);
    return {
      locked: [],
      restored: toRestore,
      kept: projects.map((p) => p.id),
      maxProjects,
    };
  }

  const keepIds = new Set(projects.slice(0, maxProjects).map((p) => p.id));
  const excess = projects.filter((p) => !keepIds.has(p.id));
  const toRestore = projects
    .filter((p) => keepIds.has(p.id) && p.access_revoked_at != null)
    .map((p) => p.id);
  const toLock = excess
    .filter((p) => p.access_revoked_at == null)
    .map((p) => p.id);

  await clearProjectRetention(executor, toRestore);

  if (toLock.length > 0) {
    const scheduledDeletionAt = computeScheduledDeletionAt(triggerDate);
    await executor.query(
      `UPDATE projects SET
         access_revoked_at = COALESCE(access_revoked_at, NOW()),
         scheduled_deletion_at = $2,
         retention_reason = $3,
         deletion_warning_7d_sent_at = NULL,
         deletion_warning_1d_sent_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::int[])`,
      [toLock, scheduledDeletionAt, RETENTION_REASONS.OWNER_DOWNGRADE]
    );
  }

  // Already-locked excess: keep existing scheduled_deletion_at unless missing
  const alreadyLocked = excess
    .filter((p) => p.access_revoked_at != null && !toLock.includes(p.id))
    .map((p) => p.id);

  if (alreadyLocked.length > 0) {
    const scheduledDeletionAt = computeScheduledDeletionAt(triggerDate);
    await executor.query(
      `UPDATE projects SET
         scheduled_deletion_at = COALESCE(scheduled_deletion_at, $2),
         retention_reason = COALESCE(retention_reason, $3),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::int[])
         AND scheduled_deletion_at IS NULL`,
      [alreadyLocked, scheduledDeletionAt, RETENTION_REASONS.OWNER_DOWNGRADE]
    );
  }

  return {
    locked: toLock,
    restored: toRestore,
    kept: [...keepIds],
    maxProjects,
  };
}

/**
 * Lock team projects over the team's current plan max_projects (oldest first).
 *
 * @param {number} teamId
 * @param {Object} [options]
 * @param {string} [options.productVersion] - skip DB lookup when known
 * @param {Date|string|null} [options.triggerDate]
 * @param {import('pg').Pool | import('pg').PoolClient} [options.executor]
 */
async function reconcileTeamProjects(teamId, options = {}) {
  const executor = options.executor || pool;
  const triggerDate = options.triggerDate ?? new Date();

  let productVersion = options.productVersion;
  if (!productVersion) {
    const teamResult = await executor.query(
      'SELECT product_version FROM teams WHERE id = $1',
      [teamId]
    );
    if (teamResult.rows.length === 0) {
      return { locked: [], restored: [], kept: [], maxProjects: 0 };
    }
    productVersion = teamResult.rows[0].product_version;
  }

  const plan = getTeamPlan(productVersion);
  if (!plan) {
    return { locked: [], restored: [], kept: [], maxProjects: 0 };
  }

  const maxProjects = plan.limits.max_projects;

  const projectsResult = await executor.query(
    `SELECT id, created_at, access_revoked_at
     FROM projects
     WHERE team_id = $1
     ORDER BY created_at DESC, id DESC`,
    [teamId]
  );

  const projects = projectsResult.rows;

  if (maxProjects === -1) {
    const toRestore = projects.filter((p) => p.access_revoked_at != null).map((p) => p.id);
    await clearProjectRetention(executor, toRestore);
    return {
      locked: [],
      restored: toRestore,
      kept: projects.map((p) => p.id),
      maxProjects,
    };
  }

  const keepIds = new Set(projects.slice(0, maxProjects).map((p) => p.id));
  const excess = projects.filter((p) => !keepIds.has(p.id));
  const toRestore = projects
    .filter((p) => keepIds.has(p.id) && p.access_revoked_at != null)
    .map((p) => p.id);
  const toLock = excess.filter((p) => p.access_revoked_at == null).map((p) => p.id);

  await clearProjectRetention(executor, toRestore);

  if (toLock.length > 0) {
    const scheduledDeletionAt = computeScheduledDeletionAt(triggerDate);
    await executor.query(
      `UPDATE projects SET
         access_revoked_at = COALESCE(access_revoked_at, NOW()),
         scheduled_deletion_at = $2,
         retention_reason = $3,
         deletion_warning_7d_sent_at = NULL,
         deletion_warning_1d_sent_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::int[])`,
      [toLock, scheduledDeletionAt, RETENTION_REASONS.TEAM_DOWNGRADE]
    );
  }

  const alreadyLocked = excess
    .filter((p) => p.access_revoked_at != null && !toLock.includes(p.id))
    .map((p) => p.id);

  if (alreadyLocked.length > 0) {
    const scheduledDeletionAt = computeScheduledDeletionAt(triggerDate);
    await executor.query(
      `UPDATE projects SET
         scheduled_deletion_at = COALESCE(scheduled_deletion_at, $2),
         retention_reason = COALESCE(retention_reason, $3),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::int[])
         AND scheduled_deletion_at IS NULL`,
      [alreadyLocked, scheduledDeletionAt, RETENTION_REASONS.TEAM_DOWNGRADE]
    );
  }

  return {
    locked: toLock,
    restored: toRestore,
    kept: [...keepIds],
    maxProjects,
  };
}

export { reconcileOwnerProjects, reconcileTeamProjects, clearProjectRetention };
