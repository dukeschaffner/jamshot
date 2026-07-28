import pool from '../config/db.js';

/**
 * Hard-delete a project snapshot. Cascades `project_snapshot_assets`.
 *
 * @param {number} projectId
 * @param {number} snapshotId
 * @returns {Promise<{ ok: true, id: number } | { ok: false, status: number, error: string }>}
 */
async function deleteProjectSnapshot(projectId, snapshotId) {
  const result = await pool.query(
    `DELETE FROM project_snapshots
     WHERE id = $1 AND project_id = $2
     RETURNING id`,
    [snapshotId, projectId]
  );

  if (result.rows.length === 0) {
    return { ok: false, status: 404, error: 'Snapshot not found' };
  }

  return { ok: true, id: Number(result.rows[0].id) };
}

export { deleteProjectSnapshot };
