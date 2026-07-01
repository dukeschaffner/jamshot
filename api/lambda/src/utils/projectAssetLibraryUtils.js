import { DeleteObjectCommand } from '@aws-sdk/client-s3';
import pool from '../config/db.js';
import {
  getProjectAssetPublicUrl,
  sanitizeProcessingError,
  serializeProjectState,
} from './projectUtils.js';
import { s3Client } from './trackUtils.js';
import { assertTracksNotLockedByOther } from './projectTrackLocks.js';

async function bumpProjectRevision(client, projectId, expectedRevision) {
  const result = await client.query(
    `UPDATE projects
     SET revision = revision + 1
     WHERE id = $1 AND revision = $2
     RETURNING revision`,
    [projectId, expectedRevision]
  );

  if (result.rows.length === 0) {
    const currentResult = await client.query(
      'SELECT revision FROM projects WHERE id = $1',
      [projectId]
    );
    const currentRevision =
      currentResult.rows.length > 0 ? Number(currentResult.rows[0].revision) : null;
    return { ok: false, currentRevision };
  }

  return { ok: true, revision: Number(result.rows[0].revision) };
}

function deriveAssetUsageStatus({ liveClipCount, softDeletedClipCount, snapshotReferenced }) {
  if (liveClipCount > 0) return 'live';
  if (softDeletedClipCount > 0) return 'soft_deleted_clip';
  if (snapshotReferenced) return 'snapshot_only';
  return 'unused';
}

function formatAssetListItem(row) {
  const liveClipCount = Number(row.live_clip_count ?? 0);
  const softDeletedClipCount = Number(row.soft_deleted_clip_count ?? 0);
  const snapshotReferenced = Boolean(row.snapshot_referenced);
  const processingStatus = row.processing_status || 'pending';

  const item = {
    id: row.id,
    name: row.name,
    durationSeconds:
      row.duration_seconds != null ? Number(row.duration_seconds) : null,
    fileSizeBytes: row.file_size_bytes != null ? Number(row.file_size_bytes) : null,
    mimeType: row.mime_type,
    processingStatus,
    usageStatus: deriveAssetUsageStatus({
      liveClipCount,
      softDeletedClipCount,
      snapshotReferenced,
    }),
    liveClipCount,
    softDeletedClipCount,
    snapshotReferenced,
    createdAt: row.created_at,
    lastReferencedAt: row.last_referenced_at,
    deletedAt: row.deleted_at,
  };

  if (processingStatus === 'completed') {
    item.audioUrl = getProjectAssetPublicUrl(row.storage_key || row.audio_url);
    if (row.waveform_url) {
      item.waveformUrl = getProjectAssetPublicUrl(row.waveform_url);
    }
  }

  if (processingStatus === 'failed') {
    item.processingError = sanitizeProcessingError(row.processing_error);
  }

  return item;
}

async function listProjectAssets(projectId) {
  const result = await pool.query(
    `SELECT
       pa.id,
       pa.name,
       pa.storage_key,
       pa.audio_url,
       pa.waveform_url,
       pa.duration_seconds,
       pa.file_size_bytes,
       pa.mime_type,
       pa.processing_status,
       pa.processing_error,
       pa.deleted_at,
       pa.created_at,
       pa.last_referenced_at,
       COUNT(pc.id) FILTER (WHERE pc.deleted_at IS NULL) AS live_clip_count,
       COUNT(pc.id) FILTER (WHERE pc.deleted_at IS NOT NULL) AS soft_deleted_clip_count,
       EXISTS (
         SELECT 1 FROM project_snapshot_assets psa WHERE psa.asset_id = pa.id
       ) AS snapshot_referenced
     FROM project_assets pa
     LEFT JOIN project_clips pc ON pc.asset_id = pa.id
     WHERE pa.project_id = $1
     GROUP BY pa.id
     ORDER BY pa.created_at DESC, pa.id DESC`,
    [projectId]
  );

  return result.rows.map(formatAssetListItem);
}

function scheduleProjectAssetR2Delete(storageKey) {
  if (!storageKey || storageKey === 'pending' || storageKey.startsWith('temp/')) {
    return;
  }

  s3Client
    .send(
      new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: storageKey,
      })
    )
    .catch((err) => {
      console.error('Failed to delete project asset from R2:', storageKey, err.message);
    });
}

function computeClipPlaybackDuration(trimStart, trimEnd, assetDuration) {
  const start = trimStart ?? 0;
  if (trimEnd != null) {
    return trimEnd - start;
  }
  if (assetDuration != null) {
    return assetDuration - start;
  }
  return null;
}

function clipsOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

async function findOverlappingClipOnTrack(
  client,
  trackId,
  excludeClipId,
  startTime,
  endTime
) {
  const result = await client.query(
    `SELECT pc.id, pc.start_time_seconds, pc.trim_start_seconds, pc.trim_end_seconds,
            pa.duration_seconds AS asset_duration
     FROM project_clips pc
     JOIN project_assets pa ON pa.id = pc.asset_id
     WHERE pc.project_track_id = $1
       AND pc.deleted_at IS NULL
       AND pc.id != $2`,
    [trackId, excludeClipId]
  );

  for (const row of result.rows) {
    const duration = computeClipPlaybackDuration(
      row.trim_start_seconds,
      row.trim_end_seconds,
      row.asset_duration != null ? Number(row.asset_duration) : null
    );
    if (duration == null || duration <= 0) continue;

    const clipStart = Number(row.start_time_seconds);
    const clipEnd = clipStart + duration;
    if (clipsOverlap(startTime, endTime, clipStart, clipEnd)) {
      return row.id;
    }
  }

  return null;
}

async function validateClipPlacement(
  client,
  {
    trackId,
    clipId,
    startTime,
    trimStart,
    trimEnd,
    assetDuration,
    projectDuration,
    assetProjectId,
    trackProjectId,
  }
) {
  if (assetProjectId !== trackProjectId) {
    return { valid: false, error: 'Asset does not belong to this project' };
  }

  let effectiveTrimEnd = trimEnd;
  let duration = computeClipPlaybackDuration(trimStart, effectiveTrimEnd, assetDuration);
  if (duration == null || duration <= 0) {
    return { valid: false, error: 'Clip duration must be greater than 0' };
  }

  const clipEndOnTimeline = startTime + duration;
  if (clipEndOnTimeline > projectDuration) {
    const maxPlaybackDuration = projectDuration - startTime;
    if (maxPlaybackDuration <= 0) {
      return {
        valid: false,
        error: `Clip extends beyond project duration (${projectDuration}s)`,
      };
    }

    effectiveTrimEnd = (trimStart ?? 0) + maxPlaybackDuration;
    duration = maxPlaybackDuration;
  }

  if (effectiveTrimEnd != null && effectiveTrimEnd <= (trimStart ?? 0)) {
    return { valid: false, error: 'trim_end_seconds must be greater than trim_start_seconds' };
  }

  const overlappingClipId = await findOverlappingClipOnTrack(
    client,
    trackId,
    clipId,
    startTime,
    startTime + duration
  );
  if (overlappingClipId != null) {
    return { valid: false, error: 'Clip overlaps another clip on this track' };
  }

  return { valid: true, duration, trimEnd: effectiveTrimEnd };
}

function parsePlacementSeconds(value, fieldName, { required = false, min = 0 } = {}) {
  if (value == null || value === '') {
    if (required) {
      return { valid: false, error: `${fieldName} is required` };
    }
    return { valid: true, value: min };
  }

  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    return { valid: false, error: `${fieldName} must be a number >= ${min}` };
  }

  return { valid: true, value: parsed };
}

function pickField(body, camelKey, snakeKey) {
  if (body[camelKey] !== undefined) return body[camelKey];
  if (body[snakeKey] !== undefined) return body[snakeKey];
  return undefined;
}

/**
 * Soft-delete a project asset and all referencing clips.
 *
 * @returns {Promise<{ ok: true, storageKey: string|null } | { ok: false, status: number, error: string, code?: string, requiresConfirm?: boolean, currentRevision?: number }>}
 */
async function deleteProjectAsset({
  projectId,
  assetId,
  userId,
  revision,
  confirm = false,
}) {
  const assetResult = await pool.query(
    `SELECT id, storage_key, waveform_url, deleted_at
     FROM project_assets
     WHERE id = $1 AND project_id = $2`,
    [assetId, projectId]
  );

  if (assetResult.rows.length === 0) {
    return { ok: false, status: 404, error: 'Asset not found' };
  }

  const asset = assetResult.rows[0];
  if (asset.deleted_at != null) {
    return { ok: false, status: 404, error: 'Asset not found' };
  }

  const snapshotResult = await pool.query(
    `SELECT 1 FROM project_snapshot_assets WHERE asset_id = $1 LIMIT 1`,
    [assetId]
  );
  const snapshotReferenced = snapshotResult.rows.length > 0;

  if (snapshotReferenced && !confirm) {
    return {
      ok: false,
      status: 409,
      error: 'This asset is referenced by a snapshot. Confirm deletion to proceed.',
      code: 'SNAPSHOT_REFERENCED',
      requiresConfirm: true,
    };
  }

  const clipTracksResult = await pool.query(
    `SELECT DISTINCT pc.project_track_id
     FROM project_clips pc
     WHERE pc.asset_id = $1
       AND pc.deleted_at IS NULL`,
    [assetId]
  );
  const trackIds = clipTracksResult.rows.map((row) => Number(row.project_track_id));

  if (trackIds.length > 0) {
    const lockCheck = await assertTracksNotLockedByOther({
      projectId,
      trackIds,
      userId,
    });
    if (!lockCheck.ok) {
      return {
        ok: false,
        status: 403,
        error: lockCheck.message,
        code: lockCheck.code,
      };
    }
  }

  const client = await pool.connect();
  let storageKey = asset.storage_key;
  const waveformKey = asset.waveform_url;

  try {
    await client.query('BEGIN');

    const revisionBump = await bumpProjectRevision(client, projectId, revision);
    if (!revisionBump.ok) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 409,
        error: 'Project revision mismatch',
        code: 'REVISION_MISMATCH',
        currentRevision: revisionBump.currentRevision,
      };
    }

    await client.query(
      `UPDATE project_clips
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE asset_id = $1
         AND deleted_at IS NULL`,
      [assetId]
    );

    const deleteAssetResult = await client.query(
      `UPDATE project_assets
       SET deleted_at = CURRENT_TIMESTAMP
       WHERE id = $1
         AND project_id = $2
         AND deleted_at IS NULL
       RETURNING storage_key`,
      [assetId, projectId]
    );

    if (deleteAssetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Asset not found' };
    }

    storageKey = deleteAssetResult.rows[0].storage_key;
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  scheduleProjectAssetR2Delete(storageKey);
  scheduleProjectAssetR2Delete(waveformKey);

  return { ok: true, storageKey };
}

/**
 * Place an existing library asset on the project timeline.
 *
 * @returns {Promise<{ ok: true, clipId: number, revision: number } | { ok: false, status: number, error: string, code?: string, currentRevision?: number }>}
 */
async function placeProjectAssetClip({
  projectId,
  assetId,
  userId,
  revision,
  trackId,
  startTime,
  trimStart,
  trimEnd,
}) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const assetResult = await client.query(
      `SELECT pa.id, pa.project_id, pa.duration_seconds, pa.processing_status, pa.deleted_at,
              p.duration_seconds AS project_duration
       FROM project_assets pa
       JOIN projects p ON p.id = pa.project_id
       WHERE pa.id = $1 AND pa.project_id = $2`,
      [assetId, projectId]
    );

    if (assetResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Asset not found' };
    }

    const asset = assetResult.rows[0];
    if (asset.deleted_at != null) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Asset not found' };
    }

    if (asset.processing_status !== 'completed') {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 400,
        error: 'Asset is not ready to place on the timeline',
      };
    }

    const trackResult = await client.query(
      `SELECT id, project_id FROM project_tracks WHERE id = $1 AND project_id = $2`,
      [trackId, projectId]
    );
    if (trackResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return { ok: false, status: 404, error: 'Track not found' };
    }

    const lockCheck = await assertTracksNotLockedByOther({
      projectId,
      trackIds: [trackId],
      userId,
      client,
    });
    if (!lockCheck.ok) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 403,
        error: lockCheck.message,
        code: lockCheck.code,
      };
    }

    const assetDuration =
      asset.duration_seconds != null ? Number(asset.duration_seconds) : null;
    const projectDuration = Number(asset.project_duration);

    const placementCheck = await validateClipPlacement(client, {
      trackId,
      clipId: -1,
      startTime,
      trimStart,
      trimEnd,
      assetDuration,
      projectDuration,
      assetProjectId: Number(asset.project_id),
      trackProjectId: projectId,
    });
    if (!placementCheck.valid) {
      await client.query('ROLLBACK');
      return { ok: false, status: 400, error: placementCheck.error };
    }

    const revisionBump = await bumpProjectRevision(client, projectId, revision);
    if (!revisionBump.ok) {
      await client.query('ROLLBACK');
      return {
        ok: false,
        status: 409,
        error: 'Project revision mismatch',
        code: 'REVISION_MISMATCH',
        currentRevision: revisionBump.currentRevision,
      };
    }

    const effectiveTrimEnd = placementCheck.trimEnd ?? trimEnd;

    const clipInsert = await client.query(
      `INSERT INTO project_clips (
         project_track_id, asset_id, start_time_seconds,
         trim_start_seconds, trim_end_seconds
       )
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [trackId, assetId, startTime, trimStart, effectiveTrimEnd]
    );
    const clipId = clipInsert.rows[0].id;

    await client.query(
      `UPDATE project_assets
       SET last_referenced_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [assetId]
    );

    await client.query('COMMIT');

    return { ok: true, clipId, revision: revisionBump.revision };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

function parseAssetPlacementBody(body) {
  const trackIdRaw = pickField(body, 'trackId', 'track_id') ?? body.project_track_id;
  const trackId = trackIdRaw != null ? parseInt(trackIdRaw, 10) : NaN;
  if (Number.isNaN(trackId)) {
    return { valid: false, error: 'track_id is required' };
  }

  const startTimeCheck = parsePlacementSeconds(
    pickField(body, 'startTime', 'start_time_seconds') ?? body.start_time,
    'start_time_seconds',
    { required: true }
  );
  if (!startTimeCheck.valid) {
    return { valid: false, error: startTimeCheck.error };
  }

  const trimStartCheck = parsePlacementSeconds(
    pickField(body, 'trimStart', 'trim_start_seconds') ?? body.trim_start,
    'trim_start_seconds'
  );
  if (!trimStartCheck.valid) {
    return { valid: false, error: trimStartCheck.error };
  }

  let trimEnd = null;
  const trimEndRaw =
    pickField(body, 'trimEnd', 'trim_end_seconds') ?? body.trim_end;
  if (trimEndRaw != null && trimEndRaw !== '') {
    const trimEndCheck = parsePlacementSeconds(trimEndRaw, 'trim_end_seconds');
    if (!trimEndCheck.valid) {
      return { valid: false, error: trimEndCheck.error };
    }
    trimEnd = trimEndCheck.value;
    if (trimEnd <= trimStartCheck.value) {
      return {
        valid: false,
        error: 'trim_end_seconds must be greater than trim_start_seconds',
      };
    }
  }

  return {
    valid: true,
    trackId,
    startTime: startTimeCheck.value,
    trimStart: trimStartCheck.value,
    trimEnd,
  };
}

function parseAssetDeleteConfirm(req) {
  const queryFlag = req.query.confirm ?? req.query.force;
  if (queryFlag === 'true' || queryFlag === '1') return true;
  const bodyFlag = req.body?.confirm ?? req.body?.force;
  if (bodyFlag === true || bodyFlag === 'true' || bodyFlag === 1 || bodyFlag === '1') {
    return true;
  }
  return false;
}

export {
  listProjectAssets,
  deleteProjectAsset,
  placeProjectAssetClip,
  parseAssetPlacementBody,
  parseAssetDeleteConfirm,
  deriveAssetUsageStatus,
};
