import pool from '../config/db.js';

/**
 * Resolve camp/team scope for a social track (by numeric id or GUID).
 *
 * @param {number|string} trackIdOrGuid
 * @returns {Promise<{ found: false } | { found: true, campId: number|null, teamId: number|null }>}
 */
async function getTrackScope(trackIdOrGuid) {
  const isGuid =
    typeof trackIdOrGuid === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      trackIdOrGuid
    );
  const whereClause = isGuid ? 'guid = $1' : 'id = $1';

  const result = await pool.query(
    `SELECT camp_id, team_id FROM tracks WHERE ${whereClause}`,
    [trackIdOrGuid]
  );

  if (result.rows.length === 0) {
    return { found: false };
  }

  const row = result.rows[0];
  return {
    found: true,
    campId: row.camp_id != null ? Number(row.camp_id) : null,
    teamId: row.team_id != null ? Number(row.team_id) : null,
  };
}

/**
 * Whether a user belongs to the project's camp/team scope.
 * Personal projects (no team_id / camp_id) always return true.
 *
 * @param {{ team_id?: number|null, camp_id?: number|null }} project
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function isUserInProjectScope(project, userId) {
  if (!project) return false;

  if (project.team_id) {
    const result = await pool.query(
      `SELECT 1 FROM team_members WHERE team_id = $1 AND user_id = $2 LIMIT 1`,
      [project.team_id, userId]
    );
    return result.rows.length > 0;
  }

  if (project.camp_id) {
    const result = await pool.query(
      `SELECT 1 FROM user_camps WHERE camp_id = $1 AND user_id = $2 LIMIT 1`,
      [project.camp_id, userId]
    );
    return result.rows.length > 0;
  }

  return true;
}

/**
 * User-facing error when inviting/accepting someone outside camp/team scope.
 *
 * @param {{ team_id?: number|null, camp_id?: number|null }} project
 * @returns {string}
 */
function projectScopeInviteError(project) {
  if (project?.team_id) {
    return 'Only members of this team can be invited to this project';
  }
  if (project?.camp_id) {
    return 'Only members of this camp can be invited to this project';
  }
  return 'Only members of this camp or team can be invited to this project';
}

export {
  getTrackScope,
  isUserInProjectScope,
  projectScopeInviteError,
};
