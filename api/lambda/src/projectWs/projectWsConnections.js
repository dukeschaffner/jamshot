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
  gatewayDomain = null,
  gatewayStage = null,
}) {
  await pool.query(
    `INSERT INTO project_ws_connections
       (connection_id, project_id, user_id, editing_track_id,
        gateway_domain, gateway_stage, connected_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     ON CONFLICT (connection_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       user_id = EXCLUDED.user_id,
       editing_track_id = EXCLUDED.editing_track_id,
       gateway_domain = COALESCE(EXCLUDED.gateway_domain, project_ws_connections.gateway_domain),
       gateway_stage = COALESCE(EXCLUDED.gateway_stage, project_ws_connections.gateway_stage),
       last_seen_at = NOW()`,
    [connectionId, projectId, userId, editingTrackId, gatewayDomain, gatewayStage]
  );
}

/**
 * @returns {Promise<Array<{ connectionId: string, gatewayDomain: string|null, gatewayStage: string|null }>>}
 */
export async function getProjectUserConnections(projectId, userId) {
  const result = await pool.query(
    `SELECT connection_id, gateway_domain, gateway_stage
     FROM project_ws_connections
     WHERE project_id = $1 AND user_id = $2`,
    [projectId, userId]
  );
  return result.rows.map((row) => ({
    connectionId: row.connection_id,
    gatewayDomain: row.gateway_domain ?? null,
    gatewayStage: row.gateway_stage ?? null,
  }));
}

/**
 * Remove all room rows for a user in a project (kick / leave).
 * @returns {Promise<string[]>} removed connection ids
 */
export async function removeProjectUserConnections(projectId, userId) {
  const result = await pool.query(
    `DELETE FROM project_ws_connections
     WHERE project_id = $1 AND user_id = $2
     RETURNING connection_id`,
    [projectId, userId]
  );
  return result.rows.map((row) => row.connection_id);
}

export async function touchConnectionLastSeen(connectionId) {
  await pool.query(
    'UPDATE project_ws_connections SET last_seen_at = NOW() WHERE connection_id = $1',
    [connectionId]
  );
}

/**
 * @returns {Promise<number|null>}
 */
export async function getConnectionProjectId(connectionId) {
  const result = await pool.query(
    'SELECT project_id FROM project_ws_connections WHERE connection_id = $1',
    [connectionId]
  );
  return result.rows.length > 0 ? result.rows[0].project_id : null;
}

/**
 * @returns {Promise<number|null>}
 */
export async function getConnectionEditingTrack(connectionId) {
  const result = await pool.query(
    'SELECT editing_track_id FROM project_ws_connections WHERE connection_id = $1',
    [connectionId]
  );
  if (result.rows.length === 0) {
    return null;
  }
  const value = result.rows[0].editing_track_id;
  return value != null ? Number(value) : null;
}

/**
 * @returns {Promise<string[]>}
 */
export async function getProjectConnectionIds(projectId) {
  const result = await pool.query(
    'SELECT connection_id FROM project_ws_connections WHERE project_id = $1',
    [projectId]
  );
  return result.rows.map((row) => row.connection_id);
}

/**
 * @param {string} connectionId
 * @param {number|null} editingTrackId
 */
export async function updateConnectionPresence(connectionId, editingTrackId) {
  await pool.query(
    `UPDATE project_ws_connections
     SET editing_track_id = $2, last_seen_at = NOW()
     WHERE connection_id = $1`,
    [connectionId, editingTrackId]
  );
}

/**
 * @returns {Promise<number|null>} project_id if the connection was in a room
 */
export async function removeProjectConnection(connectionId) {
  const existing = await pool.query(
    'SELECT project_id FROM project_ws_connections WHERE connection_id = $1',
    [connectionId]
  );
  const projectId = existing.rows.length > 0 ? existing.rows[0].project_id : null;

  await pool.query('DELETE FROM project_ws_connections WHERE connection_id = $1', [
    connectionId,
  ]);

  return projectId;
}
