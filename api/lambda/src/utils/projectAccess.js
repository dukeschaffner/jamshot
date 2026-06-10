import pool from '../config/db.js';
import { getProjectLimits } from '@sterio/subscription-utils';

const ROLE_RANK = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

/**
 * @param {string} userRole
 * @param {string} minimumRole
 */
function hasMinimumProjectRole(userRole, minimumRole) {
  return (ROLE_RANK[userRole] ?? -1) >= (ROLE_RANK[minimumRole] ?? Infinity);
}

/**
 * Verify project membership and return role.
 * Non-members and unknown projects both return 403 (do not leak existence).
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
      `SELECT p.*, pm.role
       FROM projects p
       JOIN project_members pm ON p.id = pm.project_id AND pm.user_id = $2
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
    const { role, ...project } = row;

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
 */
async function getProjectLimitsForContext(project, user) {
  if (project.team_id) {
    const teamResult = await pool.query(
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
    const campResult = await pool.query(
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
      'SELECT COUNT(*)::int AS count FROM projects WHERE team_id = $1',
      [teamId]
    );
    return result.rows[0].count;
  }

  if (campId != null) {
    const result = await pool.query(
      'SELECT COUNT(*)::int AS count FROM projects WHERE camp_id = $1',
      [campId]
    );
    return result.rows[0].count;
  }

  const result = await pool.query(
    `SELECT COUNT(*)::int AS count FROM projects
     WHERE owner_id = $1 AND team_id IS NULL AND camp_id IS NULL`,
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
    return {
      allowed: false,
      reason: `Project limit reached (${count}/${max})`,
      status: 403,
      count,
      max,
    };
  }

  return { allowed: true, count, max };
}

export {
  ROLE_RANK,
  hasMinimumProjectRole,
  checkProjectAccess,
  getProjectLimitsForContext,
  canAddMember,
  countProjectsInContext,
  checkCanCreateProject,
};
