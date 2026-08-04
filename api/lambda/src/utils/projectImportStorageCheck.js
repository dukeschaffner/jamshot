import { getR2ObjectByteSize } from './projectAssetUtils.js';
import { checkProjectStorageLimit } from './projectStorageLimit.js';

/**
 * Sum ContentLength for a list of R2 keys/URLs.
 * @param {string[]} sourceAudioKeys
 * @returns {Promise<number|null>} total bytes, or null if any object size is unknown
 */
async function sumR2ObjectByteSizes(sourceAudioKeys) {
  const keys = [...new Set((sourceAudioKeys || []).filter(Boolean))];
  let total = 0;

  for (const key of keys) {
    const size = await getR2ObjectByteSize(key);
    if (size == null || !Number.isFinite(size)) {
      return null;
    }
    total += size;
  }

  return total;
}

/**
 * Enforce project storage quota before copying source audio into a project.
 *
 * @param {Object} project - projects row (id, team_id, camp_id)
 * @param {Object} user - users row (subscription fields)
 * @param {string[]} sourceAudioKeys - R2 keys/URLs about to be copied
 * @param {{ currentUsageBytes?: number|null, executor?: import('pg').Pool | import('pg').PoolClient }} [options]
 */
async function checkProjectStorageForAudioSources(
  project,
  user,
  sourceAudioKeys,
  options = {}
) {
  const { currentUsageBytes = null, executor } = options;
  const keys = [...new Set((sourceAudioKeys || []).filter(Boolean))];

  if (keys.length === 0) {
    return {
      allowed: false,
      reason: 'No audio files available to copy',
      status: 400,
      usedBytes: currentUsageBytes ?? 0,
      maxBytes: 0,
    };
  }

  const incomingBytes = await sumR2ObjectByteSizes(keys);

  if (incomingBytes == null) {
    const probe = await checkProjectStorageLimit(
      project,
      user,
      0,
      currentUsageBytes,
      executor
    );
    if (probe.maxBytes === -1) {
      return { allowed: true, usedBytes: probe.usedBytes, maxBytes: -1 };
    }
    return {
      allowed: false,
      reason: 'Could not determine audio file size for storage limit check',
      status: 500,
      usedBytes: probe.usedBytes,
      maxBytes: probe.maxBytes,
    };
  }

  return checkProjectStorageLimit(
    project,
    user,
    incomingBytes,
    currentUsageBytes,
    executor
  );
}

export { sumR2ObjectByteSizes, checkProjectStorageForAudioSources };
