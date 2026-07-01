import { bufferRegistry } from '../core/BufferRegistry';
import AudioState from '../core/AudioStateStore';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';

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

function computeRegionTimesFromTrim({ startTime, trimStart, trimEnd, bufferDuration }) {
  const offset = trimStart ?? 0;
  let endTime;
  if (trimEnd != null) {
    endTime = startTime + (trimEnd - offset);
  } else if (bufferDuration != null) {
    endTime = startTime + bufferDuration - offset;
  } else {
    endTime = startTime;
  }
  return { startTime, endTime, offset };
}

function applyClipLayout(trackManager, clipId, trackId, layout) {
  const found = findRegionByClipId(trackManager, clipId);
  if (!found) return false;

  const { track: sourceTrack, region } = found;
  const buffer = region.key ? bufferRegistry.getBuffer(region.key) : null;
  const times = computeRegionTimesFromTrim({
    ...layout,
    bufferDuration: buffer?.duration ?? null,
  });

  trackManager.moveRegionBetweenTracks(sourceTrack.id, trackId, region.id, times);
  return true;
}

function applyClipDelete(trackManager, clipId, trackId) {
  const found = findRegionByClipId(trackManager, clipId);
  if (!found) return false;

  const { track, region } = found;
  if (track.id !== trackId) return false;

  if (region.key && bufferRegistry.hasBuffer(region.key)) {
    bufferRegistry.removeBuffer(region.key);
  }

  eventBus.emit(DAW_EVENTS.REGION.REMOVE, {
    region,
    trackId: track.id,
    recordUndo: false,
  });
  return true;
}

function applyTrackCreate(trackManager, payload) {
  if (!trackManager || trackManager.getTrack(payload.trackId)) {
    return false;
  }

  trackManager.addEmptyProjectTrack({
    id: payload.trackId,
    name: payload.name,
    sortOrder: payload.sortOrder,
    gain: payload.gain ?? 0.8,
    muted: payload.muted ?? false,
    solo: payload.solo ?? false,
  });
  return true;
}

function applyTrackDelete(trackManager, trackId) {
  if (!trackManager?.getTrack(trackId)) return false;
  trackManager.removeTrack(trackId);
  return true;
}

function applyTrackUpdate(trackManager, payload) {
  const track = trackManager?.getTrack(payload.trackId);
  if (!track) return false;

  if (payload.name !== undefined) {
    track.title = payload.name;
  }
  if (payload.gain !== undefined) {
    track.setGain(payload.gain);
  }
  if (payload.muted !== undefined) {
    track.isMuted = payload.muted;
    eventBus.emit(DAW_EVENTS.TRACK.MUTE, {
      trackId: track.id,
      isMuted: payload.muted,
    });
  }
  if (payload.solo !== undefined) {
    track.isSolo = payload.solo;
    eventBus.emit(DAW_EVENTS.TRACK.SOLO, {
      trackId: track.id,
      isSolo: payload.solo,
    });
  }

  return true;
}

function applyTrackReorder(trackManager, orders) {
  return trackManager?.reorderTracks(orders) ?? false;
}

function applyProjectTransport(payload) {
  if (payload.bpm !== undefined) {
    eventBus.emit(DAW_EVENTS.METRONOME.BPM_CHANGE, { bpm: payload.bpm });
  }
  if (payload.timeSignature !== undefined) {
    eventBus.emit(DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, {
      timeSignature: payload.timeSignature,
    });
  }
  if (payload.metronomeOffset !== undefined) {
    eventBus.emit(DAW_EVENTS.METRONOME.OFFSET_CHANGE, {
      offset: payload.metronomeOffset,
    });
  }
  if (payload.durationSeconds !== undefined) {
    AudioState.dawDuration = payload.durationSeconds;
    eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, {
      duration: payload.durationSeconds,
    });
  }

  return true;
}

/**
 * Apply a remote WS op payload to the in-memory DAW state.
 *
 * @param {import('../core/TrackManager').default} trackManager
 * @param {object} opPayload
 * @returns {boolean}
 */
export function applyRemoteProjectOp(trackManager, opPayload) {
  if (!opPayload?.kind) return false;

  switch (opPayload.kind) {
    case 'clip.move':
      return applyClipLayout(trackManager, opPayload.clipId, opPayload.trackId, {
        startTime: opPayload.startTime,
        trimStart: opPayload.trimStart,
        trimEnd: opPayload.trimEnd,
      });
    case 'clip.trim':
      return applyClipLayout(trackManager, opPayload.clipId, opPayload.trackId, {
        startTime: opPayload.startTime,
        trimStart: opPayload.trimStart,
        trimEnd: opPayload.trimEnd,
      });
    case 'clip.move_to_track':
      return applyClipLayout(trackManager, opPayload.clipId, opPayload.destTrackId, {
        startTime: opPayload.startTime,
        trimStart: opPayload.trimStart,
        trimEnd: opPayload.trimEnd,
      });
    case 'clip.delete':
      return applyClipDelete(trackManager, opPayload.clipId, opPayload.trackId);
    case 'track.create':
      return applyTrackCreate(trackManager, opPayload);
    case 'track.delete':
      return applyTrackDelete(trackManager, opPayload.trackId);
    case 'track.update':
      return applyTrackUpdate(trackManager, opPayload);
    case 'track.reorder':
      return applyTrackReorder(trackManager, opPayload.orders);
    case 'project.transport':
      return applyProjectTransport(opPayload);
    default:
      return false;
  }
}

/**
 * Merge transport fields from a remote op into project page metadata.
 */
export function mergeTransportIntoProjectState(projectState, opPayload) {
  if (!projectState || opPayload?.kind !== 'project.transport') {
    return projectState;
  }

  const next = { ...projectState };

  if (opPayload.bpm !== undefined) {
    next.bpm = opPayload.bpm;
  }
  if (opPayload.timeSignature !== undefined) {
    next.timeSignature = opPayload.timeSignature;
  }
  if (opPayload.metronomeOffset !== undefined) {
    next.metronomeOffset = opPayload.metronomeOffset;
  }
  if (opPayload.durationSeconds !== undefined) {
    next.durationSeconds = opPayload.durationSeconds;
  }

  return next;
}

/**
 * Whether a remote op from the given user should be applied locally.
 * Clip/transport edits are already optimistic for the sender; structural ops always apply.
 */
export function shouldApplyRemoteOp(opPayload, fromUserId, localUserId) {
  if (!fromUserId || fromUserId !== localUserId) {
    return true;
  }

  const alwaysApplyKinds = new Set([
    'track.create',
    'track.delete',
    'track.reorder',
  ]);

  return alwaysApplyKinds.has(opPayload?.kind);
}
