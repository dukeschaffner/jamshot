import { MAX_PROJECT_DURATION_SECONDS, MAX_PROJECT_TRACKS } from '@sterio/subscription-utils';
import pool from '../config/db.js';
import { assertMetadataNotLockedByOther } from './projectMetadataLocks.js';
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

function pickField(payload, camelKey, snakeKey) {
  if (payload[camelKey] !== undefined) return payload[camelKey];
  if (payload[snakeKey] !== undefined) return payload[snakeKey];
  return undefined;
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

function validateTrackName(name) {
  if (name == null || typeof name !== 'string') {
    return { valid: false, error: 'Track name is required' };
  }
  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Track name is required' };
  }
  if (trimmed.length > 200) {
    return { valid: false, error: 'Track name must be 200 characters or less' };
  }
  return { valid: true, name: trimmed };
}

function parseBooleanField(value, fieldName) {
  if (typeof value === 'boolean') {
    return { valid: true, value };
  }
  if (value === 'true' || value === 1 || value === '1') {
    return { valid: true, value: true };
  }
  if (value === 'false' || value === 0 || value === '0') {
    return { valid: true, value: false };
  }
  return { valid: false, error: `${fieldName} must be a boolean` };
}

function validateTimeSignature(value) {
  if (value == null || typeof value !== 'string') {
    return { valid: false, error: 'timeSignature must be a string' };
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 10) {
    return { valid: false, error: 'timeSignature must be 10 characters or less' };
  }
  if (!/^\d+\/\d+$/.test(trimmed)) {
    return { valid: false, error: 'timeSignature must be in the form "4/4"' };
  }
  return { valid: true, timeSignature: trimmed };
}

function validateDurationSeconds(value) {
  if (value == null) {
    return { valid: false, error: 'durationSeconds is required' };
  }
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { valid: false, error: 'durationSeconds must be a positive number' };
  }
  if (parsed > MAX_PROJECT_DURATION_SECONDS) {
    return {
      valid: false,
      error: `durationSeconds cannot exceed ${MAX_PROJECT_DURATION_SECONDS} seconds`,
    };
  }
  return { valid: true, durationSeconds: parsed };
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

  const duration = computeClipPlaybackDuration(trimStart, trimEnd, assetDuration);
  if (duration == null || duration <= 0) {
    return { valid: false, error: 'Clip duration must be greater than 0' };
  }

  if (trimEnd != null && trimEnd <= trimStart) {
    return { valid: false, error: 'trimEnd must be greater than trimStart' };
  }

  const clipEndOnTimeline = startTime + duration;
  if (clipEndOnTimeline > projectDuration) {
    return {
      valid: false,
      error: `Clip extends beyond project duration (${projectDuration}s)`,
    };
  }

  const overlappingClipId = await findOverlappingClipOnTrack(
    client,
    trackId,
    clipId,
    startTime,
    clipEndOnTimeline
  );
  if (overlappingClipId != null) {
    return { valid: false, error: 'Clip overlaps another clip on this track' };
  }

  return { valid: true, duration };
}

async function loadClipContext(client, clipId, projectId) {
  const clipResult = await client.query(
    `SELECT pc.id, pc.project_track_id, pc.start_time_seconds,
            pc.trim_start_seconds, pc.trim_end_seconds, pc.asset_id,
            pa.duration_seconds AS asset_duration, pa.project_id AS asset_project_id,
            pt.project_id AS track_project_id,
            p.duration_seconds AS project_duration
     FROM project_clips pc
     JOIN project_tracks pt ON pt.id = pc.project_track_id
     JOIN project_assets pa ON pa.id = pc.asset_id
     JOIN projects p ON p.id = pt.project_id
     WHERE pc.id = $1
       AND pt.project_id = $2
       AND pc.deleted_at IS NULL`,
    [clipId, projectId]
  );

  if (clipResult.rows.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: 'Clip not found' };
  }

  return { ok: true, clip: clipResult.rows[0] };
}

async function executeClipMove(client, { projectId, userId, baseRevision, payload }) {
  const clipId = Number(pickField(payload, 'clipId', 'clip_id'));
  const trackId = Number(pickField(payload, 'trackId', 'track_id'));
  const startTimeRaw = pickField(payload, 'startTime', 'start_time_seconds');

  if (!Number.isFinite(clipId) || !Number.isFinite(trackId)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'clipId and trackId are required' };
  }

  const startTimeCheck = parsePlacementSeconds(startTimeRaw, 'startTime', { required: true });
  if (!startTimeCheck.valid) {
    return { ok: false, code: 'VALIDATION_ERROR', message: startTimeCheck.error };
  }

  const lockCheck = await assertTracksNotLockedByOther({
    projectId,
    trackIds: [trackId],
    userId,
    client,
  });
  if (!lockCheck.ok) {
    return lockCheck;
  }

  const clipContext = await loadClipContext(client, clipId, projectId);
  if (!clipContext.ok) {
    return clipContext;
  }

  const existing = clipContext.clip;
  if (Number(existing.project_track_id) !== trackId) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'clip.move requires the clip to remain on the same track',
    };
  }

  const trimStart = Number(existing.trim_start_seconds ?? 0);
  const trimEnd = existing.trim_end_seconds;
  const assetDuration =
    existing.asset_duration != null ? Number(existing.asset_duration) : null;

  const placementCheck = await validateClipPlacement(client, {
    trackId,
    clipId,
    startTime: startTimeCheck.value,
    trimStart,
    trimEnd,
    assetDuration,
    projectDuration: Number(existing.project_duration),
    assetProjectId: existing.asset_project_id,
    trackProjectId: projectId,
  });
  if (!placementCheck.valid) {
    return { ok: false, code: 'VALIDATION_ERROR', message: placementCheck.error };
  }

  const revisionBump = await bumpProjectRevision(client, projectId, baseRevision);
  if (!revisionBump.ok) {
    return {
      ok: false,
      code: 'REVISION_MISMATCH',
      message: 'Project revision mismatch',
      currentRevision: revisionBump.currentRevision,
    };
  }

  await client.query(
    `UPDATE project_clips SET start_time_seconds = $1 WHERE id = $2 AND deleted_at IS NULL`,
    [startTimeCheck.value, clipId]
  );

  await client.query(
    `UPDATE project_assets SET last_referenced_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [existing.asset_id]
  );

  return {
    ok: true,
    revision: revisionBump.revision,
    broadcastPayload: {
      kind: 'clip.move',
      clipId,
      trackId,
      startTime: startTimeCheck.value,
    },
  };
}

async function executeClipTrim(client, { projectId, userId, baseRevision, payload }) {
  const clipId = Number(pickField(payload, 'clipId', 'clip_id'));
  const trackId = Number(pickField(payload, 'trackId', 'track_id'));

  if (!Number.isFinite(clipId) || !Number.isFinite(trackId)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'clipId and trackId are required' };
  }

  const lockCheck = await assertTracksNotLockedByOther({
    projectId,
    trackIds: [trackId],
    userId,
    client,
  });
  if (!lockCheck.ok) {
    return lockCheck;
  }

  const clipContext = await loadClipContext(client, clipId, projectId);
  if (!clipContext.ok) {
    return clipContext;
  }

  const existing = clipContext.clip;
  if (Number(existing.project_track_id) !== trackId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Clip not found on track' };
  }

  let startTime = Number(existing.start_time_seconds);
  let trimStart = Number(existing.trim_start_seconds ?? 0);
  let trimEnd = existing.trim_end_seconds;

  const startTimeRaw = pickField(payload, 'startTime', 'start_time_seconds');
  if (startTimeRaw !== undefined) {
    const startTimeCheck = parsePlacementSeconds(startTimeRaw, 'startTime', { required: true });
    if (!startTimeCheck.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: startTimeCheck.error };
    }
    startTime = startTimeCheck.value;
  }

  const trimStartRaw = pickField(payload, 'trimStart', 'trim_start_seconds');
  if (trimStartRaw !== undefined) {
    const trimStartCheck = parsePlacementSeconds(trimStartRaw, 'trimStart');
    if (!trimStartCheck.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: trimStartCheck.error };
    }
    trimStart = trimStartCheck.value;
  }

  const trimEndRaw = pickField(payload, 'trimEnd', 'trim_end_seconds');
  if (trimEndRaw !== undefined) {
    if (trimEndRaw === null || trimEndRaw === '') {
      trimEnd = null;
    } else {
      const trimEndCheck = parsePlacementSeconds(trimEndRaw, 'trimEnd');
      if (!trimEndCheck.valid) {
        return { ok: false, code: 'VALIDATION_ERROR', message: trimEndCheck.error };
      }
      trimEnd = trimEndCheck.value;
    }
  }

  const assetDuration =
    existing.asset_duration != null ? Number(existing.asset_duration) : null;

  const placementCheck = await validateClipPlacement(client, {
    trackId,
    clipId,
    startTime,
    trimStart,
    trimEnd,
    assetDuration,
    projectDuration: Number(existing.project_duration),
    assetProjectId: existing.asset_project_id,
    trackProjectId: projectId,
  });
  if (!placementCheck.valid) {
    return { ok: false, code: 'VALIDATION_ERROR', message: placementCheck.error };
  }

  const revisionBump = await bumpProjectRevision(client, projectId, baseRevision);
  if (!revisionBump.ok) {
    return {
      ok: false,
      code: 'REVISION_MISMATCH',
      message: 'Project revision mismatch',
      currentRevision: revisionBump.currentRevision,
    };
  }

  await client.query(
    `UPDATE project_clips
     SET start_time_seconds = $1, trim_start_seconds = $2, trim_end_seconds = $3
     WHERE id = $4 AND deleted_at IS NULL`,
    [startTime, trimStart, trimEnd, clipId]
  );

  await client.query(
    `UPDATE project_assets SET last_referenced_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [existing.asset_id]
  );

  return {
    ok: true,
    revision: revisionBump.revision,
    broadcastPayload: {
      kind: 'clip.trim',
      clipId,
      trackId,
      startTime,
      trimStart,
      trimEnd,
    },
  };
}

async function executeClipMoveToTrack(client, { projectId, userId, baseRevision, payload }) {
  const clipId = Number(pickField(payload, 'clipId', 'clip_id'));
  const sourceTrackId = Number(
    pickField(payload, 'sourceTrackId', 'source_track_id') ??
      pickField(payload, 'trackId', 'track_id')
  );
  const destTrackId = Number(
    pickField(payload, 'destTrackId', 'dest_track_id') ??
      pickField(payload, 'projectTrackId', 'project_track_id')
  );

  if (!Number.isFinite(clipId) || !Number.isFinite(sourceTrackId) || !Number.isFinite(destTrackId)) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: 'clipId, sourceTrackId, and destTrackId are required',
    };
  }

  const lockTrackIds =
    sourceTrackId !== destTrackId
      ? [Math.min(sourceTrackId, destTrackId), Math.max(sourceTrackId, destTrackId)]
      : [sourceTrackId];

  const lockCheck = await assertTracksNotLockedByOther({
    projectId,
    trackIds: lockTrackIds,
    userId,
    client,
  });
  if (!lockCheck.ok) {
    return lockCheck;
  }

  const clipContext = await loadClipContext(client, clipId, projectId);
  if (!clipContext.ok) {
    return clipContext;
  }

  const existing = clipContext.clip;
  if (Number(existing.project_track_id) !== sourceTrackId) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Clip is not on source track' };
  }

  const destTrackResult = await client.query(
    'SELECT id FROM project_tracks WHERE id = $1 AND project_id = $2',
    [destTrackId, projectId]
  );
  if (destTrackResult.rows.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: 'Destination track not found' };
  }

  let startTime = Number(existing.start_time_seconds);
  let trimStart = Number(existing.trim_start_seconds ?? 0);
  let trimEnd = existing.trim_end_seconds;

  const startTimeRaw = pickField(payload, 'startTime', 'start_time_seconds');
  if (startTimeRaw !== undefined) {
    const startTimeCheck = parsePlacementSeconds(startTimeRaw, 'startTime', { required: true });
    if (!startTimeCheck.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: startTimeCheck.error };
    }
    startTime = startTimeCheck.value;
  }

  const trimStartRaw = pickField(payload, 'trimStart', 'trim_start_seconds');
  if (trimStartRaw !== undefined) {
    const trimStartCheck = parsePlacementSeconds(trimStartRaw, 'trimStart');
    if (!trimStartCheck.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: trimStartCheck.error };
    }
    trimStart = trimStartCheck.value;
  }

  const trimEndRaw = pickField(payload, 'trimEnd', 'trim_end_seconds');
  if (trimEndRaw !== undefined) {
    if (trimEndRaw === null || trimEndRaw === '') {
      trimEnd = null;
    } else {
      const trimEndCheck = parsePlacementSeconds(trimEndRaw, 'trimEnd');
      if (!trimEndCheck.valid) {
        return { ok: false, code: 'VALIDATION_ERROR', message: trimEndCheck.error };
      }
      trimEnd = trimEndCheck.value;
    }
  }

  const assetDuration =
    existing.asset_duration != null ? Number(existing.asset_duration) : null;

  const placementCheck = await validateClipPlacement(client, {
    trackId: destTrackId,
    clipId,
    startTime,
    trimStart,
    trimEnd,
    assetDuration,
    projectDuration: Number(existing.project_duration),
    assetProjectId: existing.asset_project_id,
    trackProjectId: projectId,
  });
  if (!placementCheck.valid) {
    return { ok: false, code: 'VALIDATION_ERROR', message: placementCheck.error };
  }

  const revisionBump = await bumpProjectRevision(client, projectId, baseRevision);
  if (!revisionBump.ok) {
    return {
      ok: false,
      code: 'REVISION_MISMATCH',
      message: 'Project revision mismatch',
      currentRevision: revisionBump.currentRevision,
    };
  }

  await client.query(
    `UPDATE project_clips
     SET project_track_id = $1, start_time_seconds = $2, trim_start_seconds = $3, trim_end_seconds = $4
     WHERE id = $5 AND deleted_at IS NULL`,
    [destTrackId, startTime, trimStart, trimEnd, clipId]
  );

  await client.query(
    `UPDATE project_assets SET last_referenced_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [existing.asset_id]
  );

  return {
    ok: true,
    revision: revisionBump.revision,
    broadcastPayload: {
      kind: 'clip.move_to_track',
      clipId,
      sourceTrackId,
      destTrackId,
      startTime,
      trimStart,
      trimEnd,
    },
  };
}

async function executeClipDelete(client, { projectId, userId, baseRevision, payload }) {
  const clipId = Number(pickField(payload, 'clipId', 'clip_id'));
  const trackId = Number(pickField(payload, 'trackId', 'track_id'));

  if (!Number.isFinite(clipId) || !Number.isFinite(trackId)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'clipId and trackId are required' };
  }

  const lockCheck = await assertTracksNotLockedByOther({
    projectId,
    trackIds: [trackId],
    userId,
    client,
  });
  if (!lockCheck.ok) {
    return lockCheck;
  }

  const clipContext = await loadClipContext(client, clipId, projectId);
  if (!clipContext.ok) {
    return clipContext;
  }

  if (Number(clipContext.clip.project_track_id) !== trackId) {
    return { ok: false, code: 'NOT_FOUND', message: 'Clip not found on track' };
  }

  const revisionBump = await bumpProjectRevision(client, projectId, baseRevision);
  if (!revisionBump.ok) {
    return {
      ok: false,
      code: 'REVISION_MISMATCH',
      message: 'Project revision mismatch',
      currentRevision: revisionBump.currentRevision,
    };
  }

  const deleteResult = await client.query(
    `UPDATE project_clips SET deleted_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND deleted_at IS NULL
     RETURNING id`,
    [clipId]
  );

  if (deleteResult.rows.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: 'Clip not found' };
  }

  return {
    ok: true,
    revision: revisionBump.revision,
    broadcastPayload: { kind: 'clip.delete', clipId, trackId },
  };
}

async function executeTrackCreate(client, { projectId, baseRevision, payload }) {
  const nameRaw = pickField(payload, 'name', 'name');
  const sortOrderRaw = pickField(payload, 'sortOrder', 'sort_order');
  const color = pickField(payload, 'color', 'color');

  let trackName = null;
  if (nameRaw !== undefined) {
    const nameValidation = validateTrackName(nameRaw);
    if (!nameValidation.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: nameValidation.error };
    }
    trackName = nameValidation.name;
  }

  let sortOrder = null;
  if (sortOrderRaw !== undefined) {
    const parsedSortOrder =
      typeof sortOrderRaw === 'string' ? parseInt(sortOrderRaw, 10) : Number(sortOrderRaw);
    if (!Number.isInteger(parsedSortOrder) || parsedSortOrder < 0) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'sortOrder must be a non-negative integer' };
    }
    sortOrder = parsedSortOrder;
  }

  if (color !== undefined && color !== null) {
    if (typeof color !== 'string' || color.length > 20) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'color must be a string of 20 characters or less' };
    }
  }

  const countResult = await client.query(
    'SELECT COUNT(*)::int AS count FROM project_tracks WHERE project_id = $1',
    [projectId]
  );
  const trackCount = countResult.rows[0].count;

  if (trackCount >= MAX_PROJECT_TRACKS) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: `Track limit reached (${trackCount}/${MAX_PROJECT_TRACKS})`,
    };
  }

  const revisionBump = await bumpProjectRevision(client, projectId, baseRevision);
  if (!revisionBump.ok) {
    return {
      ok: false,
      code: 'REVISION_MISMATCH',
      message: 'Project revision mismatch',
      currentRevision: revisionBump.currentRevision,
    };
  }

  if (sortOrder == null) {
    const sortResult = await client.query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_sort
       FROM project_tracks WHERE project_id = $1`,
      [projectId]
    );
    sortOrder = sortResult.rows[0].next_sort;
  }

  if (trackName == null) {
    trackName = `Track ${trackCount + 1}`;
  }

  const insertResult = await client.query(
    `INSERT INTO project_tracks (project_id, name, sort_order, color)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, sort_order, color, gain, is_muted, is_solo`,
    [projectId, trackName, sortOrder, color ?? null]
  );

  const track = insertResult.rows[0];

  return {
    ok: true,
    revision: revisionBump.revision,
    broadcastPayload: {
      kind: 'track.create',
      trackId: Number(track.id),
      name: track.name,
      sortOrder: Number(track.sort_order),
      color: track.color,
      gain: Number(track.gain),
      muted: track.is_muted,
      solo: track.is_solo,
    },
  };
}

async function executeTrackDelete(client, { projectId, userId, baseRevision, payload }) {
  const trackId = Number(pickField(payload, 'trackId', 'track_id'));
  if (!Number.isFinite(trackId)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'trackId is required' };
  }

  const lockCheck = await assertTracksNotLockedByOther({
    projectId,
    trackIds: [trackId],
    userId,
    client,
  });
  if (!lockCheck.ok) {
    return lockCheck;
  }

  const trackResult = await client.query(
    'SELECT id FROM project_tracks WHERE id = $1 AND project_id = $2',
    [trackId, projectId]
  );
  if (trackResult.rows.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: 'Track not found' };
  }

  const revisionBump = await bumpProjectRevision(client, projectId, baseRevision);
  if (!revisionBump.ok) {
    return {
      ok: false,
      code: 'REVISION_MISMATCH',
      message: 'Project revision mismatch',
      currentRevision: revisionBump.currentRevision,
    };
  }

  await client.query(
    `UPDATE project_clips SET deleted_at = CURRENT_TIMESTAMP
     WHERE project_track_id = $1 AND deleted_at IS NULL`,
    [trackId]
  );

  const clipCountResult = await client.query(
    'SELECT COUNT(*)::int AS count FROM project_clips WHERE project_track_id = $1',
    [trackId]
  );
  const clipCount = clipCountResult.rows[0].count;

  let hardDeleted = false;
  if (clipCount === 0) {
    await client.query('DELETE FROM project_tracks WHERE id = $1 AND project_id = $2', [
      trackId,
      projectId,
    ]);
    hardDeleted = true;
  }

  return {
    ok: true,
    revision: revisionBump.revision,
    broadcastPayload: { kind: 'track.delete', trackId, hardDeleted },
  };
}

async function executeTrackUpdate(client, { projectId, userId, baseRevision, payload }) {
  const trackId = Number(pickField(payload, 'trackId', 'track_id'));
  if (!Number.isFinite(trackId)) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'trackId is required' };
  }

  const lockCheck = await assertTracksNotLockedByOther({
    projectId,
    trackIds: [trackId],
    userId,
    client,
  });
  if (!lockCheck.ok) {
    return lockCheck;
  }

  const trackResult = await client.query(
    'SELECT id FROM project_tracks WHERE id = $1 AND project_id = $2',
    [trackId, projectId]
  );
  if (trackResult.rows.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: 'Track not found' };
  }

  const updates = [];
  const values = [];
  let paramIndex = 1;
  const broadcastFields = { kind: 'track.update', trackId };

  const nameRaw = pickField(payload, 'name', 'name');
  if (nameRaw !== undefined) {
    const nameValidation = validateTrackName(nameRaw);
    if (!nameValidation.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: nameValidation.error };
    }
    updates.push(`name = $${paramIndex++}`);
    values.push(nameValidation.name);
    broadcastFields.name = nameValidation.name;
  }

  const gainRaw = pickField(payload, 'gain', 'gain');
  if (gainRaw !== undefined) {
    const parsedGain = typeof gainRaw === 'string' ? parseFloat(gainRaw) : Number(gainRaw);
    if (!Number.isFinite(parsedGain) || parsedGain < 0) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'gain must be a non-negative number' };
    }
    updates.push(`gain = $${paramIndex++}`);
    values.push(parsedGain);
    broadcastFields.gain = parsedGain;
  }

  const mutedRaw =
    pickField(payload, 'muted', 'muted') ?? pickField(payload, 'isMuted', 'is_muted');
  if (mutedRaw !== undefined) {
    const mutedCheck = parseBooleanField(mutedRaw, 'muted');
    if (!mutedCheck.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: mutedCheck.error };
    }
    updates.push(`is_muted = $${paramIndex++}`);
    values.push(mutedCheck.value);
    broadcastFields.muted = mutedCheck.value;
  }

  const soloRaw = pickField(payload, 'solo', 'solo') ?? pickField(payload, 'isSolo', 'is_solo');
  if (soloRaw !== undefined) {
    const soloCheck = parseBooleanField(soloRaw, 'solo');
    if (!soloCheck.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: soloCheck.error };
    }
    updates.push(`is_solo = $${paramIndex++}`);
    values.push(soloCheck.value);
    broadcastFields.solo = soloCheck.value;
  }

  const color = pickField(payload, 'color', 'color');
  if (color !== undefined) {
    if (color !== null && (typeof color !== 'string' || color.length > 20)) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'color must be a string of 20 characters or less' };
    }
    updates.push(`color = $${paramIndex++}`);
    values.push(color);
    broadcastFields.color = color;
  }

  if (updates.length === 0) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'No valid fields to update' };
  }

  const revisionBump = await bumpProjectRevision(client, projectId, baseRevision);
  if (!revisionBump.ok) {
    return {
      ok: false,
      code: 'REVISION_MISMATCH',
      message: 'Project revision mismatch',
      currentRevision: revisionBump.currentRevision,
    };
  }

  values.push(trackId, projectId);
  const updateResult = await client.query(
    `UPDATE project_tracks SET ${updates.join(', ')}
     WHERE id = $${paramIndex++} AND project_id = $${paramIndex}
     RETURNING id`,
    values
  );

  if (updateResult.rows.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: 'Track not found' };
  }

  return {
    ok: true,
    revision: revisionBump.revision,
    broadcastPayload: broadcastFields,
  };
}

async function executeTrackReorder(client, { projectId, userId, baseRevision, payload }) {
  const metadataLockCheck = await assertMetadataNotLockedByOther({ projectId, userId, client });
  if (!metadataLockCheck.ok) {
    return metadataLockCheck;
  }

  const ordersRaw = payload.orders ?? payload.trackOrders ?? payload.track_orders;
  if (!Array.isArray(ordersRaw) || ordersRaw.length === 0) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'orders must be a non-empty array' };
  }

  const orders = [];
  for (const entry of ordersRaw) {
    const trackId = Number(entry.trackId ?? entry.track_id ?? entry.id);
    const sortOrder = Number(entry.sortOrder ?? entry.sort_order);
    if (!Number.isFinite(trackId) || !Number.isInteger(sortOrder) || sortOrder < 0) {
      return {
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'Each order entry requires trackId and non-negative integer sortOrder',
      };
    }
    orders.push({ trackId, sortOrder });
  }

  const revisionBump = await bumpProjectRevision(client, projectId, baseRevision);
  if (!revisionBump.ok) {
    return {
      ok: false,
      code: 'REVISION_MISMATCH',
      message: 'Project revision mismatch',
      currentRevision: revisionBump.currentRevision,
    };
  }

  for (const { trackId, sortOrder } of orders) {
    const updateResult = await client.query(
      `UPDATE project_tracks SET sort_order = $1
       WHERE id = $2 AND project_id = $3
       RETURNING id`,
      [sortOrder, trackId, projectId]
    );
    if (updateResult.rows.length === 0) {
      return { ok: false, code: 'NOT_FOUND', message: `Track ${trackId} not found` };
    }
  }

  return {
    ok: true,
    revision: revisionBump.revision,
    broadcastPayload: { kind: 'track.reorder', orders },
  };
}

async function executeProjectTransport(client, { projectId, userId, baseRevision, payload }) {
  const metadataLockCheck = await assertMetadataNotLockedByOther({ projectId, userId, client });
  if (!metadataLockCheck.ok) {
    return metadataLockCheck;
  }

  const updates = [];
  const values = [];
  let paramIndex = 1;
  const broadcastFields = { kind: 'project.transport' };

  const bpmRaw = pickField(payload, 'bpm', 'bpm');
  if (bpmRaw !== undefined) {
    if (bpmRaw === null) {
      updates.push(`bpm = $${paramIndex++}`);
      values.push(null);
      broadcastFields.bpm = null;
    } else {
      const parsedBpm = typeof bpmRaw === 'string' ? parseInt(bpmRaw, 10) : Number(bpmRaw);
      if (!Number.isInteger(parsedBpm) || parsedBpm < 1 || parsedBpm > 999) {
        return { ok: false, code: 'VALIDATION_ERROR', message: 'bpm must be an integer between 1 and 999' };
      }
      updates.push(`bpm = $${paramIndex++}`);
      values.push(parsedBpm);
      broadcastFields.bpm = parsedBpm;
    }
  }

  const timeSignatureRaw = pickField(payload, 'timeSignature', 'time_signature');
  if (timeSignatureRaw !== undefined) {
    const tsValidation = validateTimeSignature(timeSignatureRaw);
    if (!tsValidation.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: tsValidation.error };
    }
    updates.push(`time_signature = $${paramIndex++}`);
    values.push(tsValidation.timeSignature);
    broadcastFields.timeSignature = tsValidation.timeSignature;
  }

  const metronomeOffsetRaw = pickField(payload, 'metronomeOffset', 'metronome_offset');
  if (metronomeOffsetRaw !== undefined) {
    const parsedOffset =
      typeof metronomeOffsetRaw === 'string'
        ? parseFloat(metronomeOffsetRaw)
        : Number(metronomeOffsetRaw);
    if (!Number.isFinite(parsedOffset)) {
      return { ok: false, code: 'VALIDATION_ERROR', message: 'metronomeOffset must be a number' };
    }
    updates.push(`metronome_offset = $${paramIndex++}`);
    values.push(parsedOffset);
    broadcastFields.metronomeOffset = parsedOffset;
  }

  const durationRaw =
    pickField(payload, 'durationSeconds', 'duration_seconds') ??
    pickField(payload, 'duration', 'duration');
  if (durationRaw !== undefined) {
    const durationValidation = validateDurationSeconds(durationRaw);
    if (!durationValidation.valid) {
      return { ok: false, code: 'VALIDATION_ERROR', message: durationValidation.error };
    }
    updates.push(`duration_seconds = $${paramIndex++}`);
    values.push(durationValidation.durationSeconds);
    broadcastFields.durationSeconds = durationValidation.durationSeconds;
  }

  if (updates.length === 0) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'No valid transport fields to update' };
  }

  const revisionBump = await bumpProjectRevision(client, projectId, baseRevision);
  if (!revisionBump.ok) {
    return {
      ok: false,
      code: 'REVISION_MISMATCH',
      message: 'Project revision mismatch',
      currentRevision: revisionBump.currentRevision,
    };
  }

  values.push(projectId);
  await client.query(
    `UPDATE projects SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
    values
  );

  return {
    ok: true,
    revision: revisionBump.revision,
    broadcastPayload: broadcastFields,
  };
}

const OP_EXECUTORS = {
  'clip.move': executeClipMove,
  'clip.trim': executeClipTrim,
  'clip.move_to_track': executeClipMoveToTrack,
  'clip.delete': executeClipDelete,
  'track.create': executeTrackCreate,
  'track.delete': executeTrackDelete,
  'track.update': executeTrackUpdate,
  'track.reorder': executeTrackReorder,
  'project.transport': executeProjectTransport,
};

/**
 * Apply a collaborative edit op inside a transaction.
 *
 * @param {object} params
 * @param {number} params.projectId
 * @param {string} params.userId
 * @param {string} params.connectionId
 * @param {number} params.baseRevision
 * @param {object} params.payload — must include `kind`
 */
export async function executeProjectOp({
  projectId,
  userId,
  connectionId,
  baseRevision,
  payload,
}) {
  const kind = payload?.kind;
  if (!kind || typeof kind !== 'string') {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'payload.kind is required' };
  }

  const executor = OP_EXECUTORS[kind];
  if (!executor) {
    return { ok: false, code: 'VALIDATION_ERROR', message: `Unsupported op kind: ${kind}` };
  }

  if (!Number.isInteger(baseRevision) || baseRevision < 1) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'baseRevision must be a positive integer' };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await executor(client, {
      projectId,
      userId,
      connectionId,
      baseRevision,
      payload,
    });

    if (!result.ok) {
      await client.query('ROLLBACK');
      return result;
    }

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
