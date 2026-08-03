import { LOCK_TTL_SECONDS } from '@sterio/subscription-utils';
import pool from '../config/db.js';

/** Grace period before locks expire after disconnect (30–45s per plan). */
export const LOCK_DISCONNECT_GRACE_SECONDS = 35;

export async function deleteExpiredTrackLocks() {
  await pool.query('DELETE FROM project_track_locks WHERE expires_at <= NOW()');
}

/**
 * @param {object} params
 * @param {number} params.projectId
 * @param {number} params.trackId
 * @param {string} params.userId
 * @param {string} params.connectionId
 */
export async function acquireTrackLock({ projectId, trackId, userId, connectionId }) {
  await deleteExpiredTrackLocks();

  const trackCheck = await pool.query(
    'SELECT id FROM project_tracks WHERE id = $1 AND project_id = $2',
    [trackId, projectId]
  );
  if (trackCheck.rows.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: 'Track not found' };
  }

  const expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000);

  const upsertResult = await pool.query(
    `INSERT INTO project_track_locks (project_id, track_id, user_id, connection_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (project_id, track_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       connection_id = EXCLUDED.connection_id,
       expires_at = EXCLUDED.expires_at
     WHERE project_track_locks.expires_at <= NOW()
        OR project_track_locks.user_id = EXCLUDED.user_id
     RETURNING track_id, user_id`,
    [projectId, trackId, userId, connectionId, expiresAt]
  );

  if (upsertResult.rows.length > 0) {
    return { ok: true, trackId: Number(upsertResult.rows[0].track_id) };
  }

  const existing = await pool.query(
    `SELECT user_id FROM project_track_locks
     WHERE project_id = $1 AND track_id = $2 AND expires_at > NOW()`,
    [projectId, trackId]
  );

  if (existing.rows.length === 0) {
    return acquireTrackLock({ projectId, trackId, userId, connectionId });
  }

  return {
    ok: false,
    code: 'LOCK_DENIED',
    message: 'Track is locked by another collaborator',
    heldByUserId: existing.rows[0].user_id,
  };
}

/**
 * @param {object} params
 * @param {number} params.projectId
 * @param {number} params.trackId
 * @param {string} params.userId
 * @param {string} params.connectionId
 */
export async function releaseTrackLock({ projectId, trackId, userId, connectionId }) {
  const result = await pool.query(
    `DELETE FROM project_track_locks
     WHERE project_id = $1 AND track_id = $2 AND user_id = $3 AND connection_id = $4
     RETURNING track_id`,
    [projectId, trackId, userId, connectionId]
  );
  return { ok: true, released: result.rows.length > 0, trackId };
}

/**
 * @param {object} params
 * @param {number} params.projectId
 * @param {string} params.connectionId
 * @param {string} params.userId
 * @param {number[]} params.trackIds
 */
export async function renewTrackLocks({ projectId, connectionId, userId, trackIds }) {
  const ids = [...new Set((trackIds ?? []).map((id) => Number(id)).filter(Number.isFinite))];
  if (ids.length === 0) {
    return { ok: true, renewed: [] };
  }

  await deleteExpiredTrackLocks();
  const expiresAt = new Date(Date.now() + LOCK_TTL_SECONDS * 1000);

  const result = await pool.query(
    `UPDATE project_track_locks
     SET expires_at = $4
     WHERE project_id = $1 AND connection_id = $2 AND user_id = $3
       AND track_id = ANY($5::int[])
     RETURNING track_id`,
    [projectId, connectionId, userId, expiresAt, ids]
  );

  return { ok: true, renewed: result.rows.map((row) => Number(row.track_id)) };
}

/** Shorten lock TTL on disconnect so locks release after grace if user does not reconnect. */
export async function shortenLocksOnDisconnect(connectionId) {
  const graceExpires = new Date(Date.now() + LOCK_DISCONNECT_GRACE_SECONDS * 1000);
  await pool.query(
    `UPDATE project_track_locks
     SET expires_at = LEAST(expires_at, $2)
     WHERE connection_id = $1`,
    [connectionId, graceExpires]
  );
}

/**
 * Immediately release all track locks held by a user in a project (kick / role demotion).
 * @returns {Promise<number[]>} released track ids
 */
export async function releaseAllTrackLocksForUser({ projectId, userId }) {
  const result = await pool.query(
    `DELETE FROM project_track_locks
     WHERE project_id = $1 AND user_id = $2 AND expires_at > NOW()
     RETURNING track_id`,
    [projectId, userId]
  );
  return result.rows.map((row) => Number(row.track_id));
}

/**
 * @param {number} projectId
 * @returns {Promise<Array<{ trackId: number, userId: string, connectionId: string }>>}
 */
export async function getProjectTrackLocks(projectId) {
  await deleteExpiredTrackLocks();
  const result = await pool.query(
    `SELECT track_id, user_id, connection_id
     FROM project_track_locks
     WHERE project_id = $1 AND expires_at > NOW()`,
    [projectId]
  );
  return result.rows.map((row) => ({
    trackId: Number(row.track_id),
    userId: row.user_id,
    connectionId: row.connection_id,
  }));
}

/**
 * REST guard — deny when another user holds a non-expired lock on any required track.
 * Pass `client` when called inside an open transaction to avoid exhausting the pool.
 *
 * @param {object} params
 * @param {number} params.projectId
 * @param {number[]} params.trackIds
 * @param {string} params.userId
 * @param {import('pg').PoolClient} [params.client]
 */
export async function assertTracksNotLockedByOther({ projectId, trackIds, userId, client }) {
  const uniqueTrackIds = [...new Set((trackIds ?? []).map((id) => Number(id)).filter(Number.isFinite))];
  if (uniqueTrackIds.length === 0) {
    return { ok: true };
  }

  const query = client?.query.bind(client) ?? pool.query.bind(pool);
  const result = await query(
    `SELECT track_id, user_id FROM project_track_locks
     WHERE project_id = $1 AND track_id = ANY($2::int[]) AND expires_at > NOW()`,
    [projectId, uniqueTrackIds]
  );

  for (const row of result.rows) {
    if (row.user_id !== userId) {
      return {
        ok: false,
        code: 'LOCK_DENIED',
        message: 'Track is locked by another collaborator',
      };
    }
  }

  return { ok: true };
}
