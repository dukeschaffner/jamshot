import {
  serializeProjectState,
  collectSnapshotAssetIds,
} from './projectUtils.js';

/**
 * Insert a project snapshot row + asset index inside an open transaction.
 *
 * @param {Object} params
 * @param {import('pg').PoolClient} params.client
 * @param {number} params.projectId
 * @param {string|null} params.userId
 * @param {string|null} params.label
 * @param {'manual'|'auto'|'pre_restore'} params.snapshotKind
 * @param {Object} [params.state] - if omitted, serializes live project
 * @returns {Promise<Object|null>} snapshot row or null if project missing
 */
async function insertProjectSnapshotRecord({
  client,
  projectId,
  userId,
  label,
  snapshotKind,
  state: providedState,
}) {
  const state =
    providedState ??
    (await serializeProjectState(projectId, {
      variant: 'snapshot',
      client,
    }));

  if (!state) {
    return null;
  }

  const projectResult = await client.query(
    'SELECT revision FROM projects WHERE id = $1',
    [projectId]
  );
  if (projectResult.rows.length === 0) {
    return null;
  }

  const revision = Number(projectResult.rows[0].revision);
  const assetIds = collectSnapshotAssetIds(state);

  const insertResult = await client.query(
    `INSERT INTO project_snapshots (
       project_id, created_by, label, snapshot_kind, revision, state
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [projectId, userId, label, snapshotKind, revision, JSON.stringify(state)]
  );
  const snapshotRow = insertResult.rows[0];

  if (assetIds.length > 0) {
    await client.query(
      `INSERT INTO project_snapshot_assets (snapshot_id, asset_id)
       SELECT $1, unnest($2::int[])
       ON CONFLICT DO NOTHING`,
      [snapshotRow.id, assetIds]
    );

    await client.query(
      `UPDATE project_assets
       SET last_referenced_at = CURRENT_TIMESTAMP
       WHERE id = ANY($1::int[])`,
      [assetIds]
    );
  }

  return snapshotRow;
}

export { insertProjectSnapshotRecord };
