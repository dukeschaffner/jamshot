import pool from '../config/db.js';
import { serializeProjectState, collectSnapshotAssetIds } from './projectUtils.js';

function formatSnapshotSummary(row) {
  const summary = {
    id: row.id,
    label: row.label,
    snapshotKind: row.snapshot_kind,
    revision: Number(row.revision),
    createdAt: row.created_at,
  };

  if (row.created_by != null) {
    summary.createdBy = {
      id: row.created_by,
      username: row.created_by_username ?? null,
    };
  }

  return summary;
}

function validateSnapshotLabel(label) {
  if (label == null || label === '') {
    return { valid: true, label: null };
  }
  if (typeof label !== 'string') {
    return { valid: false, error: 'Label must be a string' };
  }
  const trimmed = label.trim();
  if (!trimmed) {
    return { valid: true, label: null };
  }
  if (trimmed.length > 200) {
    return { valid: false, error: 'Label must be 200 characters or less' };
  }
  return { valid: true, label: trimmed };
}

async function listProjectSnapshots(projectId) {
  const result = await pool.query(
    `SELECT ps.*, u.username AS created_by_username
     FROM project_snapshots ps
     LEFT JOIN users u ON u.id = ps.created_by
     WHERE ps.project_id = $1
     ORDER BY ps.created_at DESC, ps.id DESC`,
    [projectId]
  );

  return result.rows.map(formatSnapshotSummary);
}

async function createManualProjectSnapshot({ projectId, userId, label }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const state = await serializeProjectState(projectId, {
      variant: 'snapshot',
      client,
    });
    if (!state) {
      await client.query('ROLLBACK');
      return null;
    }

    const projectResult = await client.query(
      'SELECT revision FROM projects WHERE id = $1',
      [projectId]
    );
    if (projectResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return null;
    }

    const revision = Number(projectResult.rows[0].revision);
    const assetIds = collectSnapshotAssetIds(state);

    const insertResult = await client.query(
      `INSERT INTO project_snapshots (project_id, created_by, label, snapshot_kind, revision, state)
       VALUES ($1, $2, $3, 'manual', $4, $5::jsonb)
       RETURNING *`,
      [projectId, userId, label, revision, JSON.stringify(state)]
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

    const userResult = await client.query(
      'SELECT username FROM users WHERE id = $1',
      [userId]
    );

    await client.query('COMMIT');

    return formatSnapshotSummary({
      ...snapshotRow,
      created_by_username: userResult.rows[0]?.username ?? null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export {
  formatSnapshotSummary,
  validateSnapshotLabel,
  listProjectSnapshots,
  createManualProjectSnapshot,
};
