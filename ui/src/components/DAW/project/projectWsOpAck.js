import {
  applyRemoteProjectOp,
  mergeTransportIntoProjectState,
} from './projectRemoteOpApplier';
import { mergeClipDeleteIntoProjectState } from './projectClipDelete';
import { emitProjectTrackMixerState } from './projectLoader';

export function mergeProjectStateAfterOp(currentState, opPayload, revision) {
  if (!currentState) return null;

  let nextState = { ...currentState, revision };
  nextState = mergeTransportIntoProjectState(nextState, opPayload);

  if (opPayload?.kind === 'track.create') {
    const trackExists = (nextState.tracks || []).some(
      (track) => track.id === opPayload.trackId
    );
    if (!trackExists) {
      nextState = {
        ...nextState,
        tracks: [
          ...(nextState.tracks || []),
          {
            id: opPayload.trackId,
            name: opPayload.name,
            sortOrder: opPayload.sortOrder,
            gain: opPayload.gain,
            muted: opPayload.muted,
            solo: opPayload.solo,
            clips: [],
          },
        ],
      };
    }
  }

  if (opPayload?.kind === 'track.delete') {
    nextState = {
      ...nextState,
      tracks: (nextState.tracks || []).filter(
        (track) => track.id !== opPayload.trackId
      ),
    };
  }

  if (opPayload?.kind === 'clip.delete') {
    nextState = mergeClipDeleteIntoProjectState(nextState, opPayload, revision);
  }

  return nextState;
}

/**
 * Apply a successful WS op_ack locally so the UI updates before/alongside broadcast.
 */
export function applyProjectWsOpAck({
  trackManager,
  opPayload,
  revision,
  currentProjectState,
  projectDataRef,
  remoteOpQueue,
  syncTracksFromManager,
  onProjectStateChange,
  setArmedTrackId,
  suppressSettingsPersistRef,
}) {
  if (revision != null && remoteOpQueue) {
    remoteOpQueue.setLastAppliedRevision(revision);
  }

  if (!opPayload || !trackManager) {
    if (currentProjectState && revision != null) {
      onProjectStateChange?.({ ...currentProjectState, revision });
    }
    return false;
  }

  const isTransportOp = opPayload.kind === 'project.transport';
  if (isTransportOp && suppressSettingsPersistRef) {
    suppressSettingsPersistRef.current = true;
  }

  let applied = false;
  try {
    applied = applyRemoteProjectOp(trackManager, opPayload);
  } finally {
    if (isTransportOp && suppressSettingsPersistRef) {
      suppressSettingsPersistRef.current = false;
    }
  }

  if (applied) {
    const nextTracks = syncTracksFromManager();
    setArmedTrackId?.((current) =>
      current != null && !nextTracks.some((track) => track.id === current)
        ? (nextTracks[0]?.id ?? null)
        : current
    );

    if (opPayload.kind === 'track.create') {
      emitProjectTrackMixerState(trackManager);
    }
  }

  const nextState = mergeProjectStateAfterOp(currentProjectState, opPayload, revision);
  if (nextState) {
    if (suppressSettingsPersistRef) {
      suppressSettingsPersistRef.current = true;
    }
    try {
      if (projectDataRef) {
        projectDataRef.current = nextState;
      }
      onProjectStateChange?.(nextState);
    } finally {
      if (suppressSettingsPersistRef) {
        suppressSettingsPersistRef.current = false;
      }
    }
  }

  return applied;
}
