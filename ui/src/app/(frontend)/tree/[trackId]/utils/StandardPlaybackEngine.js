/**
 * StandardPlaybackEngine — Howler-based linear playback with the same surface API
 * as LoopListeningEngine (minus loop-duration helpers). Progress uses full track length.
 */

import { Howl, Howler } from 'howler';
import { eventBus } from '@/components/DAW/misc/EventBus.js';
import { DAW_EVENTS } from '@/components/DAW/misc/DAWEvents.js';

class StandardPlaybackEngine {
  constructor(getNextTrack) {
    this.getNextTrack = getNextTrack;
    this.currentTrack = null;
    this.nextTrack = null;
    this.isPlaying = false;
    this.isCycleMode = false;
    this.currentProgress = 0;
    this.trackDuration = 0;

    this.howl = null;
    this.howlTrackId = null;
    this.progressInterval = null;

    this.eventBus = eventBus;
    this.DAW_EVENTS = DAW_EVENTS;
  }

  getTrackUrl(track) {
    if (!track) return null;
    return track.combined_audio_url || track.audio_url || null;
  }

  unloadHowl() {
    if (this.howl) {
      this.howl.stop();
      this.howl.unload();
      this.howl = null;
      this.howlTrackId = null;
    }
  }

  /**
   * @returns {Promise<void>}
   */
  ensureHowlForTrack(track) {
    if (!track) return Promise.resolve();

    const url = this.getTrackUrl(track);
    if (!url) {
      console.error('No audio URL for track:', track?.id);
      return Promise.reject(new Error('No audio URL'));
    }

    if (this.howlTrackId === track.id && this.howl) {
      return Promise.resolve();
    }

    this.unloadHowl();

    return new Promise((resolve, reject) => {
      const howl = new Howl({
        src: [url],
        html5: true,
        onload: () => {
          const d = howl.duration();
          if (d && isFinite(d)) {
            this.trackDuration = d;
            this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.LOOP_DURATION_CHANGED, {
              duration: d,
              previousDuration: null
            });
          }
          resolve();
        },
        onloaderror: (_id, err) => {
          console.error('Howl load error:', err);
          reject(err);
        },
        onend: () => this.handleHowlEnd()
      });

      this.howl = howl;
      this.howlTrackId = track.id;
    });
  }

  handleHowlEnd() {
    if (this.isCycleMode && this.currentTrack) {
      if (this.howl) {
        this.howl.seek(0);
        this.howl.play();
      }
      return;
    }

    const endedTrack = this.currentTrack;

    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, {
      track: this.nextTrack,
      previousTrack: this.currentTrack
    });

    if (!this.nextTrack) {
      this.pause();
    }

    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_ENDED, {
      track: endedTrack
    });

    this.currentTrack = this.nextTrack;
    this.nextTrack = null;

    this.getNextTrack()
      .then((t) => {
        this.nextTrack = t;
      })
      .catch((e) => {
        console.error('Error getting next track:', e);
        this.nextTrack = null;
      });

    if (this.currentTrack) {
      this.unloadHowl();
      this.playTrackInternal(this.currentTrack, 0).catch((e) => {
        console.error('Failed to start next track:', e);
      });
    } else {
      this.isPlaying = false;
      this.stopProgressUpdates();
      this.unloadHowl();
    }
  }

  stopProgressUpdates() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  startProgressUpdates() {
    this.stopProgressUpdates();

    this.progressInterval = setInterval(() => {
      if (!this.isPlaying || !this.howl) return;

      const seekPos = this.howl.seek();
      const progress = typeof seekPos === 'number' ? seekPos : 0;
      this.currentProgress = Math.max(0, progress);

      const duration =
        this.trackDuration ||
        (this.howl && this.howl.state() === 'loaded' ? this.howl.duration() : 0) ||
        0;

      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PROGRESS_UPDATE, {
        progress: this.currentProgress,
        loopDuration: duration,
        track: this.currentTrack
      });
    }, 50);
  }

  /**
   * Play a track (second arg accepted for API parity; duration comes from Howl once loaded).
   */
  async playTrack(track, _loopDuration) {
    if (!track) {
      console.error('No track provided to playTrack');
      return;
    }

    this.stop(false);

    const previousTrack = this.currentTrack;
    this.currentTrack = track;
    this.nextTrack = await this.getNextTrack();

    if (previousTrack?.id !== track.id) {
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, {
        track,
        previousTrack
      });
    }

    const ok = await this.playTrackInternal(track, 0, { emitPlaybackStarted: false });
    if (ok) {
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, { track });
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_STARTED, { track });
    }
  }

  async playTrackInternal(track, offset, { emitPlaybackStarted = true } = {}) {
    try {
      await this.ensureHowlForTrack(track);
    } catch {
      this.isPlaying = false;
      return false;
    }

    if (!this.howl) return false;

    this.howl.seek(offset);
    this.howl.play();
    this.isPlaying = true;
    this.currentProgress = offset;

    if (emitPlaybackStarted) {
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
        track
      });
    }

    this.startProgressUpdates();
    return true;
  }

  async next() {
    if (!this.nextTrack) return;

    const wasPlaying = this.isPlaying;
    this.pause();

    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, {
      track: this.nextTrack,
      previousTrack: this.currentTrack
    });

    this.currentTrack = this.nextTrack;
    this.nextTrack = await this.getNextTrack();

    if (wasPlaying) {
      await this.play(0);
    }
  }

  /**
   * @param {number} offset
   */
  async play(offset = 0) {
    if (!this.currentTrack) {
      this.isPlaying = false;
      return false;
    }

    try {
      await this.ensureHowlForTrack(this.currentTrack);
    } catch {
      this.isPlaying = false;
      return false;
    }

    if (!this.howl) return false;

    this.howl.seek(offset);
    this.howl.play();
    this.isPlaying = true;
    this.currentProgress = offset;

    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
      track: this.currentTrack
    });
    this.startProgressUpdates();
    return true;
  }

  pause() {
    if (!this.isPlaying && (!this.howl || !this.howl.playing())) return;

    this.isPlaying = false;
    this.stopProgressUpdates();

    if (this.howl?.playing()) {
      this.howl.pause();
    }

    if (this.howl) {
      const s = this.howl.seek();
      this.currentProgress = typeof s === 'number' ? s : 0;
    }

    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_PAUSED, {
      track: this.currentTrack,
      progress: this.currentProgress
    });
  }

  async resume() {
    if (this.isPlaying || !this.currentTrack) return;

    try {
      await this.ensureHowlForTrack(this.currentTrack);
    } catch {
      return;
    }

    if (!this.howl) return;

    const seekPos = this.currentProgress;
    this.howl.seek(seekPos);
    this.howl.play();
    this.isPlaying = true;

    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
      track: this.currentTrack
    });

    this.startProgressUpdates();
  }

  stop(send_event = true) {
    const wasPlaying = this.isPlaying;
    const stoppedTrack = this.currentTrack;

    this.pause();
    this.unloadHowl();
    this.currentProgress = 0;
    this.trackDuration = 0;
    this.currentTrack = null;

    if (wasPlaying && send_event) {
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STOPPED, {
        track: stoppedTrack
      });
    }
  }

  async seek(position) {
    if (!this.currentTrack) return;

    const duration =
      this.trackDuration ||
      (this.howl && this.howl.state() === 'loaded' ? this.howl.duration() : 0) ||
      0;
    const seekPosition = Math.max(0, Math.min(position, duration || position));

    const wasPlaying = this.isPlaying;

    if (this.howl) {
      this.howl.seek(seekPosition);
      this.currentProgress = seekPosition;
    } else {
      this.currentProgress = seekPosition;
    }

    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.SEEK, {
      position: seekPosition,
      track: this.currentTrack
    });

    if (wasPlaying && this.howl) {
      this.howl.play();
      this.isPlaying = true;
      this.startProgressUpdates();
    } else {
      this.isPlaying = false;
    }
  }

  enableCycleMode() {
    if (this.isCycleMode) return;
    this.isCycleMode = true;
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.CYCLE_MODE_CHANGED, {
      enabled: true
    });
  }

  disableCycleMode() {
    if (!this.isCycleMode) return;
    this.isCycleMode = false;
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.CYCLE_MODE_CHANGED, {
      enabled: false
    });
  }

  getProgress() {
    if (this.howl && this.howl.playing()) {
      const s = this.howl.seek();
      if (typeof s === 'number') this.currentProgress = s;
    }
    return this.currentProgress;
  }

  hasNextTrack() {
    return this.nextTrack !== null;
  }

  setNextTrack(track) {
    this.nextTrack = track;
  }

  destroy() {
    this.stop();
    this.unloadHowl();
  }
}

export default StandardPlaybackEngine;
