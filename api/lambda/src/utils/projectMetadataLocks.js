import pool from '../config/db.js';

/** Shorter TTL for project-wide metadata edits (BPM, duration, track reorder). */
export const METADATA_LOCK_TTL_SECONDS = 30;

/**
 * @param {import('pg').PoolClient} [client] — use when caller already holds the pool connection (max:1)
 */
export async function deleteExpiredMetadataLocks(client) {
  const query = client?.query.bind(client) ?? pool.query.bind(pool);
  await query('DELETE FROM project_metadata_locks WHERE expires_at <= NOW()');
}

/**
 * @param {object} params
 * @param {number} params.projectId
 * @param {string} params.userId
 * @param {string} params.connectionId
 */
export async function acquireMetadataLock({ projectId, userId, connectionId }) {
  await deleteExpiredMetadataLocks();

  const expiresAt = new Date(Date.now() + METADATA_LOCK_TTL_SECONDS * 1000);

  const upsertResult = await pool.query(
    `INSERT INTO project_metadata_locks (project_id, user_id, connection_id, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (project_id) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       connection_id = EXCLUDED.connection_id,
       expires_at = EXCLUDED.expires_at
     WHERE project_metadata_locks.expires_at <= NOW()
        OR project_metadata_locks.user_id = EXCLUDED.user_id
     RETURNING project_id`,
    [projectId, userId, connectionId, expiresAt]
  );

  if (upsertResult.rows.length > 0) {
    return { ok: true };
  }

  const existing = await pool.query(
    `SELECT user_id FROM project_metadata_locks
     WHERE project_id = $1 AND expires_at > NOW()`,
    [projectId]
  );

  if (existing.rows.length === 0) {
    return acquireMetadataLock({ projectId, userId, connectionId });
  }

  return {
    ok: false,
    code: 'LOCK_DENIED',
    message: 'Project settings are locked by another collaborator',
    heldByUserId: existing.rows[0].user_id,
  };
}

/**
 * @param {object} params
 * @param {number} params.projectId
 * @param {string} params.userId
 * @param {string} params.connectionId
 */
export async function releaseMetadataLock({ projectId, userId, connectionId }) {
  const result = await pool.query(
    `DELETE FROM project_metadata_locks
     WHERE project_id = $1 AND user_id = $2 AND connection_id = $3
     RETURNING project_id`,
    [projectId, userId, connectionId]
  );
  return { ok: true, released: result.rows.length > 0 };
}

/** Shorten metadata lock TTL on disconnect (same grace as track locks). */
export async function shortenMetadataLockOnDisconnect(connectionId, graceSeconds) {
  const graceExpires = new Date(Date.now() + graceSeconds * 1000);
  await pool.query(
    `UPDATE project_metadata_locks
     SET expires_at = LEAST(expires_at, $2)
     WHERE connection_id = $1`,
    [connectionId, graceExpires]
  );
}

/**
 * Deny when another user holds a non-expired metadata lock.
 *
 * @param {object} params
 * @param {number} params.projectId
 * @param {string} params.userId
 * @param {import('pg').PoolClient} [params.client]
 */
export async function assertMetadataNotLockedByOther({ projectId, userId, client }) {
  await deleteExpiredMetadataLocks(client);

  const query = client?.query.bind(client) ?? pool.query.bind(pool);
  const result = await query(
    `SELECT user_id FROM project_metadata_locks
     WHERE project_id = $1 AND expires_at > NOW()`,
    [projectId]
  );

  if (result.rows.length > 0 && result.rows[0].user_id !== userId) {
    return {
      ok: false,
      code: 'LOCK_DENIED',
      message: 'Project settings are locked by another collaborator',
    };
  }

  return { ok: true };
}

/**
 * @param {number} projectId
 * @returns {Promise<{ userId: string, connectionId: string }|null>}
 */
export async function getActiveMetadataLock(projectId) {
  await deleteExpiredMetadataLocks();
  const result = await pool.query(
    `SELECT user_id, connection_id FROM project_metadata_locks
     WHERE project_id = $1 AND expires_at > NOW()`,
    [projectId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  return {
    userId: result.rows[0].user_id,
    connectionId: result.rows[0].connection_id,
  };
}
