import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';

export function getProjectTransportSettings(projectData) {
  return {
    metronomeBpm: projectData.bpm ?? 120,
    timeSignature: projectData.timeSignature ?? '4/4',
    metronomeOffset: projectData.metronomeOffset ?? 0,
    durationSeconds: projectData.durationSeconds,
  };
}

export async function loadProjectIntoTrackManager(trackManager, projectData) {
  await trackManager.loadProject(projectData);
  return getProjectTransportSettings(projectData);
}

export function applyProjectTransportSettings(projectState) {
  if (!projectState) return;

  const settings = getProjectTransportSettings(projectState);

  eventBus.emit(DAW_EVENTS.METRONOME.BPM_CHANGE, { bpm: settings.metronomeBpm });
  eventBus.emit(DAW_EVENTS.METRONOME.TIME_SIGNATURE_CHANGE, {
    timeSignature: settings.timeSignature,
  });
  eventBus.emit(DAW_EVENTS.METRONOME.OFFSET_CHANGE, {
    offset: settings.metronomeOffset,
  });

  if (settings.durationSeconds != null) {
    eventBus.emit(DAW_EVENTS.PLAYBACK.DURATION_CHANGE, {
      duration: settings.durationSeconds,
    });
  }
}

export function emitProjectTrackMixerState(trackManager) {
  for (const track of trackManager.getAllTracks()) {
    if (track.isMuted) {
      eventBus.emit(DAW_EVENTS.TRACK.MUTE, { trackId: track.id, isMuted: true });
    }
    if (track.isSolo) {
      eventBus.emit(DAW_EVENTS.TRACK.SOLO, { trackId: track.id, isSolo: true });
    }
  }
}
