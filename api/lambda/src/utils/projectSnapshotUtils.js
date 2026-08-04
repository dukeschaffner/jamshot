import pool from '../config/db.js';
import { insertProjectSnapshotRecord } from './projectSnapshotInsertUtils.js';
import {
  countSnapshotsTowardCap,
  pruneOldestAutoSnapshots,
} from './projectSnapshotPruneUtils.js';
import { hydrateSnapshotStateForPlayback } from './projectSnapshotHydrateUtils.js';

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

/**
 * Fetch one snapshot with hydrated playback state (URLs resolved from assets).
 *
 * @param {number} projectId
 * @param {number} snapshotId
 * @param {Object} [liveProjectMeta] - guid/role etc merged into state for DAW load
 */
async function getProjectSnapshot(projectId, snapshotId, liveProjectMeta = {}) {
  const result = await pool.query(
    `SELECT ps.*, u.username AS created_by_username
     FROM project_snapshots ps
     LEFT JOIN users u ON u.id = ps.created_by
     WHERE ps.id = $1 AND ps.project_id = $2`,
    [snapshotId, projectId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0];
  const hydratedState = await hydrateSnapshotStateForPlayback(row.state, {
    projectId,
    executor: pool,
  });

  return {
    ...formatSnapshotSummary(row),
    state: {
      ...liveProjectMeta,
      bpm: hydratedState.bpm,
      timeSignature: hydratedState.timeSignature,
      metronomeOffset: hydratedState.metronomeOffset,
      durationSeconds: hydratedState.durationSeconds,
      tracks: hydratedState.tracks,
    },
  };
}

/**
 * Create a manual snapshot. Prunes oldest autos when over max_snapshots.
 * Rejects when the cap is still exceeded (e.g. filled entirely by manuals).
 *
 * @returns {Promise<
 *   | { ok: true, snapshot: Object }
 *   | { ok: false, status: number, error: string }
 * >}
 */
async function createManualProjectSnapshot({
  projectId,
  userId,
  label,
  maxSnapshots,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const lockResult = await client.query(
      'SELECT id FROM projects WHERE id = $1 FOR UPDATE',
      [projectId]
    );
    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 403,
        error: 'You do not have access to this project',
      };
    }

    const snapshotRow = await insertProjectSnapshotRecord({
      client,
      projectId,
      userId,
      label,
      snapshotKind: 'manual',
    });

    if (!snapshotRow) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 403,
        error: 'You do not have access to this project',
      };
    }

    await pruneOldestAutoSnapshots(projectId, maxSnapshots, client);

    if (maxSnapshots != null && maxSnapshots >= 0) {
      const count = await countSnapshotsTowardCap(projectId, client);
      if (count > maxSnapshots) {
        await client.query('ROLLBACK');
        return {
          ok: false,
          status: 429,
          error:
            'Snapshot limit reached. Delete a snapshot to create a new one.',
        };
      }
    }

    const userResult = await client.query(
      'SELECT username FROM users WHERE id = $1',
      [userId]
    );

    await client.query('COMMIT');

    return {
      ok: true,
      snapshot: formatSnapshotSummary({
        ...snapshotRow,
        created_by_username: userResult.rows[0]?.username ?? null,
      }),
    };
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
  getProjectSnapshot,
  createManualProjectSnapshot,
};
