/**
 * Count snapshots that consume the tier max_snapshots cap.
 * `manual` + `auto` count; `pre_restore` is excluded.
 *
 * @param {number} projectId
 * @param {import('pg').Pool|import('pg').PoolClient} executor
 * @returns {Promise<number>}
 */
async function countSnapshotsTowardCap(projectId, executor) {
  const countResult = await executor.query(
    `SELECT COUNT(*)::int AS count
     FROM project_snapshots
     WHERE project_id = $1
       AND snapshot_kind IN ('manual', 'auto')`,
    [projectId]
  );

  return Number(countResult.rows[0]?.count ?? 0);
}

/**
 * Prune oldest `auto` snapshots when over tier max_snapshots.
 * Never deletes `manual` or `pre_restore` (see snapshots.md / decisions.md).
 *
 * Counts `manual` + `auto` toward the cap. `pre_restore` is excluded.
 * If the cap is filled only by manuals, pruning is a no-op — callers must
 * reject new manual creates when still over after prune.
 *
 * @param {number} projectId
 * @param {number} maxSnapshots - tier limit; negative means unlimited
 * @param {import('pg').Pool|import('pg').PoolClient} executor
 * @returns {Promise<{ prunedIds: number[] }>}
 */
async function pruneOldestAutoSnapshots(projectId, maxSnapshots, executor) {
  if (maxSnapshots == null || maxSnapshots < 0) {
    return { prunedIds: [] };
  }

  const excess = (await countSnapshotsTowardCap(projectId, executor)) - maxSnapshots;
  if (excess <= 0) {
    return { prunedIds: [] };
  }

  const deleteResult = await executor.query(
    `DELETE FROM project_snapshots
     WHERE id IN (
       SELECT id
       FROM project_snapshots
       WHERE project_id = $1
         AND snapshot_kind = 'auto'
       ORDER BY created_at ASC, id ASC
       LIMIT $2
     )
     RETURNING id`,
    [projectId, excess]
  );

  return {
    prunedIds: deleteResult.rows.map((row) => Number(row.id)),
  };
}

export { countSnapshotsTowardCap, pruneOldestAutoSnapshots };
