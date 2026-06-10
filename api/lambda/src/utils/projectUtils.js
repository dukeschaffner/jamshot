import pool from '../config/db.js';

const PROCESSING_ERROR_MESSAGE =
  'Audio processing failed. Please try uploading again or contact support if the issue persists.';

function getProjectAssetPublicUrl(storageKey) {
  if (!storageKey) return null;
  if (storageKey.startsWith('http://') || storageKey.startsWith('https://')) {
    return storageKey;
  }
  return `${process.env.R2_PUBLIC_URL}/${storageKey}`;
}

function sanitizeProcessingError(error) {
  if (!error) return null;
  return PROCESSING_ERROR_MESSAGE;
}

function computeClipDuration(trimStart, trimEnd, assetDuration) {
  const start = trimStart ?? 0;
  if (trimEnd != null) {
    return Math.max(0, trimEnd - start);
  }
  if (assetDuration != null) {
    return Math.max(0, assetDuration - start);
  }
  return null;
}

function mapTrackRow(row, { variant, includeProcessingDetails }) {
  const track = {
    id: row.track_id,
    sortOrder: row.sort_order,
    name: row.track_name,
    gain: row.track_gain,
    muted: row.is_muted,
    solo: row.is_solo,
    clips: [],
  };

  if (row.color != null) {
    track.color = row.color;
  }

  if (row.clip_id == null) {
    return track;
  }

  const clip = {
    id: row.clip_id,
    assetId: row.asset_id,
    startTime: row.start_time_seconds,
    trimStart: row.trim_start_seconds,
    trimEnd: row.trim_end_seconds,
    duration: computeClipDuration(
      row.trim_start_seconds,
      row.trim_end_seconds,
      row.asset_duration
    ),
  };

  if (variant === 'rest') {
    clip.audioUrl =
      row.processing_status === 'completed'
        ? getProjectAssetPublicUrl(row.storage_key || row.audio_url)
        : null;

    if (includeProcessingDetails) {
      clip.processingStatus = row.processing_status;
      if (row.processing_status === 'failed') {
        clip.processingError = sanitizeProcessingError(row.processing_error);
      }
    }
  }

  if (variant === 'plugin') {
    if (row.processing_status !== 'completed') {
      return null;
    }
    clip.audioUrl = getProjectAssetPublicUrl(row.storage_key || row.audio_url);
    clip.trackId = row.track_id;
    clip.trackGain = row.track_gain;
    clip.gain = row.track_gain;
  }

  track.clips.push(clip);
  return track;
}

function buildTracksFromRows(rows, options) {
  const tracksById = new Map();
  const trackOrder = [];

  for (const row of rows) {
    if (row.clip_id != null && options.variant === 'plugin') {
      const clipRow = mapTrackRow(row, options);
      if (!clipRow?.clips?.length) continue;
      const clip = clipRow.clips[0];
      if (!tracksById.has('flat')) {
        tracksById.set('flat', []);
        trackOrder.push('flat');
      }
      tracksById.get('flat').push(clip);
      continue;
    }

    let track = tracksById.get(row.track_id);
    if (!track) {
      track = {
        id: row.track_id,
        sortOrder: row.sort_order,
        name: row.track_name,
        gain: row.track_gain,
        muted: row.is_muted,
        solo: row.is_solo,
        clips: [],
      };
      if (row.color != null) {
        track.color = row.color;
      }
      tracksById.set(row.track_id, track);
      trackOrder.push(row.track_id);
    }

    if (row.clip_id != null) {
      const clipTrack = mapTrackRow(row, options);
      if (clipTrack?.clips?.length) {
        track.clips.push(clipTrack.clips[0]);
      }
    }
  }

  if (options.variant === 'plugin') {
    return tracksById.get('flat') || [];
  }

  return trackOrder.map((id) => tracksById.get(id));
}

async function fetchProjectTimelineRows(projectId) {
  const result = await pool.query(
    `SELECT
       pt.id AS track_id,
       pt.sort_order,
       pt.name AS track_name,
       pt.color,
       pt.gain AS track_gain,
       pt.is_muted,
       pt.is_solo,
       pc.id AS clip_id,
       pc.start_time_seconds,
       pc.trim_start_seconds,
       pc.trim_end_seconds,
       pa.id AS asset_id,
       pa.storage_key,
       pa.audio_url,
       pa.duration_seconds AS asset_duration,
       pa.processing_status,
       pa.processing_error
     FROM project_tracks pt
     LEFT JOIN project_clips pc
       ON pc.project_track_id = pt.id AND pc.deleted_at IS NULL
     LEFT JOIN project_assets pa
       ON pa.id = pc.asset_id AND pa.deleted_at IS NULL
     WHERE pt.project_id = $1
     ORDER BY pt.sort_order, pt.id, pc.start_time_seconds, pc.id`,
    [projectId]
  );

  return result.rows;
}

/**
 * Canonical project state serializer.
 *
 * @param {number|string} projectId
 * @param {Object} [options]
 * @param {'rest'|'snapshot'|'plugin'} [options.variant='rest']
 *   - rest: GET /projects/:id (metadata + nested tracks/clips + public URLs)
 *   - snapshot: JSON for project_snapshots.state (assetId only, no URLs)
 *   - plugin: flat completed clips for plugin-payload
 */
async function serializeProjectState(projectId, options = {}) {
  const variant = options.variant || 'rest';
  const includeProcessingDetails = options.includeProcessingDetails !== false;

  const projectResult = await pool.query(
    `SELECT id, guid, name, owner_id, team_id, camp_id,
            bpm, time_signature, metronome_offset, duration_seconds,
            is_private, revision, created_at, updated_at
     FROM projects
     WHERE id = $1`,
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    return null;
  }

  const project = projectResult.rows[0];
  const rows = await fetchProjectTimelineRows(projectId);
  const buildOptions = {
    variant: variant === 'snapshot' ? 'snapshot' : variant,
    includeProcessingDetails,
  };
  const tracks = buildTracksFromRows(rows, buildOptions);

  if (variant === 'snapshot') {
    return {
      bpm: project.bpm,
      timeSignature: project.time_signature,
      metronomeOffset: project.metronome_offset,
      durationSeconds: project.duration_seconds,
      tracks,
    };
  }

  if (variant === 'plugin') {
    return {
      bpm: project.bpm,
      timeSignature: project.time_signature,
      durationSeconds: project.duration_seconds,
      clips: tracks,
    };
  }

  return {
    id: project.id,
    guid: project.guid,
    name: project.name,
    ownerId: project.owner_id,
    teamId: project.team_id,
    campId: project.camp_id,
    bpm: project.bpm,
    timeSignature: project.time_signature,
    metronomeOffset: project.metronome_offset,
    durationSeconds: project.duration_seconds,
    revision: Number(project.revision),
    isPrivate: project.is_private,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    tracks,
  };
}

/**
 * Collect unique asset IDs from a snapshot state object (for project_snapshot_assets).
 * @param {Object} state - snapshot JSON from serializeProjectState(..., { variant: 'snapshot' })
 */
function collectSnapshotAssetIds(state) {
  const assetIds = new Set();

  for (const track of state?.tracks || []) {
    for (const clip of track.clips || []) {
      if (clip.assetId != null) {
        assetIds.add(clip.assetId);
      }
    }
  }

  return [...assetIds];
}

export {
  getProjectAssetPublicUrl,
  serializeProjectState,
  collectSnapshotAssetIds,
};
