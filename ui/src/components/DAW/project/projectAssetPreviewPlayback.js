import { eventBus } from '../misc/EventBus';
import { DAW_EVENTS } from '../misc/DAWEvents';

let activeStopFn = null;

export function stopAssetPreviewPlayback() {
  if (activeStopFn) {
    activeStopFn();
    activeStopFn = null;
  }
}

export function registerAssetPreviewPlayback(stopFn) {
  if (activeStopFn && activeStopFn !== stopFn) {
    activeStopFn();
  }
  activeStopFn = stopFn;
}

export function clearAssetPreviewPlayback(stopFn) {
  if (activeStopFn === stopFn) {
    activeStopFn = null;
  }
}

export function pauseOtherAudioSources({ pauseGlobalPlayer }) {
  eventBus.emit(DAW_EVENTS.TRANSPORT.PAUSE);
  pauseGlobalPlayer?.();
}
