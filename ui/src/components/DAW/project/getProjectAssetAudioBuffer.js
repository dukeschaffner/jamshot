import { getAudioBufferFromS3 } from '../misc/DAWUtils';
import {
  readCachedProjectAssetAudio,
  writeCachedProjectAssetAudio,
  buildProjectAssetCacheKey,
} from './projectAssetAudioCache';

const inFlightFetches = new Map();

async function fetchRawAudioBytes(audioUrl) {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
  }
  return response.arrayBuffer();
}

async function loadRawProjectAssetBytes({ projectGuid, assetId, audioUrl }) {
  const cached = await readCachedProjectAssetAudio({ projectGuid, assetId, audioUrl });
  if (cached) {
    return cached;
  }

  const data = await fetchRawAudioBytes(audioUrl);
  void writeCachedProjectAssetAudio({ projectGuid, assetId, audioUrl, data });
  return data;
}

function canUseProjectAssetCache({ projectGuid, assetId, audioUrl }) {
  return Boolean(projectGuid && assetId != null && audioUrl);
}

/**
 * Load and decode project asset audio, using IndexedDB cache when possible.
 * Falls back to direct network fetch when cache is disabled or asset metadata is missing.
 */
export async function getProjectAssetAudioBuffer(
  { projectGuid, assetId, audioUrl },
  audioContext
) {
  try {
    if (!canUseProjectAssetCache({ projectGuid, assetId, audioUrl })) {
      return getAudioBufferFromS3(audioUrl, audioContext);
    }

    const cacheKey = buildProjectAssetCacheKey(projectGuid, assetId);
    let fetchPromise = inFlightFetches.get(cacheKey);

    if (!fetchPromise) {
      fetchPromise = loadRawProjectAssetBytes({ projectGuid, assetId, audioUrl }).finally(() => {
        inFlightFetches.delete(cacheKey);
      });
      inFlightFetches.set(cacheKey, fetchPromise);
    }

    const rawBytes = await fetchPromise;
    const decodeBuffer = rawBytes.slice(0);
    return audioContext.decodeAudioData(decodeBuffer);
  } catch (error) {
    console.error('Error loading project asset audio:', error);
    throw error;
  }
}
