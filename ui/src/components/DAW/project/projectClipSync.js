import { bufferRegistry } from '../core/BufferRegistry';
import { getAudioBufferFromS3 } from '../misc/DAWUtils';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';
import { CLIP_PROCESSING_STATUS } from './projectClipUpload';

function collectServerClips(projectState) {
  const clips = new Map();

  for (const trackData of projectState?.tracks || []) {
    for (const clip of trackData.clips || []) {
      if (clip.id == null) continue;
      clips.set(clip.id, { trackId: trackData.id, clip });
    }
  }

  return clips;
}

function findRegionByClipId(trackManager, clipId) {
  if (!trackManager) return null;

  for (const track of trackManager.getAllTracks()) {
    const region = track.regions.find((item) => item.projectClipId === clipId);
    if (region) {
      return { track, region };
    }
  }

  return null;
}

function computeRegionEndTime(clip, bufferDuration) {
  const trimStart = clip.trimStart ?? 0;
  const startTime = clip.startTime ?? 0;

  if (clip.trimEnd != null) {
    return startTime + (clip.trimEnd - trimStart);
  }
  if (clip.duration != null) {
    return startTime + clip.duration;
  }
  if (bufferDuration != null) {
    return startTime + bufferDuration - trimStart;
  }

  return startTime;
}

function removeRegion(track, region) {
  if (region.key && bufferRegistry.hasBuffer(region.key)) {
    bufferRegistry.removeBuffer(region.key);
  }

  eventBus.emit(DAW_EVENTS.REGION.REMOVE, {
    region,
    trackId: track.id,
    recordUndo: false,
  });
}

/**
 * Sync timeline regions with clips from a serialized project state response.
 * Adds missing clips, removes deleted ones, and updates layout when needed.
 */
export async function syncProjectClipsFromState(trackManager, projectState) {
  if (!trackManager?.audioContext || !projectState) return;

  const serverClips = collectServerClips(projectState);
  const serverClipIds = new Set(serverClips.keys());

  for (const track of trackManager.getAllTracks()) {
    for (const region of [...track.regions]) {
      if (region.projectClipId == null) continue;
      if (!serverClipIds.has(region.projectClipId)) {
        removeRegion(track, region);
      }
    }
  }

  const addPromises = [];

  for (const [clipId, { trackId, clip }] of serverClips) {
    if (!clip.audioUrl) continue;

    const existing = findRegionByClipId(trackManager, clipId);
    if (existing) {
      const { track, region } = existing;
      const buffer = region.key ? bufferRegistry.getBuffer(region.key) : null;
      const trimStart = clip.trimStart ?? 0;
      const startTime = clip.startTime ?? 0;
      const endTime = computeRegionEndTime(clip, buffer?.duration ?? null);

      if (
        track.id !== trackId ||
        region.startTime !== startTime ||
        region.offset !== trimStart ||
        region.endTime !== endTime
      ) {
        trackManager.moveRegionBetweenTracks(track.id, trackId, region.id, {
          startTime,
          endTime,
          offset: trimStart,
        });
      }
      continue;
    }

    addPromises.push(
      (async () => {
        const track = trackManager.getTrack(trackId);
        if (!track) return;

        const buffer = await getAudioBufferFromS3(
          clip.audioUrl,
          trackManager.audioContext
        );
        const bufferKey = bufferRegistry.generateBufferKey(trackId, `clip-${clipId}`);
        bufferRegistry.storeBuffer(bufferKey, buffer, {
          name: `clip-${clipId}`,
          trackId,
          clipId,
        });

        const trimStart = clip.trimStart ?? 0;
        const startTime = clip.startTime ?? 0;
        const endTime = computeRegionEndTime(clip, buffer.duration);

        const region = track.addRegion(
          bufferKey,
          startTime,
          trimStart,
          endTime,
          track.title || `Clip ${clipId}`,
          false,
          false,
          null,
          true
        );

        if (!region) return;

        region.projectClipId = clipId;
        region.projectAssetId = clip.assetId ?? null;
        region.processingStatus = CLIP_PROCESSING_STATUS.COMPLETED;
      })()
    );
  }

  await Promise.all(addPromises);
}
