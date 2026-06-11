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
