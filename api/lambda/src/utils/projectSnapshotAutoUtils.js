import { AUTO_SNAPSHOT_INTERVAL_SECONDS } from '@sterio/subscription-utils';
import pool from '../config/db.js';
import { getProjectLimitsForContext } from './projectAccess.js';
import { insertProjectSnapshotRecord } from './projectSnapshotInsertUtils.js';
import {
  countSnapshotsTowardCap,
  pruneOldestAutoSnapshots,
} from './projectSnapshotPruneUtils.js';

/**
 * Resolve tier max_snapshots for a project (owner plan for personal).
 *
 * @param {number} projectId
 * @param {import('pg').Pool|import('pg').PoolClient} executor
 * @returns {Promise<number|null>}
 */
async function resolveMaxSnapshotsForProject(projectId, executor) {
  const projectResult = await executor.query(
    `SELECT id, owner_id, team_id, camp_id
     FROM projects
     WHERE id = $1`,
    [projectId]
  );
  if (projectResult.rows.length === 0) {
    return null;
  }

  const project = projectResult.rows[0];
  let user = null;

  if (!project.team_id && !project.camp_id) {
    const userResult = await executor.query('SELECT * FROM users WHERE id = $1', [
      project.owner_id,
    ]);
    if (userResult.rows.length === 0) {
      return null;
    }
    user = userResult.rows[0];
  }

  const limits = await getProjectLimitsForContext(project, user);
  return limits.max_snapshots;
}

/**
 * Create an auto snapshot when the project is dirty vs the last snapshot and
 * the cooldown has elapsed (unless ignoreCooldown — e.g. last editor leave).
 *
 * Cap full of manuals only → skip (do not fail the mutation).
 *
 * @param {Object} params
 * @param {number} params.projectId
 * @param {string|null} [params.userId]
 * @param {boolean} [params.ignoreCooldown]
 * @returns {Promise<{ created: boolean, reason?: string, snapshotId?: number }>}
 */
async function maybeCreateAutoSnapshot({
  projectId,
  userId = null,
  ignoreCooldown = false,
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const projectResult = await client.query(
      'SELECT revision FROM projects WHERE id = $1 FOR UPDATE',
      [projectId]
    );
    if (projectResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { created: false, reason: 'not_found' };
    }

    const currentRevision = Number(projectResult.rows[0].revision);

    const latestResult = await client.query(
      `SELECT revision, created_at
       FROM project_snapshots
       WHERE project_id = $1
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [projectId]
    );

    if (latestResult.rows.length > 0) {
      const latest = latestResult.rows[0];
      const latestRevision = Number(latest.revision);

      if (currentRevision <= latestRevision) {
        await client.query('ROLLBACK');
        return { created: false, reason: 'clean' };
      }

      if (!ignoreCooldown) {
        const ageSeconds =
          (Date.now() - new Date(latest.created_at).getTime()) / 1000;
        if (ageSeconds < AUTO_SNAPSHOT_INTERVAL_SECONDS) {
          await client.query('ROLLBACK');
          return { created: false, reason: 'cooldown' };
        }
      }
    }

    const maxSnapshots = await resolveMaxSnapshotsForProject(projectId, client);
    if (maxSnapshots == null) {
      await client.query('ROLLBACK');
      return { created: false, reason: 'limits_unavailable' };
    }

    const snapshotRow = await insertProjectSnapshotRecord({
      client,
      projectId,
      userId,
      label: null,
      snapshotKind: 'auto',
    });

    if (!snapshotRow) {
      await client.query('ROLLBACK');
      return { created: false, reason: 'insert_failed' };
    }

    await pruneOldestAutoSnapshots(projectId, maxSnapshots, client);

    if (maxSnapshots >= 0) {
      const count = await countSnapshotsTowardCap(projectId, client);
      if (count > maxSnapshots) {
        await client.query('ROLLBACK');
        return { created: false, reason: 'cap_reached' };
      }
    }

    await client.query('COMMIT');
    return { created: true, snapshotId: Number(snapshotRow.id) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export {
  maybeCreateAutoSnapshot,
  resolveMaxSnapshotsForProject,
};
