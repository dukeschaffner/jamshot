import pool from '../config/db.js';

/** Retain dedup rows for 24h then allow cleanup. */
export const OP_DEDUP_RETENTION_HOURS = 24;

/**
 * @param {string} connectionId
 * @param {string} opId
 * @returns {Promise<number|null>} revision if this op was already applied
 */
export async function getDedupedOpRevision(connectionId, opId) {
  const result = await pool.query(
    `SELECT revision FROM project_ws_op_dedup
     WHERE connection_id = $1 AND op_id = $2`,
    [connectionId, opId]
  );
  return result.rows.length > 0 ? Number(result.rows[0].revision) : null;
}

/**
 * @param {object} params
 * @param {string} params.connectionId
 * @param {string} params.opId
 * @param {number} params.revision
 * @param {import('pg').PoolClient} [params.client]
 */
export async function recordDedupedOp({ connectionId, opId, revision, client }) {
  const query = client?.query.bind(client) ?? pool.query.bind(pool);
  await query(
    `INSERT INTO project_ws_op_dedup (connection_id, op_id, revision)
     VALUES ($1, $2, $3)
     ON CONFLICT (connection_id, op_id) DO NOTHING`,
    [connectionId, opId, revision]
  );
}

export async function pruneOldOpDedupRows() {
  await pool.query(
    `DELETE FROM project_ws_op_dedup
     WHERE created_at < NOW() - ($1::int * INTERVAL '1 hour')`,
    [OP_DEDUP_RETENTION_HOURS]
  );
}
