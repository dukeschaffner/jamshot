import pool from '../config/db.js';
import { serializeProjectState } from './projectUtils.js';
import { insertProjectSnapshotRecord } from './projectSnapshotInsertUtils.js';
import { pruneOldestAutoSnapshots } from './projectSnapshotPruneUtils.js';
import { getProjectTrackLocks } from './projectTrackLocks.js';
import { getActiveMetadataLock } from './projectMetadataLocks.js';

/**
 * Sync serial sequences after inserting rows with explicit IDs.
 * @param {import('pg').PoolClient} client
 */
async function syncProjectIdSequences(client) {
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('project_tracks', 'id'),
       GREATEST(COALESCE((SELECT MAX(id) FROM project_tracks), 1), 1)
     )`
  );
  await client.query(
    `SELECT setval(
       pg_get_serial_sequence('project_clips', 'id'),
       GREATEST(COALESCE((SELECT MAX(id) FROM project_clips), 1), 1)
     )`
  );
}

/**
 * @param {import('pg').PoolClient} client
 * @param {number} projectId
 * @param {Object} state
 */
async function applySnapshotMetadata(client, projectId, state) {
  await client.query(
    `UPDATE projects
     SET bpm = $2,
         time_signature = $3,
         metronome_offset = $4,
         duration_seconds = $5,
         revision = revision + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [
      projectId,
      state.bpm ?? 120,
      state.timeSignature ?? '4/4',
      state.metronomeOffset ?? 0,
      state.durationSeconds ?? 60,
    ]
  );
}

/**
 * @param {import('pg').PoolClient} client
 * @param {number} projectId
 * @param {Object[]} tracks
 */
async function upsertSnapshotTracks(client, projectId, tracks) {
  for (const track of tracks) {
    const trackId = Number(track.id);
    if (!Number.isFinite(trackId)) {
      throw Object.assign(new Error('Snapshot contains an invalid track id'), {
        status: 400,
        userMessage: 'This snapshot is invalid and cannot be restored.',
      });
    }

    const existing = await client.query(
      'SELECT project_id FROM project_tracks WHERE id = $1',
      [trackId]
    );
    if (
      existing.rows.length > 0 &&
      Number(existing.rows[0].project_id) !== Number(projectId)
    ) {
      throw Object.assign(
        new Error('Snapshot track id belongs to another project'),
        {
          status: 400,
          userMessage: 'This snapshot is invalid and cannot be restored.',
        }
      );
    }

    await client.query(
      `INSERT INTO project_tracks (
         id, project_id, sort_order, name, color, gain, is_muted, is_solo
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (id) DO UPDATE SET
         sort_order = EXCLUDED.sort_order,
         name = EXCLUDED.name,
         color = EXCLUDED.color,
         gain = EXCLUDED.gain,
         is_muted = EXCLUDED.is_muted,
         is_solo = EXCLUDED.is_solo,
         updated_at = CURRENT_TIMESTAMP
       WHERE project_tracks.project_id = $2`,
      [
        trackId,
        projectId,
        track.sortOrder ?? 0,
        track.name ?? 'Track',
        track.color ?? null,
        track.gain ?? 0.8,
        !!track.muted,
        !!track.solo,
      ]
    );
  }
}

/**
 * @param {import('pg').PoolClient} client
 * @param {number} projectId
 * @param {Object[]} tracks
 * @returns {Promise<number[]>} restored clip ids
 */
async function upsertSnapshotClips(client, projectId, tracks) {
  const restoredClipIds = [];
  const assetIds = new Set();

  for (const track of tracks) {
    const trackId = Number(track.id);

    for (const clip of track.clips || []) {
      const clipId = Number(clip.id);
      const assetId = Number(clip.assetId);
      if (!Number.isFinite(clipId) || !Number.isFinite(assetId)) {
        throw Object.assign(new Error('Snapshot contains an invalid clip'), {
          status: 400,
          userMessage: 'This snapshot is invalid and cannot be restored.',
        });
      }

      const existing = await client.query(
        `SELECT pc.id, pt.project_id
         FROM project_clips pc
         JOIN project_tracks pt ON pt.id = pc.project_track_id
         WHERE pc.id = $1`,
        [clipId]
      );

      if (
        existing.rows.length > 0 &&
        Number(existing.rows[0].project_id) !== Number(projectId)
      ) {
        throw Object.assign(
          new Error('Snapshot clip id belongs to another project'),
          {
            status: 400,
            userMessage: 'This snapshot is invalid and cannot be restored.',
          }
        );
      }

      const assetCheck = await client.query(
        `SELECT id FROM project_assets
         WHERE id = $1 AND project_id = $2`,
        [assetId, projectId]
      );
      if (assetCheck.rows.length === 0) {
        throw Object.assign(
          new Error(`Snapshot references missing asset ${assetId}`),
          {
            status: 400,
            userMessage:
              'This snapshot references audio that is no longer available.',
          }
        );
      }

      assetIds.add(assetId);

      await client.query(
        `INSERT INTO project_clips (
           id, project_track_id, asset_id,
           start_time_seconds, trim_start_seconds, trim_end_seconds,
           deleted_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, NULL)
         ON CONFLICT (id) DO UPDATE SET
           project_track_id = EXCLUDED.project_track_id,
           asset_id = EXCLUDED.asset_id,
           start_time_seconds = EXCLUDED.start_time_seconds,
           trim_start_seconds = EXCLUDED.trim_start_seconds,
           trim_end_seconds = EXCLUDED.trim_end_seconds,
           deleted_at = NULL,
           updated_at = CURRENT_TIMESTAMP`,
        [
          clipId,
          trackId,
          assetId,
          clip.startTime ?? 0,
          clip.trimStart ?? 0,
          clip.trimEnd ?? null,
        ]
      );

      restoredClipIds.push(clipId);
    }
  }

  if (assetIds.size > 0) {
    await client.query(
      `UPDATE project_assets
       SET deleted_at = NULL,
           last_referenced_at = CURRENT_TIMESTAMP
       WHERE project_id = $1
         AND id = ANY($2::int[])`,
      [projectId, [...assetIds]]
    );
  }

  return restoredClipIds;
}

/**
 * Soft-delete live clips that are not part of the restored snapshot.
 *
 * @param {import('pg').PoolClient} client
 * @param {number} projectId
 * @param {number[]} restoredClipIds
 */
async function softDeleteClipsNotInSnapshot(client, projectId, restoredClipIds) {
  if (restoredClipIds.length === 0) {
    await client.query(
      `UPDATE project_clips pc
       SET deleted_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       FROM project_tracks pt
       WHERE pc.project_track_id = pt.id
         AND pt.project_id = $1
         AND pc.deleted_at IS NULL`,
      [projectId]
    );
    return;
  }

  await client.query(
    `UPDATE project_clips pc
     SET deleted_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     FROM project_tracks pt
     WHERE pc.project_track_id = pt.id
       AND pt.project_id = $1
       AND pc.deleted_at IS NULL
       AND NOT (pc.id = ANY($2::int[]))`,
    [projectId, restoredClipIds]
  );
}

/**
 * Clear all locks for the project after a successful restore.
 * @param {import('pg').PoolClient} client
 * @param {number} projectId
 */
async function clearProjectLocks(client, projectId) {
  await client.query(`DELETE FROM project_track_locks WHERE project_id = $1`, [
    projectId,
  ]);
  await client.query(
    `DELETE FROM project_metadata_locks WHERE project_id = $1`,
    [projectId]
  );
}

/**
 * Restore a project from a snapshot (canonical algorithm in database.md).
 *
 * @param {Object} params
 * @param {number} params.projectId
 * @param {number} params.snapshotId
 * @param {string} params.userId
 * @param {number} params.maxSnapshots
 * @returns {Promise<{ ok: true, project: Object, preRestoreSnapshotId: number } | { ok: false, status: number, error: string }>}
 */
async function restoreProjectSnapshot({
  projectId,
  snapshotId,
  userId,
  maxSnapshots,
}) {
  const trackLocks = await getProjectTrackLocks(projectId);
  const otherTrackLock = trackLocks.find((lock) => lock.userId !== userId);
  if (otherTrackLock) {
    return {
      ok: false,
      status: 409,
      error: 'Cannot restore while another collaborator is editing a track',
    };
  }

  const metadataLock = await getActiveMetadataLock(projectId);
  if (metadataLock && metadataLock.userId !== userId) {
    return {
      ok: false,
      status: 409,
      error: 'Cannot restore while another collaborator is editing project settings',
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const snapshotResult = await client.query(
      `SELECT id, project_id, state
       FROM project_snapshots
       WHERE id = $1 AND project_id = $2
       FOR UPDATE`,
      [snapshotId, projectId]
    );

    if (snapshotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Snapshot not found' };
    }

    const snapshotState = snapshotResult.rows[0].state;
    if (!snapshotState || typeof snapshotState !== 'object') {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 400,
        error: 'This snapshot is invalid and cannot be restored.',
      };
    }

    const preRestoreRow = await insertProjectSnapshotRecord({
      client,
      projectId,
      userId,
      label: 'Before restore',
      snapshotKind: 'pre_restore',
    });

    if (!preRestoreRow) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Project not found' };
    }

    await applySnapshotMetadata(client, projectId, snapshotState);

    const tracks = Array.isArray(snapshotState.tracks)
      ? snapshotState.tracks
      : [];

    await upsertSnapshotTracks(client, projectId, tracks);
    const restoredClipIds = await upsertSnapshotClips(
      client,
      projectId,
      tracks
    );
    await softDeleteClipsNotInSnapshot(client, projectId, restoredClipIds);
    await syncProjectIdSequences(client);
    await clearProjectLocks(client, projectId);
    await pruneOldestAutoSnapshots(projectId, maxSnapshots, client);

    const project = await serializeProjectState(projectId, {
      variant: 'rest',
      client,
    });

    await client.query('COMMIT');

    if (!project) {
      return { ok: false, status: 404, error: 'Project not found' };
    }

    return {
      ok: true,
      project,
      preRestoreSnapshotId: Number(preRestoreRow.id),
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.status && err.userMessage) {
      return { ok: false, status: err.status, error: err.userMessage };
    }
    throw err;
  } finally {
    client.release();
  }
}

export { restoreProjectSnapshot };
