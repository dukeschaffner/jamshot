import { createLambdaPool } from '@sterio/db-config';
import {
  getUserPlan,
  getTeamPlan,
  PROJECT_RETENTION_GRACE_DAYS,
  PROJECT_RETENTION_MIN_SCHEDULE_DAYS,
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_TIERS,
} from '@sterio/subscription-utils';
import Stripe from 'stripe';
import { deleteProjectAssetBlobs } from './r2Client.js';

const RETENTION_REASONS = {
  OWNER_DOWNGRADE: 'owner_downgrade',
  TEAM_DOWNGRADE: 'team_downgrade',
  TEAM_EXPIRED: 'team_expired',
  CAMP_ENDED: 'camp_ended',
};

let _pool = null;
let _stripe = null;

function getPool() {
  if (!_pool) {
    _pool = createLambdaPool();
  }
  return _pool;
}

function getStripe() {
  if (!_stripe && process.env.STRIPE_SECRET_KEY) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

function parseDryRun(value, fallback = true) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return fallback;
}

function computeScheduledDeletionAt(triggerDate, now = new Date()) {
  const trigger = triggerDate ? new Date(triggerDate) : now;
  const graceEnd = new Date(trigger);
  graceEnd.setUTCDate(graceEnd.getUTCDate() + PROJECT_RETENTION_GRACE_DAYS);

  const minSchedule = new Date(now);
  minSchedule.setUTCDate(minSchedule.getUTCDate() + PROJECT_RETENTION_MIN_SCHEDULE_DAYS);

  return graceEnd > minSchedule ? graceEnd : minSchedule;
}

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
 * Lock excess personal projects for one owner (newest N kept).
 */
async function reconcileOwnerProjects(executor, user, triggerDate = new Date()) {
  const plan = getUserPlan(user);
  const maxProjects = plan.limits.max_projects;

  const projectsResult = await executor.query(
    `SELECT id, created_at, access_revoked_at
     FROM projects
     WHERE owner_id = $1
       AND team_id IS NULL
       AND camp_id IS NULL
     ORDER BY created_at DESC, id DESC`,
    [user.id]
  );

  const projects = projectsResult.rows;
  const locked = [];
  const restored = [];

  if (maxProjects === -1) {
    const toRestore = projects.filter((p) => p.access_revoked_at != null).map((p) => p.id);
    await clearProjectRetention(executor, toRestore);
    return { locked, restored: toRestore };
  }

  const keepIds = new Set(projects.slice(0, maxProjects).map((p) => p.id));
  const excess = projects.filter((p) => !keepIds.has(p.id));
  const toRestore = projects
    .filter((p) => keepIds.has(p.id) && p.access_revoked_at != null)
    .map((p) => p.id);
  const toLock = excess.filter((p) => p.access_revoked_at == null).map((p) => p.id);

  await clearProjectRetention(executor, toRestore);
  restored.push(...toRestore);

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
    locked.push(...toLock);
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
      [alreadyLocked, scheduledDeletionAt, RETENTION_REASONS.OWNER_DOWNGRADE]
    );
  }

  return { locked, restored };
}

/**
 * If stripe_subscription_id is still set past expiry, verify with Stripe before locking.
 * Returns true when it is safe to treat the user as expired/free.
 */
async function confirmUserSubscriptionExpired(user) {
  if (!user.subscription_expires_at) return false;
  if (new Date(user.subscription_expires_at) >= new Date()) return false;

  if (!user.stripe_subscription_id) return true;

  const stripe = getStripe();
  if (!stripe) {
    console.warn(
      `Stripe not configured; skipping retention lock for user ${user.id} with active stripe_subscription_id`
    );
    return false;
  }

  try {
    const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      const periodEnd = new Date(subscription.current_period_end * 1000);
      await getPool().query(
        `UPDATE users SET subscription_expires_at = $1 WHERE id = $2`,
        [periodEnd, user.id]
      );
      console.log(
        `User ${user.id} still has active Stripe sub; refreshed expiry to ${periodEnd.toISOString()}`
      );
      return false;
    }
    return true;
  } catch (err) {
    if (err?.statusCode === 404 || err?.code === 'resource_missing') {
      return true;
    }
    console.error(`Stripe verify failed for user ${user.id}:`, err.message);
    return false;
  }
}

async function markContextProjects(executor, { projectIds, reason, triggerDate, dryRun }) {
  if (!projectIds.length) return 0;
  if (dryRun) return projectIds.length;

  const scheduledDeletionAt = computeScheduledDeletionAt(triggerDate);
  await executor.query(
    `UPDATE projects SET
       access_revoked_at = COALESCE(access_revoked_at, NOW()),
       scheduled_deletion_at = COALESCE(scheduled_deletion_at, $2),
       retention_reason = COALESCE(retention_reason, $3),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ANY($1::int[])
       AND access_revoked_at IS NULL`,
    [projectIds, scheduledDeletionAt, reason]
  );
  return projectIds.length;
}

async function reconcileMarks({ dryRun }) {
  const pool = getPool();
  const summary = {
    personalOwnersChecked: 0,
    personalLocked: 0,
    personalRestored: 0,
    teamProjectsMarked: 0,
    campProjectsMarked: 0,
    teamProjectsRestored: 0,
    campProjectsRestored: 0,
    skippedStripeActive: 0,
  };

  // Personal: users who may need reconcile (expired paid, or any with revoked projects, or over free count)
  const freeMaxProjects =
    SUBSCRIPTION_PLANS[SUBSCRIPTION_TIERS.FREE].limits.max_projects;

  const usersResult = await pool.query(
    `SELECT u.id, u.subscription_tier, u.subscription_expires_at, u.stripe_subscription_id, u.email, u.username
     FROM users u
     WHERE (
       u.subscription_expires_at IS NOT NULL AND u.subscription_expires_at < NOW()
     )
     OR EXISTS (
       SELECT 1 FROM projects p
       WHERE p.owner_id = u.id
         AND p.team_id IS NULL
         AND p.camp_id IS NULL
         AND p.access_revoked_at IS NOT NULL
     )
     OR (
       SELECT COUNT(*) FROM projects p
       WHERE p.owner_id = u.id
         AND p.team_id IS NULL
         AND p.camp_id IS NULL
         AND p.access_revoked_at IS NULL
     ) > $1`,
    [freeMaxProjects]
  );

  for (const user of usersResult.rows) {
    summary.personalOwnersChecked += 1;

    const expired =
      user.subscription_expires_at && new Date(user.subscription_expires_at) < new Date();

    if (expired) {
      const confirmed = await confirmUserSubscriptionExpired(user);
      if (!confirmed) {
        summary.skippedStripeActive += 1;
        // Still try restore path if Stripe refreshed them to active — reload user
        const refreshed = await pool.query(
          `SELECT id, subscription_tier, subscription_expires_at, stripe_subscription_id
           FROM users WHERE id = $1`,
          [user.id]
        );
        if (refreshed.rows[0]) {
          if (!dryRun) {
            const result = await reconcileOwnerProjects(pool, refreshed.rows[0], new Date());
            summary.personalLocked += result.locked.length;
            summary.personalRestored += result.restored.length;
          }
        }
        continue;
      }
    }

    if (dryRun) {
      const plan = getUserPlan(user);
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS count FROM projects
         WHERE owner_id = $1 AND team_id IS NULL AND camp_id IS NULL`,
        [user.id]
      );
      const count = countResult.rows[0].count;
      const max = plan.limits.max_projects;
      if (max !== -1 && count > max) {
        summary.personalLocked += count - max;
      }
      continue;
    }

    const result = await reconcileOwnerProjects(
      pool,
      user,
      user.subscription_expires_at || new Date()
    );
    summary.personalLocked += result.locked.length;
    summary.personalRestored += result.restored.length;
  }

  // Teams: expired / not active → mark all projects; active → restore retention marks
  const expiredTeams = await pool.query(
    `SELECT t.id, t.subscription_expires_at, t.created_by,
            ARRAY_REMOVE(ARRAY_AGG(p.id), NULL) AS project_ids
     FROM teams t
     LEFT JOIN projects p ON p.team_id = t.id
     WHERE t.subscription_status NOT IN ('active', 'trialing')
        OR (t.subscription_expires_at IS NOT NULL AND t.subscription_expires_at <= NOW())
     GROUP BY t.id`
  );

  for (const team of expiredTeams.rows) {
    const ids = team.project_ids || [];
    summary.teamProjectsMarked += await markContextProjects(pool, {
      projectIds: ids,
      reason: RETENTION_REASONS.TEAM_EXPIRED,
      triggerDate: team.subscription_expires_at || new Date(),
      dryRun,
    });
  }

  const activeTeams = await pool.query(
    `SELECT ARRAY_REMOVE(ARRAY_AGG(p.id), NULL) AS project_ids
     FROM projects p
     JOIN teams t ON t.id = p.team_id
     WHERE p.access_revoked_at IS NOT NULL
       AND t.subscription_status IN ('active', 'trialing')
       AND (t.subscription_expires_at IS NULL OR t.subscription_expires_at > NOW())`
  );
  const teamRestoreIds = activeTeams.rows[0]?.project_ids || [];
  if (teamRestoreIds.length && !dryRun) {
    await clearProjectRetention(pool, teamRestoreIds);
  }
  summary.teamProjectsRestored += teamRestoreIds.length;

  // Active teams: lock excess projects if over max_projects (size downgrade anti-gaming)
  const activeTeamsForCap = await pool.query(
    `SELECT t.id, t.product_version
     FROM teams t
     WHERE t.subscription_status IN ('active', 'trialing')
       AND (t.subscription_expires_at IS NULL OR t.subscription_expires_at > NOW())`
  );

  for (const team of activeTeamsForCap.rows) {
    const plan = getTeamPlan(team.product_version);
    if (!plan || plan.limits.max_projects === -1) continue;

    const projectsResult = await pool.query(
      `SELECT id, access_revoked_at
       FROM projects
       WHERE team_id = $1
       ORDER BY created_at DESC, id DESC`,
      [team.id]
    );
    const projects = projectsResult.rows;
    const max = plan.limits.max_projects;
    if (projects.length <= max) {
      const toRestore = projects.filter((p) => p.access_revoked_at != null).map((p) => p.id);
      if (toRestore.length && !dryRun) {
        await clearProjectRetention(pool, toRestore);
        summary.teamProjectsRestored += toRestore.length;
      }
      continue;
    }

    const keepIds = new Set(projects.slice(0, max).map((p) => p.id));
    const toLock = projects
      .filter((p) => !keepIds.has(p.id) && p.access_revoked_at == null)
      .map((p) => p.id);
    const toRestore = projects
      .filter((p) => keepIds.has(p.id) && p.access_revoked_at != null)
      .map((p) => p.id);

    if (!dryRun) {
      await clearProjectRetention(pool, toRestore);
      if (toLock.length) {
        const scheduledDeletionAt = computeScheduledDeletionAt(new Date());
        await pool.query(
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
    }
    summary.teamProjectsMarked += toLock.length;
    summary.teamProjectsRestored += toRestore.length;
  }

  // Camps: ended → mark; active → restore
  const endedCamps = await pool.query(
    `SELECT c.id, c.end_date,
            ARRAY_REMOVE(ARRAY_AGG(p.id), NULL) AS project_ids
     FROM camps c
     LEFT JOIN projects p ON p.camp_id = c.id
     WHERE c.end_date <= NOW()
     GROUP BY c.id`
  );

  for (const camp of endedCamps.rows) {
    const ids = camp.project_ids || [];
    summary.campProjectsMarked += await markContextProjects(pool, {
      projectIds: ids,
      reason: RETENTION_REASONS.CAMP_ENDED,
      triggerDate: camp.end_date || new Date(),
      dryRun,
    });
  }

  const activeCamps = await pool.query(
    `SELECT ARRAY_REMOVE(ARRAY_AGG(p.id), NULL) AS project_ids
     FROM projects p
     JOIN camps c ON c.id = p.camp_id
     WHERE p.access_revoked_at IS NOT NULL
       AND c.end_date > NOW()`
  );
  const campRestoreIds = activeCamps.rows[0]?.project_ids || [];
  if (campRestoreIds.length && !dryRun) {
    await clearProjectRetention(pool, campRestoreIds);
  }
  summary.campProjectsRestored += campRestoreIds.length;

  return summary;
}

async function sendWarnings({ dryRun, warningType }) {
  const pool = getPool();
  const column =
    warningType === '1d' ? 'deletion_warning_1d_sent_at' : 'deletion_warning_7d_sent_at';
  const windowStartDays = warningType === '1d' ? 1 : 7;
  const windowEndDays = warningType === '1d' ? 0 : 6;

  // Projects in the warning window that haven't been emailed yet
  const result = await pool.query(
    `SELECT
       p.id,
       p.name,
       p.scheduled_deletion_at,
       p.owner_id,
       p.team_id,
       p.camp_id,
       p.retention_reason,
       CASE
         WHEN p.team_id IS NOT NULL THEN t.created_by
         WHEN p.camp_id IS NOT NULL THEN (
           SELECT uc.user_id FROM user_camps uc
           WHERE uc.camp_id = p.camp_id AND uc.role = 'owner'
           LIMIT 1
         )
         ELSE p.owner_id
       END AS notify_user_id
     FROM projects p
     LEFT JOIN teams t ON t.id = p.team_id
     WHERE p.scheduled_deletion_at IS NOT NULL
       AND p.${column} IS NULL
       AND p.scheduled_deletion_at <= NOW() + ($1::int * INTERVAL '1 day')
       AND p.scheduled_deletion_at > NOW() + ($2::int * INTERVAL '1 day')`,
    [windowStartDays, windowEndDays]
  );

  const byUser = new Map();
  for (const row of result.rows) {
    if (!row.notify_user_id) continue;
    if (!byUser.has(row.notify_user_id)) {
      byUser.set(row.notify_user_id, []);
    }
    byUser.get(row.notify_user_id).push(row);
  }

  let emailsSent = 0;
  let projectsWarned = 0;

  for (const [userId, projects] of byUser.entries()) {
    const userResult = await pool.query(
      `SELECT email, username FROM users WHERE id = $1`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user?.email) continue;

    if (!dryRun) {
      const { sendProjectDeletionWarningEmail } = await import('@sterio/email');
      await sendProjectDeletionWarningEmail(
        user.email,
        user.username || 'there',
        warningType,
        projects.map((p) => ({
          name: p.name,
          scheduledDeletionAt: p.scheduled_deletion_at,
        }))
      );

      const ids = projects.map((p) => p.id);
      await pool.query(
        `UPDATE projects SET ${column} = NOW(), updated_at = CURRENT_TIMESTAMP
         WHERE id = ANY($1::int[])`,
        [ids]
      );
    }

    emailsSent += 1;
    projectsWarned += projects.length;
  }

  return { emailsSent, projectsWarned, warningType };
}

async function hardDeleteProject(executor, projectId, dryRun) {
  const assetsResult = await executor.query(
    `SELECT id, storage_key, waveform_url FROM project_assets WHERE project_id = $1`,
    [projectId]
  );

  if (dryRun) {
    return {
      projectId,
      assetCount: assetsResult.rows.length,
      deleted: false,
      dryRun: true,
    };
  }

  const client = await executor.connect();
  const r2Errors = [];

  try {
    await client.query('BEGIN');

    await client.query(
      `DELETE FROM project_snapshot_assets
       WHERE snapshot_id IN (SELECT id FROM project_snapshots WHERE project_id = $1)`,
      [projectId]
    );
    await client.query(`DELETE FROM project_snapshots WHERE project_id = $1`, [projectId]);
    await client.query(
      `DELETE FROM project_clips
       WHERE project_track_id IN (SELECT id FROM project_tracks WHERE project_id = $1)`,
      [projectId]
    );
    await client.query(`DELETE FROM project_tracks WHERE project_id = $1`, [projectId]);
    await client.query(`DELETE FROM project_assets WHERE project_id = $1`, [projectId]);
    await client.query(`DELETE FROM projects WHERE id = $1`, [projectId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  for (const asset of assetsResult.rows) {
    const result = await deleteProjectAssetBlobs({
      storageKey: asset.storage_key,
      waveformKey: asset.waveform_url,
    });
    r2Errors.push(...result.errors);
  }

  return {
    projectId,
    assetCount: assetsResult.rows.length,
    deleted: true,
    r2Errors,
  };
}

async function deleteDueProjects({ dryRun, limit = 50 }) {
  const pool = getPool();

  const result = await pool.query(
    `SELECT p.id, p.name, p.scheduled_deletion_at, p.deletion_warning_1d_sent_at
     FROM projects p
     LEFT JOIN teams t ON t.id = p.team_id
     LEFT JOIN camps c ON c.id = p.camp_id
     WHERE p.scheduled_deletion_at IS NOT NULL
       AND p.scheduled_deletion_at <= NOW()
       AND p.deletion_warning_1d_sent_at IS NOT NULL
       AND p.deletion_warning_1d_sent_at <= NOW() - INTERVAL '24 hours'
       AND (
         (p.team_id IS NULL AND p.camp_id IS NULL)
         OR (
           p.team_id IS NOT NULL
           AND (
             t.subscription_status NOT IN ('active', 'trialing')
             OR (t.subscription_expires_at IS NOT NULL AND t.subscription_expires_at <= NOW())
           )
         )
         OR (
           p.camp_id IS NOT NULL
           AND c.end_date <= NOW()
         )
       )
     ORDER BY p.scheduled_deletion_at ASC, p.id ASC
     LIMIT $1`,
    [limit]
  );

  const deleted = [];
  const errors = [];

  for (const row of result.rows) {
    try {
      // Personal projects: only delete if still over the owner's free/current limit
      // (safety — reconcile should have restored if they upgraded)
      const deleteResult = await hardDeleteProject(pool, row.id, dryRun);
      deleted.push({ ...deleteResult, name: row.name });
    } catch (err) {
      console.error(`Failed to delete project ${row.id}:`, err);
      errors.push({ projectId: row.id, error: err.message });
    }
  }

  return {
    eligibleCount: result.rows.length,
    deletedCount: dryRun ? 0 : deleted.filter((d) => d.deleted).length,
    deleted,
    errors,
  };
}

/**
 * Full project retention pass: reconcile marks, send warnings, hard-delete.
 */
export async function runProjectRetention(options = {}) {
  const envDryRunDefault = parseDryRun(process.env.PROJECT_RETENTION_DRY_RUN, true);
  const dryRun = parseDryRun(options.dryRun, envDryRunDefault);
  const deleteLimit = Number.isFinite(Number(options.limit)) ? Number(options.limit) : 50;

  console.log(`Project retention starting (dryRun=${dryRun})`);

  const reconcile = await reconcileMarks({ dryRun });
  const warning7d = await sendWarnings({ dryRun, warningType: '7d' });
  const warning1d = await sendWarnings({ dryRun, warningType: '1d' });
  const deletion = await deleteDueProjects({ dryRun, limit: deleteLimit });

  return {
    dryRun,
    reconcile,
    warnings: { '7d': warning7d, '1d': warning1d },
    deletion,
  };
}
