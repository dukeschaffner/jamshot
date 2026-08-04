import { bufferRegistry } from '../core/BufferRegistry';
import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';

/**
 * Remove a project region from the in-memory timeline without recording undo.
 */
export function removeProjectRegionLocally({ trackId, region }) {
  if (region.key && bufferRegistry.hasBuffer(region.key)) {
    bufferRegistry.removeBuffer(region.key);
  }

  eventBus.emit(DAW_EVENTS.REGION.REMOVE, {
    region,
    trackId,
    recordUndo: false,
  });
}

export function buildClipDeleteOpPayload({ clipId, trackId }) {
  return {
    kind: 'clip.delete',
    clipId,
    trackId,
  };
}

/**
 * Remove a soft-deleted clip from serialized project page state.
 */
export function mergeClipDeleteIntoProjectState(projectState, opPayload, revision) {
  if (!projectState || opPayload?.kind !== 'clip.delete') {
    return projectState;
  }

  return {
    ...projectState,
    revision,
    tracks: (projectState.tracks || []).map((track) => {
      if (track.id !== opPayload.trackId) {
        return track;
      }

      return {
        ...track,
        clips: (track.clips || []).filter((clip) => clip.id !== opPayload.clipId),
      };
    }),
  };
}
