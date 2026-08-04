import { eventBus } from './misc/EventBus';
import { DAW_EVENTS } from './misc/DAWEvents';
import { stopAssetPreviewPlayback } from './project/projectAssetPreviewPlayback';

function handleGlobalPlaybackStarted() {
  stopAssetPreviewPlayback();
  eventBus.emit(DAW_EVENTS.TRANSPORT.PAUSE);
}

function handleDawTransportPlay() {
  stopAssetPreviewPlayback();
}

export function initDawExternalPlaybackListeners() {
  eventBus.on(DAW_EVENTS.GLOBAL_PLAYER.PLAYBACK_STARTED, handleGlobalPlaybackStarted);
  eventBus.on(DAW_EVENTS.TRANSPORT.PLAY, handleDawTransportPlay);

  return () => {
    eventBus.off(DAW_EVENTS.GLOBAL_PLAYER.PLAYBACK_STARTED, handleGlobalPlaybackStarted);
    eventBus.off(DAW_EVENTS.TRANSPORT.PLAY, handleDawTransportPlay);
  };
}
