import crypto from 'crypto';
import { INVITE_DEFAULT_EXPIRY_DAYS } from '@sterio/subscription-utils';
import { sendProjectInviteEmail } from '@sterio/email';
import pool from '../config/db.js';
import {
  canAddMember,
  checkProjectAccess,
  hasMinimumProjectRole,
} from '../utils/projectAccess.js';

const ASSIGNABLE_ROLES = new Set(['admin', 'editor', 'viewer']);

function buildInviteUrl(token) {
  const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(
    /\/$/,
    ''
  );
  return `${frontendUrl}/projects/invite/${token}`;
}

function formatInviteRow(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    token: row.token,
    role: row.role,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    acceptedAt: row.accepted_at,
    createdBy: row.created_by,
    invitedUserId: row.invited_user_id,
    createdAt: row.created_at,
    url: buildInviteUrl(row.token),
    invitedUser: row.invited_user_id
      ? {
          id: row.invited_user_id,
          username: row.invited_username,
          name: row.invited_name,
          profile_pic_url: row.invited_profile_pic_url,
        }
      : null,
  };
}

async function requireAdminAccess(projectId, userId) {
  const access = await checkProjectAccess(projectId, userId);
  if (!access.hasAccess) {
    return { ok: false, status: access.status, error: access.error };
  }
  if (!hasMinimumProjectRole(access.role, 'admin')) {
    return { ok: false, status: 403, error: 'Admin or owner access required' };
  }
  return { ok: true, access };
}

/**
 * @param {number} projectId
 * @param {string} actorUserId
 * @param {{ userId?: string|null, role: string }} body
 */
export async function createProjectInvite(projectId, actorUserId, body) {
  const role = body?.role;
  const invitedUserId = body?.userId || null;

  if (!ASSIGNABLE_ROLES.has(role)) {
    return {
      ok: false,
      status: 400,
      error: 'Invalid role. Must be admin, editor, or viewer',
    };
  }

  const adminCheck = await requireAdminAccess(projectId, actorUserId);
  if (!adminCheck.ok) return adminCheck;

  const { project } = adminCheck.access;

  if (invitedUserId) {
    if (invitedUserId === actorUserId) {
      return { ok: false, status: 400, error: 'Cannot invite yourself' };
    }

    const userResult = await pool.query(
      `SELECT id, email, username, name FROM users WHERE id = $1`,
      [invitedUserId]
    );
    if (userResult.rows.length === 0) {
      return { ok: false, status: 404, error: 'User not found' };
    }

    const invitee = userResult.rows[0];

    const existingMember = await pool.query(
      `SELECT 1 FROM project_members WHERE project_id = $1 AND user_id = $2`,
      [projectId, invitedUserId]
    );
    if (existingMember.rows.length > 0) {
      return { ok: false, status: 400, error: 'User is already a member of this project' };
    }

    const pendingInvite = await pool.query(
      `SELECT id FROM project_invites
       WHERE project_id = $1
         AND invited_user_id = $2
         AND revoked_at IS NULL
         AND accepted_at IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [projectId, invitedUserId]
    );
    if (pendingInvite.rows.length > 0) {
      return {
        ok: false,
        status: 400,
        error: 'An invite is already pending for this user',
      };
    }

    const memberCountResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1`,
      [projectId]
    );
    const actorUser = await pool.query(
      `SELECT id, subscription_tier, subscription_expires_at, stripe_subscription_id
       FROM users WHERE id = $1`,
      [actorUserId]
    );
    const addCheck = await canAddMember(
      project,
      actorUser.rows[0],
      memberCountResult.rows[0].count
    );
    if (!addCheck.allowed) {
      return { ok: false, status: 403, error: addCheck.reason };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const client = await pool.connect();
    let invite;
    try {
      await client.query('BEGIN');

      const insertResult = await client.query(
        `INSERT INTO project_invites
           (project_id, token, role, created_by, invited_user_id, expires_at)
         VALUES (
           $1, $2, $3, $4, $5,
           CURRENT_TIMESTAMP + ($6::int * INTERVAL '1 day')
         )
         RETURNING *`,
        [projectId, token, role, actorUserId, invitedUserId, INVITE_DEFAULT_EXPIRY_DAYS]
      );
      invite = insertResult.rows[0];

      await client.query(
        `INSERT INTO notifications (user_id, type, related_user_id, project_invite_id)
         VALUES ($1, 'project_invite', $2, $3)`,
        [invitedUserId, actorUserId, invite.id]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    const inviterResult = await pool.query(
      `SELECT username, name FROM users WHERE id = $1`,
      [actorUserId]
    );
    const inviter = inviterResult.rows[0];
    const inviteUrl = buildInviteUrl(token);

    if (invitee.email) {
      try {
        await sendProjectInviteEmail(
          invitee.email,
          inviter?.name || inviter?.username || 'Someone',
          project.name,
          role,
          inviteUrl
        );
      } catch (emailErr) {
        console.error('Failed to send project invite email:', emailErr.message);
      }
    }

    return {
      ok: true,
      invite: {
        ...formatInviteRow({
          ...invite,
          invited_username: invitee.username,
          invited_name: invitee.name,
          invited_profile_pic_url: null,
        }),
        url: inviteUrl,
      },
    };
  }

  // Generic multi-use invite link
  const token = crypto.randomBytes(32).toString('hex');
  const insertResult = await pool.query(
    `INSERT INTO project_invites
       (project_id, token, role, created_by, invited_user_id, expires_at)
     VALUES (
       $1, $2, $3, $4, NULL,
       CURRENT_TIMESTAMP + ($5::int * INTERVAL '1 day')
     )
     RETURNING *`,
    [projectId, token, role, actorUserId, INVITE_DEFAULT_EXPIRY_DAYS]
  );

  const invite = insertResult.rows[0];
  return {
    ok: true,
    invite: formatInviteRow(invite),
  };
}

/**
 * @param {number} projectId
 * @param {string} actorUserId
 */
export async function listProjectInvites(projectId, actorUserId) {
  const adminCheck = await requireAdminAccess(projectId, actorUserId);
  if (!adminCheck.ok) return adminCheck;

  const result = await pool.query(
    `SELECT pi.*,
            u.username AS invited_username,
            u.name AS invited_name,
            u.profile_pic_url AS invited_profile_pic_url
     FROM project_invites pi
     LEFT JOIN users u ON u.id = pi.invited_user_id
     WHERE pi.project_id = $1
       AND pi.revoked_at IS NULL
       AND pi.accepted_at IS NULL
       AND pi.expires_at > NOW()
     ORDER BY pi.created_at DESC`,
    [projectId]
  );

  return {
    ok: true,
    invites: result.rows.map(formatInviteRow),
  };
}

/**
 * @param {number} projectId
 * @param {string} actorUserId
 * @param {number} inviteId
 */
export async function revokeProjectInvite(projectId, actorUserId, inviteId) {
  const adminCheck = await requireAdminAccess(projectId, actorUserId);
  if (!adminCheck.ok) return adminCheck;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inviteResult = await client.query(
      `SELECT id FROM project_invites
       WHERE id = $1 AND project_id = $2 AND revoked_at IS NULL`,
      [inviteId, projectId]
    );

    if (inviteResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Invite not found' };
    }

    await client.query(
      `UPDATE project_invites SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [inviteId]
    );

    await client.query(
      `DELETE FROM notifications WHERE project_invite_id = $1`,
      [inviteId]
    );

    await client.query('COMMIT');
    return { ok: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function loadInviteByToken(token) {
  const result = await pool.query(
    `SELECT pi.*,
            p.guid AS project_guid,
            p.name AS project_name,
            p.owner_id,
            p.team_id,
            p.camp_id,
            p.access_revoked_at,
            inviter.username AS inviter_username,
            inviter.name AS inviter_name,
            inviter.profile_pic_url AS inviter_profile_pic_url
     FROM project_invites pi
     JOIN projects p ON p.id = pi.project_id
     LEFT JOIN users inviter ON inviter.id = pi.created_by
     WHERE pi.token = $1`,
    [token]
  );
  return result.rows[0] || null;
}

function inviteNotUsable(invite) {
  if (!invite) {
    return { ok: false, status: 404, error: 'Invite not found' };
  }
  if (invite.revoked_at) {
    return { ok: false, status: 410, error: 'This invite has been revoked' };
  }
  if (invite.accepted_at) {
    return { ok: false, status: 410, error: 'This invite has already been used' };
  }
  if (new Date(invite.expires_at) <= new Date()) {
    return { ok: false, status: 410, error: 'This invite has expired' };
  }
  if (invite.access_revoked_at) {
    return {
      ok: false,
      status: 403,
      error: 'This project is locked and cannot accept new members',
    };
  }
  return null;
}

/**
 * @param {string} token
 * @param {string} userId
 */
export async function getProjectInviteByToken(token, userId) {
  const invite = await loadInviteByToken(token);
  const unusable = inviteNotUsable(invite);
  if (unusable) return unusable;

  if (invite.invited_user_id && invite.invited_user_id !== userId) {
    return {
      ok: false,
      status: 403,
      error: 'This invite was sent to a different user',
    };
  }

  const existingMember = await pool.query(
    `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [invite.project_id, userId]
  );

  return {
    ok: true,
    invite: {
      token: invite.token,
      role: invite.role,
      expiresAt: invite.expires_at,
      projectGuid: invite.project_guid,
      projectName: invite.project_name,
      isTargeted: Boolean(invite.invited_user_id),
      alreadyMember: existingMember.rows.length > 0,
      currentRole: existingMember.rows[0]?.role || null,
      inviter: {
        username: invite.inviter_username,
        name: invite.inviter_name,
        profile_pic_url: invite.inviter_profile_pic_url,
      },
    },
  };
}

/**
 * @param {string} token
 * @param {string} userId
 */
export async function acceptProjectInvite(token, userId) {
  const invite = await loadInviteByToken(token);
  const unusable = inviteNotUsable(invite);
  if (unusable) {
    // Idempotent: already a member with a used/targeted invite is success-ish
    if (invite && invite.invited_user_id === userId && invite.accepted_at) {
      const member = await pool.query(
        `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
        [invite.project_id, userId]
      );
      if (member.rows.length > 0) {
        return {
          ok: true,
          alreadyMember: true,
          projectGuid: invite.project_guid,
          role: member.rows[0].role,
        };
      }
    }
    return unusable;
  }

  if (invite.invited_user_id && invite.invited_user_id !== userId) {
    return {
      ok: false,
      status: 403,
      error: 'This invite was sent to a different user',
    };
  }

  const existingMember = await pool.query(
    `SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2`,
    [invite.project_id, userId]
  );
  if (existingMember.rows.length > 0) {
    // Idempotent success; clean up targeted notification if present
    if (invite.invited_user_id) {
      await pool.query(
        `DELETE FROM notifications WHERE project_invite_id = $1`,
        [invite.id]
      );
    }
    return {
      ok: true,
      alreadyMember: true,
      projectGuid: invite.project_guid,
      role: existingMember.rows[0].role,
    };
  }

  const userResult = await pool.query(
    `SELECT id, subscription_tier, subscription_expires_at, stripe_subscription_id
     FROM users WHERE id = $1`,
    [userId]
  );
  const memberCountResult = await pool.query(
    `SELECT COUNT(*)::int AS count FROM project_members WHERE project_id = $1`,
    [invite.project_id]
  );
  const addCheck = await canAddMember(
    {
      team_id: invite.team_id,
      camp_id: invite.camp_id,
      owner_id: invite.owner_id,
    },
    userResult.rows[0],
    memberCountResult.rows[0].count
  );
  if (!addCheck.allowed) {
    return { ok: false, status: 403, error: addCheck.reason };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [invite.project_id, userId, invite.role]
    );

    if (invite.invited_user_id) {
      await client.query(
        `UPDATE project_invites SET accepted_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [invite.id]
      );
      await client.query(
        `DELETE FROM notifications WHERE project_invite_id = $1`,
        [invite.id]
      );
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return {
    ok: true,
    alreadyMember: false,
    projectGuid: invite.project_guid,
    role: invite.role,
  };
}

/**
 * Decline a targeted invite.
 * @param {string} token
 * @param {string} userId
 */
export async function declineProjectInvite(token, userId) {
  const invite = await loadInviteByToken(token);
  if (!invite) {
    return { ok: false, status: 404, error: 'Invite not found' };
  }

  if (!invite.invited_user_id) {
    return {
      ok: false,
      status: 400,
      error: 'Link invites cannot be declined. Ignore the link instead.',
    };
  }

  if (invite.invited_user_id !== userId) {
    return {
      ok: false,
      status: 403,
      error: 'This invite was sent to a different user',
    };
  }

  if (invite.revoked_at || invite.accepted_at) {
    await pool.query(
      `DELETE FROM notifications WHERE project_invite_id = $1`,
      [invite.id]
    );
    return { ok: true };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE project_invites SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1`,
      [invite.id]
    );
    await client.query(
      `DELETE FROM notifications WHERE project_invite_id = $1`,
      [invite.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  return { ok: true };
}
