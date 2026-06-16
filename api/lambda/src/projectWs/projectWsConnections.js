import pool from '../config/db.js';

/**
 * Bind an authenticated user to a connection id between $connect and join.
 */
export async function storeConnectionAuth(connectionId, userId) {
  await pool.query(
    `INSERT INTO project_ws_connection_auth (connection_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (connection_id) DO UPDATE SET user_id = EXCLUDED.user_id`,
    [connectionId, userId]
  );
}

/**
 * @returns {Promise<string|null>}
 */
export async function getConnectionAuthUserId(connectionId) {
  const result = await pool.query(
    'SELECT user_id FROM project_ws_connection_auth WHERE connection_id = $1',
    [connectionId]
  );
  return result.rows.length > 0 ? result.rows[0].user_id : null;
}

export async function removeConnectionAuth(connectionId) {
  await pool.query('DELETE FROM project_ws_connection_auth WHERE connection_id = $1', [
    connectionId,
  ]);
}

export async function countProjectConnections(projectId) {
  const result = await pool.query(
    'SELECT COUNT(*)::int AS count FROM project_ws_connections WHERE project_id = $1',
    [projectId]
  );
  return result.rows[0].count;
}

/**
 * Upsert an active project room connection (called on join).
 */
export async function upsertProjectConnection({
  connectionId,
  projectId,
  userId,
  editingTrackId = null,
}) {
  await pool.query(
    `INSERT INTO project_ws_connections
       (connection_id, project_id, user_id, editing_track_id, connected_at, last_seen_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (connection_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       user_id = EXCLUDED.user_id,
       editing_track_id = EXCLUDED.editing_track_id,
       last_seen_at = NOW()`,
    [connectionId, projectId, userId, editingTrackId]
  );
}

export async function removeProjectConnection(connectionId) {
  await pool.query('DELETE FROM project_ws_connections WHERE connection_id = $1', [
    connectionId,
  ]);
}

export async function touchConnectionLastSeen(connectionId) {
  await pool.query(
    'UPDATE project_ws_connections SET last_seen_at = NOW() WHERE connection_id = $1',
    [connectionId]
  );
}
