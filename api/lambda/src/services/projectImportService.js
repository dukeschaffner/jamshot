import {
  MAX_PROJECT_DURATION_SECONDS,
  MAX_PROJECT_TRACKS,
} from '@sterio/subscription-utils';
import pool from '../config/db.js';
import { checkTrackAccess } from '../utils/trackUtils.js';
import {
  copyProjectAssetAudioFromSource,
  copyProjectAssetWaveformFromSource,
} from '../utils/projectAssetUtils.js';
import { formatAssetListItem } from '../utils/projectAssetLibraryUtils.js';
import { checkProjectStorageForAudioSources } from '../utils/projectImportStorageCheck.js';
import { getR2AudioDurationSeconds } from '../utils/projectImportAudioDuration.js';

function stemHasRegions(stem) {
  return Array.isArray(stem?.regions) && stem.regions.length > 0;
}

function isGuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function serviceError(status, error, extras = {}) {
  const err = new Error(error);
  err.status = status;
  err.userFacing = true;
  Object.assign(err, extras);
  return err;
}

async function loadUserSubscriptionRow(userId, executor = pool) {
  const result = await executor.query(
    `SELECT id, subscription_tier, subscription_expires_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

function storageLimitFailure(storageCheck) {
  return {
    ok: false,
    status: storageCheck.status,
    error: storageCheck.reason,
    usedBytes: storageCheck.usedBytes,
    maxBytes: storageCheck.maxBytes,
    ...(storageCheck.upgrade_link ? { upgrade_link: storageCheck.upgrade_link } : {}),
  };
}

/**
 * Map social-stem regions to project clip placement fields.
 * Falls back to a single full-asset clip at time 0 when no regions exist.
 */
function regionsToClipPlacements(regions, assetDurationSeconds) {
  if (!Array.isArray(regions) || regions.length === 0) {
    return [
      {
        startTimeSeconds: 0,
        trimStartSeconds: 0,
        trimEndSeconds: assetDurationSeconds != null ? assetDurationSeconds : null,
      },
    ];
  }

  return regions
    .map((region) => {
      const startTime = Number(region.startTime ?? region.start_time ?? 0);
      const endTime = Number(region.endTime ?? region.end_time ?? startTime);
      const offset = Number(region.offset ?? 0);
      const playbackDuration = Math.max(0, endTime - startTime);
      if (!Number.isFinite(startTime) || playbackDuration <= 0) {
        return null;
      }
      return {
        startTimeSeconds: startTime,
        trimStartSeconds: offset,
        trimEndSeconds: offset + playbackDuration,
      };
    })
    .filter(Boolean);
}

function maxClipEndSeconds(placements, assetDurationSeconds) {
  let maxEnd = 0;
  for (const placement of placements) {
    const duration =
      placement.trimEndSeconds != null
        ? placement.trimEndSeconds - placement.trimStartSeconds
        : assetDurationSeconds != null
          ? assetDurationSeconds - placement.trimStartSeconds
          : 0;
    maxEnd = Math.max(maxEnd, placement.startTimeSeconds + Math.max(0, duration));
  }
  return maxEnd;
}

async function loadSourceTrackMeta(trackIdOrGuid, executor = pool) {
  const whereClause = isGuid(trackIdOrGuid) ? 'guid = $1' : 'id = $1';
  const result = await executor.query(
    `SELECT id, guid, title, user_id, root_id, parent_track_id, audio_url, waveform_url,
            duration, metronome_bpm, time_signature, metronome_offset, processing_status,
            mix_gains
     FROM tracks
     WHERE ${whereClause}`,
    [trackIdOrGuid]
  );
  return result.rows[0] || null;
}

async function loadStemTrackDurations(stemTrackIds, executor = pool) {
  if (!stemTrackIds.length) return new Map();
  const result = await executor.query(
    `SELECT id, duration, waveform_url, title, audio_url
     FROM tracks
     WHERE id = ANY($1::int[])`,
    [stemTrackIds]
  );
  const map = new Map();
  for (const row of result.rows) {
    map.set(row.id, row);
  }
  return map;
}

/**
 * Resolve stems for import using the given DB executor (must not call pool
 * while a transaction client is already checked out — api pool max is 1).
 */
async function resolveStemsForImport(sourceTrack, executor = pool) {
  const mixGains = sourceTrack.mix_gains;
  if (mixGains?.stems?.length) {
    const stemIds = mixGains.stems.map((stem) => stem.track_id).filter((id) => id != null);
    const stemsQuery = await executor.query(
      'SELECT id, audio_url, title FROM tracks WHERE id = ANY($1::int[])',
      [stemIds]
    );
    const stemMetaMap = {};
    stemsQuery.rows.forEach((row) => {
      stemMetaMap[row.id] = row;
    });

    const stems = mixGains.stems
      .map((stem) => {
        const meta = stemMetaMap[stem.track_id] || {};
        return {
          track_id: stem.track_id,
          audio_url: meta.audio_url,
          title: meta.title,
          gain: stem.gain,
          order: stem.order,
          ...(stem.regions && { regions: stem.regions }),
        };
      })
      .sort((a, b) => a.order - b.order);

    return stems.filter((stem) => stem.audio_url);
  }

  if (!sourceTrack.audio_url) {
    throw serviceError(400, 'This track has no audio available to import');
  }

  return [
    {
      track_id: sourceTrack.id,
      audio_url: sourceTrack.audio_url,
      title: sourceTrack.title,
      gain: 0.8,
      order: 0,
    },
  ];
}

/**
 * Copy one social track's isolated stem into project_assets.
 * Dedupes by source_track_id within the project.
 *
 * @returns {{ ok: true, asset: object, created: boolean } | { ok: false, status: number, error: string }}
 */
export async function copySingleTrackAsset(project, trackIdOrGuid, userId, options = {}) {
  const executor = options.client ?? pool;
  const shouldManageTransaction = !options.client;

  const access = await checkTrackAccess(trackIdOrGuid, userId);
  if (!access.hasAccess) {
    return { ok: false, status: access.status, error: access.error };
  }

  const sourceTrack = await loadSourceTrackMeta(trackIdOrGuid, executor);
  if (!sourceTrack) {
    return { ok: false, status: 404, error: 'Track not found' };
  }

  if (sourceTrack.processing_status !== 'completed') {
    return { ok: false, status: 400, error: 'Track is still processing and cannot be imported yet' };
  }

  if (!sourceTrack.audio_url) {
    return { ok: false, status: 400, error: 'This track has no audio available to import' };
  }

  const existing = await executor.query(
    `SELECT *
     FROM project_assets
     WHERE project_id = $1
       AND source_track_id = $2
       AND deleted_at IS NULL
     ORDER BY id ASC
     LIMIT 1`,
    [project.id, sourceTrack.id]
  );

  if (existing.rows.length > 0) {
    return {
      ok: true,
      created: false,
      asset: formatAssetListItem({
        ...existing.rows[0],
        live_clip_count: 0,
        soft_deleted_clip_count: 0,
        snapshot_referenced: false,
      }),
      assetRow: existing.rows[0],
    };
  }

  const user = await loadUserSubscriptionRow(userId, executor);
  if (!user) {
    return { ok: false, status: 404, error: 'User not found' };
  }

  const storageCheck = await checkProjectStorageForAudioSources(
    project,
    user,
    [sourceTrack.audio_url],
    { executor }
  );
  if (!storageCheck.allowed) {
    return storageLimitFailure(storageCheck);
  }

  let client = executor;
  if (shouldManageTransaction) {
    client = await pool.connect();
    await client.query('BEGIN');
  }

  try {
    // Probe stem file duration — tracks.duration is combined-mix length for collabs.
    const stemDurationSeconds = await getR2AudioDurationSeconds(sourceTrack.audio_url);
    if (stemDurationSeconds == null) {
      if (shouldManageTransaction) {
        await client.query('ROLLBACK');
      }
      return {
        ok: false,
        status: 500,
        error: 'Could not determine the track audio duration for import',
      };
    }

    // Insert placeholder row to get asset id, then copy R2 objects, then update keys.
    const placeholder = await client.query(
      `INSERT INTO project_assets (
         project_id, storage_key, name, duration_seconds, mime_type,
         uploaded_by, processing_status, source_track_id
       )
       VALUES ($1, 'pending', $2, $3, 'audio/wav', $4, 'processing', $5)
       RETURNING id`,
      [
        project.id,
        sourceTrack.title || 'Imported stem',
        stemDurationSeconds,
        userId,
        sourceTrack.id,
      ]
    );
    const assetId = placeholder.rows[0].id;

    const { storageKey, fileSizeBytes } = await copyProjectAssetAudioFromSource(
      sourceTrack.audio_url,
      project.id,
      assetId
    );
    const waveformKey = await copyProjectAssetWaveformFromSource(
      sourceTrack.waveform_url,
      project.id,
      assetId
    );

    const updated = await client.query(
      `UPDATE project_assets
       SET storage_key = $1,
           audio_url = $1,
           waveform_url = $2,
           file_size_bytes = $3,
           processing_status = 'completed',
           last_referenced_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [storageKey, waveformKey, fileSizeBytes, assetId]
    );

    if (shouldManageTransaction) {
      await client.query('COMMIT');
    }

    const assetRow = updated.rows[0];
    return {
      ok: true,
      created: true,
      asset: formatAssetListItem({
        ...assetRow,
        live_clip_count: 0,
        soft_deleted_clip_count: 0,
        snapshot_referenced: false,
      }),
      assetRow,
    };
  } catch (err) {
    if (shouldManageTransaction) {
      await client.query('ROLLBACK');
    }
    console.error('copySingleTrackAsset failed:', err);
    return {
      ok: false,
      status: 500,
      error: 'Failed to copy track audio into the project',
    };
  } finally {
    if (shouldManageTransaction) {
      client.release();
    }
  }
}

/**
 * Import a social track's stem chain into a project (tracks + clips + assets).
 * Must be called with an open transaction client when creating a project.
 *
 * Access must be verified by the caller before checking out this client —
 * the API pool has max:1, so nested pool.query calls deadlock.
 *
 * @param {import('pg').PoolClient} client
 * @param {object} project - projects row
 * @param {string|number} trackIdOrGuid
 * @param {string} userId
 * @param {{ accessVerified?: boolean }} [options]
 */
export async function importTrackIntoProject(
  client,
  project,
  trackIdOrGuid,
  userId,
  options = {}
) {
  if (!options.accessVerified) {
    // Only safe when no transaction client is already held (pool max is 1).
    const access = await checkTrackAccess(trackIdOrGuid, userId);
    if (!access.hasAccess) {
      throw serviceError(access.status, access.error);
    }
  }

  const sourceTrack = await loadSourceTrackMeta(trackIdOrGuid, client);
  if (!sourceTrack) {
    throw serviceError(404, 'Track not found');
  }

  if (sourceTrack.processing_status !== 'completed') {
    throw serviceError(400, 'Track is still processing and cannot be imported yet');
  }

  const stems = await resolveStemsForImport(sourceTrack, client);
  if (!stems.length) {
    throw serviceError(400, 'This track has no stems available to import');
  }

  if (stems.length > MAX_PROJECT_TRACKS) {
    throw serviceError(
      400,
      `This track has ${stems.length} stems, but projects are limited to ${MAX_PROJECT_TRACKS} tracks`
    );
  }

  const stemMeta = await loadStemTrackDurations(
    stems.map((s) => s.track_id),
    client
  );

  let requiredDuration = Number(project.duration_seconds) || 60;
  const stemPlans = [];

  for (const stem of stems) {
    const meta = stemMeta.get(stem.track_id) || {};
    const audioKey = stem.audio_url || meta.audio_url;
    const title = stem.title || meta.title || `Stem ${stem.order + 1}`;
    const trackDuration =
      meta.duration != null ? Number(meta.duration) : null;

    // Only download+probe when regions are missing. With regions, clip length
    // comes from start/end times; tracks.duration is fine as an asset hint.
    // Without regions, tracks.duration is combined-mix length and must not be used.
    let durationSeconds = trackDuration;
    if (!stemHasRegions(stem)) {
      durationSeconds = audioKey
        ? await getR2AudioDurationSeconds(audioKey)
        : null;
      if (durationSeconds == null) {
        throw serviceError(
          500,
          `Could not determine audio duration for stem "${title}"`
        );
      }
    }

    const placements = regionsToClipPlacements(stem.regions, durationSeconds);
    if (!placements.length) {
      throw serviceError(400, `Stem "${title}" has no valid regions to import`);
    }
    requiredDuration = Math.max(
      requiredDuration,
      maxClipEndSeconds(placements, durationSeconds)
    );
    stemPlans.push({
      stem,
      meta,
      durationSeconds,
      placements,
      audioKey,
      waveformKey: meta.waveform_url || null,
      title,
      gain: typeof stem.gain === 'number' ? stem.gain : 0.8,
    });
  }

  if (requiredDuration > MAX_PROJECT_DURATION_SECONDS) {
    throw serviceError(
      400,
      `This arrangement is longer than the ${MAX_PROJECT_DURATION_SECONDS}s project limit`
    );
  }

  const user = await loadUserSubscriptionRow(userId, client);
  if (!user) {
    throw serviceError(404, 'User not found');
  }

  const storageCheck = await checkProjectStorageForAudioSources(
    project,
    user,
    stemPlans.map((plan) => plan.audioKey),
    { executor: client }
  );
  if (!storageCheck.allowed) {
    throw serviceError(storageCheck.status, storageCheck.reason, {
      upgrade_link: storageCheck.upgrade_link,
      usedBytes: storageCheck.usedBytes,
      maxBytes: storageCheck.maxBytes,
    });
  }

  const rootId = sourceTrack.root_id || sourceTrack.id;

  await client.query(
    `UPDATE projects
     SET source_track_id = $1,
         source_root_id = $2,
         bpm = COALESCE(bpm, $3),
         time_signature = COALESCE(NULLIF(time_signature, '4/4'), $4, time_signature),
         metronome_offset = COALESCE(metronome_offset, $5, 0),
         duration_seconds = GREATEST(duration_seconds, $6),
         revision = revision + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $7`,
    [
      sourceTrack.id,
      rootId,
      sourceTrack.metronome_bpm,
      sourceTrack.time_signature || '4/4',
      sourceTrack.metronome_offset ?? 0,
      requiredDuration,
      project.id,
    ]
  );

  for (let i = 0; i < stemPlans.length; i++) {
    const plan = stemPlans[i];
    if (!plan.audioKey) {
      throw serviceError(400, `Stem "${plan.title}" has no audio file to copy`);
    }

    const placeholder = await client.query(
      `INSERT INTO project_assets (
         project_id, storage_key, name, duration_seconds, mime_type,
         uploaded_by, processing_status, source_track_id
       )
       VALUES ($1, 'pending', $2, $3, 'audio/wav', $4, 'processing', $5)
       RETURNING id`,
      [project.id, plan.title, plan.durationSeconds, userId, plan.stem.track_id]
    );
    const assetId = placeholder.rows[0].id;

    const { storageKey, fileSizeBytes } = await copyProjectAssetAudioFromSource(
      plan.audioKey,
      project.id,
      assetId
    );
    const waveformKey = await copyProjectAssetWaveformFromSource(
      plan.waveformKey,
      project.id,
      assetId
    );

    await client.query(
      `UPDATE project_assets
       SET storage_key = $1,
           audio_url = $1,
           waveform_url = $2,
           file_size_bytes = $3,
           processing_status = 'completed',
           last_referenced_at = CURRENT_TIMESTAMP
       WHERE id = $4`,
      [storageKey, waveformKey, fileSizeBytes, assetId]
    );

    const trackResult = await client.query(
      `INSERT INTO project_tracks (project_id, name, sort_order, gain)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [project.id, plan.title, i, plan.gain]
    );
    const projectTrackId = trackResult.rows[0].id;

    for (const placement of plan.placements) {
      await client.query(
        `INSERT INTO project_clips (
           project_track_id, asset_id, start_time_seconds,
           trim_start_seconds, trim_end_seconds
         )
         VALUES ($1, $2, $3, $4, $5)`,
        [
          projectTrackId,
          assetId,
          placement.startTimeSeconds,
          placement.trimStartSeconds,
          placement.trimEndSeconds,
        ]
      );
    }
  }

  const updatedProject = await client.query(
    'SELECT * FROM projects WHERE id = $1',
    [project.id]
  );

  return {
    project: updatedProject.rows[0],
    sourceTrack,
    rootId,
  };
}

/**
 * Walk the parent chain from source track up to root and return distinct
 * contributor user ids (excluding the actor).
 */
export async function getLineageContributorUserIds(sourceTrackId, excludeUserId) {
  const result = await pool.query(
    `WITH RECURSIVE lineage AS (
       SELECT id, parent_track_id, user_id, 0 AS depth
       FROM tracks
       WHERE id = $1
       UNION ALL
       SELECT t.id, t.parent_track_id, t.user_id, lineage.depth + 1
       FROM tracks t
       JOIN lineage ON t.id = lineage.parent_track_id
       WHERE lineage.depth < 20
     )
     SELECT DISTINCT user_id
     FROM lineage
     WHERE user_id IS NOT NULL
       AND ($2::text IS NULL OR user_id <> $2)`,
    [sourceTrackId, excludeUserId || null]
  );
  return result.rows.map((row) => row.user_id);
}

export {
  isGuid,
  serviceError,
  loadSourceTrackMeta,
};
