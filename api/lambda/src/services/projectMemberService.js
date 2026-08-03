import pool from '../config/db.js';
import {
  checkProjectAccess,
  hasMinimumProjectRole,
} from '../utils/projectAccess.js';
import {
  evictProjectMemberSessions,
  revokeProjectMemberEditSession,
} from '../projectWs/projectWsMemberSession.js';

const ASSIGNABLE_ROLES = new Set(['admin', 'editor', 'viewer']);

/**
 * @param {number} projectId
 * @param {string} userId
 */
export async function listProjectMembers(projectId, userId) {
  const access = await checkProjectAccess(projectId, userId);
  if (!access.hasAccess) {
    return { ok: false, status: access.status, error: access.error };
  }

  const result = await pool.query(
    `SELECT u.id, u.username, u.name, u.profile_pic_url, pm.role, pm.joined_at
     FROM project_members pm
     JOIN users u ON u.id = pm.user_id
     WHERE pm.project_id = $1
     ORDER BY
       CASE pm.role
         WHEN 'owner' THEN 0
         WHEN 'admin' THEN 1
         WHEN 'editor' THEN 2
         WHEN 'viewer' THEN 3
         ELSE 4
       END,
       pm.joined_at ASC`,
    [projectId]
  );

  return {
    ok: true,
    members: result.rows,
    currentUserRole: access.role,
  };
}

/**
 * @param {number} projectId
 * @param {string} actorUserId
 * @param {string} targetUserId
 * @param {string} newRole
 */
export async function updateProjectMemberRole(
  projectId,
  actorUserId,
  targetUserId,
  newRole
) {
  if (!ASSIGNABLE_ROLES.has(newRole)) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid role. Must be admin, editor, or viewer',
    };
  }

  if (targetUserId === actorUserId) {
    return { ok: false, status: 400, error: 'Cannot change your own role' };
  }

  const access = await checkProjectAccess(projectId, actorUserId);
  if (!access.hasAccess) {
    return { ok: false, status: access.status, error: access.error };
  }

  if (!hasMinimumProjectRole(access.role, 'admin')) {
    return { ok: false, status: 403, error: 'Admin or owner access required' };
  }

  const memberResult = await pool.query(
    `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, targetUserId]
  );

  if (memberResult.rows.length === 0) {
    return { ok: false, status: 404, error: 'User is not a member of this project' };
  }

  const currentRole = memberResult.rows[0].role;

  if (currentRole === 'owner') {
    return { ok: false, status: 400, error: 'Cannot change the owner role' };
  }

  if (newRole === 'owner') {
    return { ok: false, status: 400, error: 'Cannot assign owner role' };
  }

  if (access.role !== 'owner' && currentRole === 'admin') {
    return { ok: false, status: 403, error: 'Admins cannot change other admins' };
  }

  await pool.query(
    `UPDATE project_members SET role = $1 WHERE project_id = $2 AND user_id = $3`,
    [newRole, projectId, targetUserId]
  );

  // Viewers may stay in the room for fanout, but must not keep edit locks.
  if (newRole === 'viewer' && currentRole !== 'viewer') {
    try {
      await revokeProjectMemberEditSession(projectId, targetUserId);
    } catch (err) {
      console.error('[project-ws] failed to revoke locks after role demotion', {
        projectId,
        targetUserId,
        error: err?.message ?? String(err),
      });
    }
  }

  return { ok: true, role: newRole };
}

/**
 * @param {number} projectId
 * @param {string} actorUserId
 * @param {string} targetUserId
 */
export async function removeProjectMember(projectId, actorUserId, targetUserId) {
  if (targetUserId === actorUserId) {
    return {
      ok: false,
      status: 400,
      error: 'Cannot remove yourself. Use leave project instead.',
    };
  }

  const access = await checkProjectAccess(projectId, actorUserId);
  if (!access.hasAccess) {
    return { ok: false, status: access.status, error: access.error };
  }

  if (!hasMinimumProjectRole(access.role, 'admin')) {
    return { ok: false, status: 403, error: 'Admin or owner access required' };
  }

  const memberResult = await pool.query(
    `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, targetUserId]
  );

  if (memberResult.rows.length === 0) {
    return { ok: false, status: 404, error: 'User is not a member of this project' };
  }

  const targetRole = memberResult.rows[0].role;

  if (targetRole === 'owner') {
    return { ok: false, status: 403, error: 'Cannot remove the project owner' };
  }

  if (access.role !== 'owner' && targetRole === 'admin') {
    return { ok: false, status: 403, error: 'Admins cannot remove other admins' };
  }

  await pool.query(
    `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, targetUserId]
  );

  try {
    await evictProjectMemberSessions(projectId, targetUserId, { reason: 'removed' });
  } catch (err) {
    console.error('[project-ws] failed to evict kicked member sessions', {
      projectId,
      targetUserId,
      error: err?.message ?? String(err),
    });
  }

  return { ok: true };
}

/**
 * Non-owner members leave a project.
 * @param {number} projectId
 * @param {string} userId
 */
export async function leaveProject(projectId, userId) {
  const access = await checkProjectAccess(projectId, userId);
  if (!access.hasAccess) {
    return { ok: false, status: access.status, error: access.error };
  }

  if (access.role === 'owner') {
    return {
      ok: false,
      status: 400,
      error: 'Owners cannot leave a project. Delete the project instead.',
    };
  }

  await pool.query(
    `DELETE FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );

  try {
    await evictProjectMemberSessions(projectId, userId, { reason: 'left' });
  } catch (err) {
    console.error('[project-ws] failed to evict leaving member sessions', {
      projectId,
      userId,
      error: err?.message ?? String(err),
    });
  }

  return { ok: true };
}
