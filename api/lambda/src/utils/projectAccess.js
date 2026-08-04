import pool from '../config/db.js';
import { getProjectLimits, getUserPlan, SUBSCRIPTION_TIERS } from '@sterio/subscription-utils';
import { isTeamSubscriptionExpired } from './teamUtils.js';

/** SQL fragment: exclude team/camp projects whose parent context is inactive. */
const PROJECT_ACTIVE_CONTEXT_WHERE = `
  AND (
    p.team_id IS NULL
    OR (
      t.subscription_status IN ('active', 'trialing')
      AND (t.subscription_expires_at IS NULL OR t.subscription_expires_at > NOW())
    )
  )
  AND (
    p.camp_id IS NULL
    OR c.end_date > NOW()
  )`;

const ROLE_RANK = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

const PROJECT_GUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isProjectGuid(ref) {
  return typeof ref === 'string' && PROJECT_GUID_REGEX.test(ref);
}

/**
 * Resolve a route param to internal project id (accepts guid or legacy numeric id).
 *
 * @param {string|number} rawRef
 * @returns {Promise<{ ok: true, projectId: number } | { ok: false, status: number, error: string }>}
 */
async function resolveProjectRef(rawRef) {
  if (rawRef == null || String(rawRef).trim() === '') {
    return { ok: false, status: 400, error: 'Invalid project id' };
  }

  const ref = String(rawRef).trim();

  if (isProjectGuid(ref)) {
    const result = await pool.query('SELECT id FROM projects WHERE guid = $1', [ref]);
    if (result.rows.length === 0) {
      return {
        ok: false,
        status: 403,
        error: 'You do not have access to this project',
      };
    }
    return { ok: true, projectId: result.rows[0].id };
  }

  const parsed = parseInt(ref, 10);
  if (Number.isNaN(parsed) || String(parsed) !== ref) {
    return { ok: false, status: 400, error: 'Invalid project id' };
  }

  return { ok: true, projectId: parsed };
}

/**
 * @param {string} userRole
 * @param {string} minimumRole
 */
function hasMinimumProjectRole(userRole, minimumRole) {
  return (ROLE_RANK[userRole] ?? -1) >= (ROLE_RANK[minimumRole] ?? Infinity);
}

/**
 * Team/camp projects are inaccessible when the parent subscription or camp has ended.
 * Personal projects (no team_id / camp_id) are always active.
 *
 * @param {Object} row - projects row with joined team/camp fields
 */
function isProjectContextActive(row) {
  if (row.team_id) {
    if (
      !row.subscription_status ||
      (row.subscription_status !== 'active' && row.subscription_status !== 'trialing')
    ) {
      return false;
    }
    if (isTeamSubscriptionExpired({ subscription_expires_at: row.subscription_expires_at })) {
      return false;
    }
  }

  if (row.camp_id) {
    if (!row.camp_end_date || new Date(row.camp_end_date) <= new Date()) {
      return false;
    }
  }

  return true;
}

/**
 * Verify project membership and return role.
 * Non-members and unknown projects both return 403 (do not leak existence).
 * Team/camp projects with expired parent context also return 403.
 *
 * @param {number|string} projectId
 * @param {string|null} userId
 * @returns {Promise<{ hasAccess: true, role: string, project: Object } | { hasAccess: false, error: string, status: number }>}
 */
async function checkProjectAccess(projectId, userId) {
  if (!userId) {
    return { hasAccess: false, error: 'Authentication required', status: 401 };
  }

  try {
    const result = await pool.query(
      `SELECT p.*, pm.role,
              t.subscription_status, t.subscription_expires_at,
              c.end_date AS camp_end_date
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $2
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN camps c ON c.id = p.camp_id
       WHERE p.id = $1`,
      [projectId, userId]
    );

    if (result.rows.length === 0) {
      return {
        hasAccess: false,
        error: 'You do not have access to this project',
        status: 403,
      };
    }

    const row = result.rows[0];

    if (!isProjectContextActive(row)) {
      return {
        hasAccess: false,
        error: 'You do not have access to this project',
        status: 403,
      };
    }

    if (row.access_revoked_at != null) {
      return {
        hasAccess: false,
        error: 'This project is locked due to a subscription change. Upgrade to restore access.',
        status: 403,
        accessRevoked: true,
        scheduledDeletionAt: row.scheduled_deletion_at,
      };
    }

    const {
      role,
      subscription_status: _subscriptionStatus,
      subscription_expires_at: _subscriptionExpiresAt,
      camp_end_date: _campEndDate,
      ...project
    } = row;

    return { hasAccess: true, role, project };
  } catch (error) {
    console.error('Error checking project access:', error);
    return { hasAccess: false, error: 'Failed to validate project access', status: 500 };
  }
}

/**
 * Resolve tier + team/camp caps for a project context.
 *
 * @param {Object} project - projects row (team_id, camp_id)
 * @param {Object} user - users row (subscription fields)
 * @param {import('pg').Pool | import('pg').PoolClient} [executor=pool] - use transaction client when pool max is held
 */
async function getProjectLimitsForContext(project, user, executor = pool) {
  if (project.team_id) {
    const teamResult = await executor.query(
      `SELECT t.product_version,
              (SELECT COUNT(*)::int FROM team_members tm WHERE tm.team_id = t.id) AS member_count
       FROM teams t
       WHERE t.id = $1`,
      [project.team_id]
    );

    if (teamResult.rows.length === 0) {
      throw new Error(`Team not found for project team_id=${project.team_id}`);
    }

    const { product_version, member_count } = teamResult.rows[0];
    return getProjectLimits({
      type: 'team',
      productVersion: product_version,
      memberCount: member_count,
    });
  }

  if (project.camp_id) {
    const campResult = await executor.query(
      `SELECT c.product_version,
              (SELECT COUNT(*)::int FROM user_camps uc WHERE uc.camp_id = c.id) AS member_count
       FROM camps c
       WHERE c.id = $1`,
      [project.camp_id]
    );

    if (campResult.rows.length === 0) {
      throw new Error(`Camp not found for project camp_id=${project.camp_id}`);
    }

    const { product_version, member_count } = campResult.rows[0];
    return getProjectLimits({
      type: 'camp',
      productVersion: product_version,
      memberCount: member_count,
    });
  }

  return getProjectLimits({ type: 'personal', user });
}

/**
 * @param {Object} project
 * @param {Object} user
 * @param {number} currentMemberCount
 * @param {number|null} [teamOrCampSize] - skip DB lookup when caller already has size
 */
async function canAddMember(project, user, currentMemberCount, teamOrCampSize = null) {
  let limits;

  if ((project.team_id || project.camp_id) && teamOrCampSize != null) {
    const contextType = project.team_id ? 'team' : 'camp';
    const contextId = project.team_id || project.camp_id;
    const table = project.team_id ? 'teams' : 'camps';
    const productResult = await pool.query(
      `SELECT product_version FROM ${table} WHERE id = $1`,
      [contextId]
    );

    if (productResult.rows.length === 0) {
      return { allowed: false, reason: `${contextType} not found` };
    }

    limits = getProjectLimits({
      type: contextType,
      productVersion: productResult.rows[0].product_version,
      memberCount: teamOrCampSize,
    });
  } else {
    limits = await getProjectLimitsForContext(project, user);
  }

  const max = limits.effective_max_members;
  if (max === -1) {
    return { allowed: true };
  }

  if (currentMemberCount >= max) {
    return {
      allowed: false,
      reason: `Project member limit reached (${currentMemberCount}/${max})`,
    };
  }

  return { allowed: true };
}

/**
 * Count projects in a create/list context (per Step 2 counting rules).
 *
 * @param {Object} params
 * @param {string} params.userId - owner for personal context
 * @param {number|null} [params.teamId]
 * @param {number|null} [params.campId]
 */
async function countProjectsInContext({ userId, teamId = null, campId = null }) {
  if (teamId != null) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM projects
       WHERE team_id = $1
         AND access_revoked_at IS NULL`,
      [teamId]
    );
    return result.rows[0].count;
  }

  if (campId != null) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS count FROM projects
       WHERE camp_id = $1
         AND access_revoked_at IS NULL`,
      [campId]
    );
    return result.rows[0].count;
  }

  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM projects
     WHERE owner_id = $1
       AND team_id IS NULL
       AND camp_id IS NULL
       AND access_revoked_at IS NULL`,
    [userId]
  );
  return result.rows[0].count;
}

/**
 * Enforce max_projects for personal, team, or camp context.
 *
 * @param {Object} user - users row (subscription fields)
 * @param {Object} [context]
 * @param {number|null} [context.teamId]
 * @param {number|null} [context.campId]
 * @param {string} [context.productVersion] - team/camp product_version when already known
 */
async function checkCanCreateProject(user, context = {}) {
  const { teamId = null, campId = null, productVersion = null } = context;
  let limits;

  if (teamId != null) {
    let pv = productVersion;
    if (!pv) {
      const teamResult = await pool.query(
        'SELECT product_version FROM teams WHERE id = $1',
        [teamId]
      );
      if (teamResult.rows.length === 0) {
        return { allowed: false, reason: 'Team not found', status: 404 };
      }
      pv = teamResult.rows[0].product_version;
    }
    limits = getProjectLimits({ type: 'team', productVersion: pv, memberCount: 0 });
  } else if (campId != null) {
    let pv = productVersion;
    if (!pv) {
      const campResult = await pool.query(
        'SELECT product_version FROM camps WHERE id = $1',
        [campId]
      );
      if (campResult.rows.length === 0) {
        return { allowed: false, reason: 'Camp not found', status: 404 };
      }
      pv = campResult.rows[0].product_version;
    }
    limits = getProjectLimits({ type: 'camp', productVersion: pv, memberCount: 0 });
  } else {
    limits = getProjectLimits({ type: 'personal', user });
  }

  const count = await countProjectsInContext({
    userId: user.id,
    teamId,
    campId,
  });

  const max = limits.max_projects;
  if (max === -1) {
    return { allowed: true, count, max };
  }

  if (count >= max) {
    const limitResponse = {
      allowed: false,
      reason: `Project limit reached (${count}/${max})`,
      status: 403,
      count,
      max,
    };

    if (teamId == null && campId == null) {
      const tier = getUserPlan(user).id;
      if (tier === SUBSCRIPTION_TIERS.FREE || tier === SUBSCRIPTION_TIERS.BASIC) {
        limitResponse.upgrade_link = `${process.env.FRONTEND_URL || ''}/subscribe`;
      }
    }

    return limitResponse;
  }

  return { allowed: true, count, max };
}

export {
  ROLE_RANK,
  PROJECT_ACTIVE_CONTEXT_WHERE,
  isProjectGuid,
  isProjectContextActive,
  resolveProjectRef,
  hasMinimumProjectRole,
  checkProjectAccess,
  getProjectLimitsForContext,
  canAddMember,
  countProjectsInContext,
  checkCanCreateProject,
};
