import { getProjectAssetPublicUrl } from './projectUtils.js';

/**
 * Re-resolve public audio/waveform URLs from project_assets for snapshot playback.
 * Snapshot JSON stores assetId only — never trust embedded URLs.
 *
 * @param {Object} state - snapshot state JSON
 * @param {Object} options
 * @param {number} options.projectId
 * @param {import('pg').Pool|import('pg').PoolClient} options.executor
 * @returns {Promise<Object>} state with REST-shaped clip audioUrl/waveformUrl fields
 */
async function hydrateSnapshotStateForPlayback(state, { projectId, executor }) {
  if (!state?.tracks) {
    return state;
  }

  const assetIds = new Set();
  for (const track of state.tracks) {
    for (const clip of track.clips || []) {
      if (clip.assetId != null) {
        assetIds.add(Number(clip.assetId));
      }
    }
  }

  const assetById = new Map();
  if (assetIds.size > 0) {
    const assetResult = await executor.query(
      `SELECT id, storage_key, audio_url, waveform_url, processing_status, duration_seconds
       FROM project_assets
       WHERE project_id = $1
         AND id = ANY($2::int[])
         AND deleted_at IS NULL`,
      [projectId, [...assetIds]]
    );

    for (const row of assetResult.rows) {
      assetById.set(Number(row.id), row);
    }
  }

  return {
    ...state,
    tracks: state.tracks.map((track) => ({
      ...track,
      clips: (track.clips || []).map((clip) => {
        const asset = assetById.get(Number(clip.assetId));
        const hydrated = {
          id: clip.id,
          assetId: clip.assetId,
          startTime: clip.startTime,
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd,
          duration: clip.duration,
          audioUrl: null,
        };

        if (!asset) {
          return hydrated;
        }

        if (asset.processing_status === 'completed') {
          hydrated.audioUrl = getProjectAssetPublicUrl(
            asset.storage_key || asset.audio_url
          );
          if (asset.waveform_url) {
            hydrated.waveformUrl = getProjectAssetPublicUrl(asset.waveform_url);
          }
        }

        hydrated.processingStatus = asset.processing_status;

        if (hydrated.duration == null && asset.duration_seconds != null) {
          const trimStart = clip.trimStart ?? 0;
          if (clip.trimEnd != null) {
            hydrated.duration = Math.max(0, clip.trimEnd - trimStart);
          } else {
            hydrated.duration = Math.max(0, asset.duration_seconds - trimStart);
          }
        }

        return hydrated;
      }),
    })),
  };
}

export { hydrateSnapshotStateForPlayback };
