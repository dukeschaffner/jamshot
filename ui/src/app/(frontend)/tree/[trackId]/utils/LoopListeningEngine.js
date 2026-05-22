/**
 * LoopListeningEngine - Web Audio API engine for sample-accurate loop playback
 * Handles buffer scheduling, fade transitions, and precise timing
 */

import { bufferRegistry } from '@/components/DAW/core/BufferRegistry.js';
import { getAudioBufferFromS3 } from '@/components/DAW/misc/DAWUtils.js';
import { eventBus } from '@/components/DAW/misc/EventBus.js';
import { DAW_EVENTS } from '@/components/DAW/misc/DAWEvents.js';
import { loopLog, loopWarn, loopError } from './loopListeningLog.js';

const SCHEDULE_NEXT_TRACK_THRESHOLD = 2;

class LoopListeningEngine {
  constructor(audioContext, getNextTrack) {
    this.context = audioContext;
    this.getNextTrack = getNextTrack;
    this.loopDuration = null; // Set from root track duration
    this.currentTrack = null;
    this.nextTrack = null;
    this.nextTrackScheduled = false;
    this.schedulingNextTrack = false;
    this.isPlaying = false;
    this.isCycleMode = false;
    this.currentProgress = 0; // Progress within current loop (0 to loopDuration)
    
    // Scheduling state
    this.scheduledSources = new Set(); // Track all scheduled sources
    this.loopStartTime = null; // When current loop started
    
    // Gain nodes for fade transitions
    this.gainNode = this.context.createGain();
    this.gainNode.connect(this.context.destination);

    // Progress update interval
    this.progressInterval = null;
    
    // Event bus
    this.eventBus = eventBus;
    this.DAW_EVENTS = DAW_EVENTS;
    
    // Fade duration (micro fade)
    this.fadeDuration = 0.01; // 50ms fade

    loopLog('engine.init', 'LoopListeningEngine created', {
      audioContextState: this.context?.state,
      sampleRate: this.context?.sampleRate,
    });
  }
  
  /**
   * Set the loop duration (from root track)
   */
  setLoopDuration(duration) {
    const previousDuration = this.loopDuration;
    this.loopDuration = duration;

    loopLog('engine.setLoopDuration', 'Loop duration updated', {
      previousDuration,
      duration,
      changed: previousDuration !== duration,
    });
    
    // Emit event if duration changed
    if (previousDuration !== duration) {
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.LOOP_DURATION_CHANGED, {
        duration,
        previousDuration
      });
    }
  }
  
  /**
   * Get the loop duration
   */
  getLoopDuration() {
    return this.loopDuration;
  }
  
  /**
   * Play a track
   */
  async playTrack(track, loopDuration) {
    loopLog('engine.playTrack', 'playTrack called', {
      trackId: track?.id,
      trackTitle: track?.title,
      loopDurationArg: loopDuration,
      currentLoopDuration: this.loopDuration,
      isPlaying: this.isPlaying,
      audioContextState: this.context?.state,
    });

    if (!track) {
      loopError('engine.playTrack', 'Abort: no track provided');
      return;
    }
    
    // Stop current playback
    this.stop(false);
    
    // Set loop duration if provided
    if (loopDuration) {
      this.setLoopDuration(loopDuration);
    }
    
    if (!this.loopDuration) {
      loopError('engine.playTrack', 'Abort: loop duration not set', {
        trackId: track.id,
        loopDurationArg: loopDuration,
      });
      return;
    }
    
    const previousTrack = this.currentTrack;
    this.currentTrack = track;
    
    // Set initial next track
    this.nextTrack = await this.getNextTrack();
    loopLog('engine.playTrack', 'Next track resolved', {
      trackId: track.id,
      nextTrackId: this.nextTrack?.id ?? null,
    });
    
    // Emit track changed event if track actually changed
    if (previousTrack?.id !== track.id) {
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, {
        track,
        previousTrack
      });
    }
    
    // Resume context if suspended
    if (this.context.state === 'suspended') {
      loopWarn('engine.playTrack', 'AudioContext suspended — attempting resume', {
        trackId: track.id,
        audioContextState: this.context.state,
      });
      await this.context.resume();
      loopLog('engine.playTrack', 'AudioContext resume completed', {
        trackId: track.id,
        audioContextState: this.context.state,
      });
    }
    
    // Schedule playback
    const result = await this.play();
    loopLog('engine.playTrack', 'play() finished', {
      trackId: track.id,
      result,
      isPlaying: this.isPlaying,
      scheduledSourceCount: this.scheduledSources.size,
    });

    if(result) {
      // Emit playback started event
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
        track
      });
      
      // Emit track started event
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_STARTED, {
        track
      });
    } else {
      loopError('engine.playTrack', 'Playback did not start — play() returned false', {
        trackId: track.id,
        loopDuration: this.loopDuration,
        audioContextState: this.context?.state,
      });
    }
    
    // Pre-decode next track if available (will be handled by context)
    // This is just for the first track - context will handle subsequent tracks
  }

  async next() {
    loopLog('engine.next', 'next() called', {
      nextTrackId: this.nextTrack?.id ?? null,
      currentTrackId: this.currentTrack?.id ?? null,
      isPlaying: this.isPlaying,
    });

    if(!this.nextTrack) {
      loopWarn('engine.next', 'Abort: no next track');
      return;
    }

    const wasPlaying = this.isPlaying;
    this.pause();

    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, {
      track: this.nextTrack,
      previousTrack: this.currentTrack
    });

    this.currentTrack = this.nextTrack;
    this.nextTrack = await this.getNextTrack();
    loopLog('engine.next', 'Advanced to next track', {
      currentTrackId: this.currentTrack?.id ?? null,
      resolvedNextTrackId: this.nextTrack?.id ?? null,
      wasPlaying,
    });

    if(wasPlaying) {
      const result = await this.play();
      loopLog('engine.next', 'play() after next finished', {
        currentTrackId: this.currentTrack?.id ?? null,
        result,
        isPlaying: this.isPlaying,
      });
    }
  }
  
  /**
   * Get buffer from cache or decode from S3
   */
  async getOrDecodeBuffer(track) {
    const bufferKey = `${track.id}_loop-listening`;
    const url = track.combined_audio_url || track.audio_url;

    loopLog('engine.getOrDecodeBuffer', 'Fetching buffer', {
      trackId: track?.id,
      bufferKey,
      url: url ? `${url.slice(0, 80)}...` : null,
      cacheHit: bufferRegistry.hasBuffer(bufferKey),
      audioContextState: this.context?.state,
    });
    
    // Check cache first
    if (bufferRegistry.hasBuffer(bufferKey)) {
      const buffer = bufferRegistry.getBuffer(bufferKey);
      loopLog('engine.getOrDecodeBuffer', 'Cache hit', {
        trackId: track.id,
        bufferDuration: buffer?.duration,
      });
      return buffer;
    }
    
    // Decode from S3
    try {
      if (!url) {
        loopError('engine.getOrDecodeBuffer', 'Abort: no audio URL', { trackId: track.id });
        return null;
      }

      const decodeStart = performance.now();
      const buffer = await getAudioBufferFromS3(url, this.context);
      const decodeMs = Number((performance.now() - decodeStart).toFixed(1));
      
      // Store in cache
      bufferRegistry.storeBuffer(bufferKey, buffer, {
        name: 'loop-listening',
        trackId: track.id
      });

      loopLog('engine.getOrDecodeBuffer', 'Decoded and cached buffer', {
        trackId: track.id,
        bufferDuration: buffer.duration,
        decodeMs,
        audioContextState: this.context?.state,
      });
      
      return buffer;
    } catch (error) {
      loopError('engine.getOrDecodeBuffer', 'Decode failed', {
        trackId: track.id,
        url: url ? `${url.slice(0, 80)}...` : null,
        error: error?.message ?? String(error),
        audioContextState: this.context?.state,
      });
      return null;
    }
  }

  addFades(gainNode, startTime, endTime) {
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + this.fadeDuration);
    gainNode.gain.setValueAtTime(1, endTime - this.fadeDuration);
    gainNode.gain.linearRampToValueAtTime(0, endTime);
  }

  scheduleBuffer(buffer, startTime, offset, playDuration) {
    loopLog('engine.scheduleBuffer', 'Scheduling audio source', {
      trackId: this.currentTrack?.id ?? null,
      bufferDuration: buffer?.duration,
      startTime: Number(startTime.toFixed(4)),
      offset: Number(offset.toFixed(4)),
      playDuration: Number(playDuration.toFixed(4)),
      contextCurrentTime: Number(this.context.currentTime.toFixed(4)),
      leadTime: Number((startTime - this.context.currentTime).toFixed(4)),
      scheduledSourceCountBefore: this.scheduledSources.size,
    });

    if (!buffer) {
      loopError('engine.scheduleBuffer', 'Abort: no buffer provided', {
        trackId: this.currentTrack?.id ?? null,
      });
      return;
    }

    if (playDuration <= 0) {
      loopError('engine.scheduleBuffer', 'Abort: non-positive playDuration', {
        trackId: this.currentTrack?.id ?? null,
        playDuration,
        offset,
        bufferDuration: buffer.duration,
        loopDuration: this.loopDuration,
      });
      return;
    }

    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);
    this.addFades(this.gainNode, startTime, startTime + playDuration);

    try {
      source.start(startTime, offset, playDuration);
    } catch (error) {
      loopError('engine.scheduleBuffer', 'source.start() threw', {
        trackId: this.currentTrack?.id ?? null,
        error: error?.message ?? String(error),
        startTime,
        offset,
        playDuration,
        audioContextState: this.context?.state,
      });
      return;
    }

    this.scheduledSources.add(source);
    source.onended = () => {
      loopLog('engine.scheduleBuffer', 'Scheduled source ended', {
        trackId: this.currentTrack?.id ?? null,
        scheduledSourceCountAfter: this.scheduledSources.size - 1,
      });
      this.scheduledSources.delete(source);
    };
  }
  
  /**
   * Schedule playback of a buffer
   * @param {AudioBuffer} buffer - The audio buffer to play
   * @param {Object} track - The track object
   * @param {number} offset - Optional offset in seconds to start playback from (for seeking)
   */
  async play(offset = 0) {
    loopLog('engine.play', 'play() called', {
      trackId: this.currentTrack?.id ?? null,
      offset: Number(offset.toFixed(4)),
      loopDuration: this.loopDuration,
      isPlayingBefore: this.isPlaying,
      audioContextState: this.context?.state,
    });

    if (!this.loopDuration) {
      loopError('engine.play', 'Abort: loop duration not set', {
        trackId: this.currentTrack?.id ?? null,
      });
      this.isPlaying = false;
      return false;
    }

    if (!this.currentTrack) {
      loopError('engine.play', 'Abort: no current track');
      this.isPlaying = false;
      return false;
    }

    // Get buffer and reschedule from current progress position
    const bufferStart = performance.now();
    const buffer = await this.getOrDecodeBuffer(this.currentTrack);
    const bufferWaitMs = Number((performance.now() - bufferStart).toFixed(1));

    if (buffer) {
      this.isPlaying = true;
    }
    else{
      loopError('engine.play', 'Abort: failed to get buffer', {
        trackId: this.currentTrack.id,
        bufferWaitMs,
        audioContextState: this.context?.state,
      });
      this.isPlaying = false;
      return false;
    }
    
    // Calculate how much of the buffer to play
    const bufferDuration = buffer.duration;
    const playDuration = Math.min(bufferDuration - offset, this.loopDuration);

    if (playDuration <= 0) {
      loopError('engine.play', 'Abort: computed playDuration <= 0', {
        trackId: this.currentTrack.id,
        bufferDuration,
        offset,
        loopDuration: this.loopDuration,
        playDuration,
      });
      this.isPlaying = false;
      return false;
    }
    
    // Calculate when to start (aligned to loop duration)
    const startTime = this.context.currentTime + 0.1;
    this.loopStartTime = startTime - offset;

    loopLog('engine.play', 'Scheduling current track buffer', {
      trackId: this.currentTrack.id,
      bufferDuration,
      playDuration: Number(playDuration.toFixed(4)),
      startTime: Number(startTime.toFixed(4)),
      loopStartTime: Number(this.loopStartTime.toFixed(4)),
      bufferWaitMs,
    });
    
    this.scheduleBuffer(buffer, startTime, offset, playDuration);

    // Emit playback paused event
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED);
    
    // Start progress updates
    this.startProgressUpdates(startTime, playDuration);

    loopLog('engine.play', 'Playback scheduled successfully', {
      trackId: this.currentTrack.id,
      scheduledSourceCount: this.scheduledSources.size,
      isPlaying: this.isPlaying,
    });

    return true;
  }

  scheduleNextTrack() {
    if (!this.isPlaying || !this.currentTrack || this.nextTrackScheduled || this.schedulingNextTrack) {
      loopLog('engine.scheduleNextTrack', 'Skipped scheduling', {
        isPlaying: this.isPlaying,
        currentTrackId: this.currentTrack?.id ?? null,
        nextTrackScheduled: this.nextTrackScheduled,
        schedulingNextTrack: this.schedulingNextTrack,
      });
      return;
    }

    this.schedulingNextTrack = true;

    const track = this.isCycleMode ? this.currentTrack : this.nextTrack;
    loopLog('engine.scheduleNextTrack', 'Starting next-track scheduling', {
      schedulingTrackId: track?.id ?? null,
      isCycleMode: this.isCycleMode,
      currentProgress: Number(this.currentProgress.toFixed(4)),
      loopDuration: this.loopDuration,
    });

    if(!track) {
      loopWarn('engine.scheduleNextTrack', 'Abort: no track to schedule', {
        isCycleMode: this.isCycleMode,
        nextTrackId: this.nextTrack?.id ?? null,
        currentTrackId: this.currentTrack?.id ?? null,
      });
      this.schedulingNextTrack = false;
      return;
    }

    let startTime = this.loopStartTime + this.loopDuration;
    const scheduleStart = performance.now();
    this.getOrDecodeBuffer(track).then(buffer => {
      const decodeMs = Number((performance.now() - scheduleStart).toFixed(1));

      if (!buffer) {
        loopError('engine.scheduleNextTrack', 'Abort: failed to decode next buffer', {
          schedulingTrackId: track.id,
          decodeMs,
        });
        this.schedulingNextTrack = false;
        return;
      }

      const bufferDuration = buffer.duration;
      let playDuration = Math.min(bufferDuration, this.loopDuration);
      let offset = 0;
      const currentTime = this.context.currentTime;
      const wasLate = currentTime > startTime;
      if(wasLate) { // buffer did not load until after loop start
        const timeDelta = currentTime - startTime + 0.01;
        startTime = startTime + timeDelta;
        playDuration = playDuration - timeDelta;
        offset = timeDelta;
        loopWarn('engine.scheduleNextTrack', 'Next buffer loaded late — adjusting start', {
          schedulingTrackId: track.id,
          decodeMs,
          timeDelta: Number(timeDelta.toFixed(4)),
          adjustedStartTime: Number(startTime.toFixed(4)),
          adjustedPlayDuration: Number(playDuration.toFixed(4)),
          adjustedOffset: Number(offset.toFixed(4)),
        });
      } else {
        loopLog('engine.scheduleNextTrack', 'Next buffer ready in time', {
          schedulingTrackId: track.id,
          decodeMs,
          startTime: Number(startTime.toFixed(4)),
          playDuration: Number(playDuration.toFixed(4)),
        });
      }

      if (playDuration <= 0) {
        loopError('engine.scheduleNextTrack', 'Abort: adjusted playDuration <= 0', {
          schedulingTrackId: track.id,
          decodeMs,
          wasLate,
          playDuration,
          offset,
        });
        this.schedulingNextTrack = false;
        return;
      }

      this.scheduleBuffer(buffer, startTime, offset, playDuration);
      if(offset === 0) {
        this.nextTrackScheduled = true; // Don't mark nextTrackScheduled if scheduling didnt finish before the loop start
      } else {
        loopWarn('engine.scheduleNextTrack', 'nextTrackScheduled left false due to late scheduling', {
          schedulingTrackId: track.id,
          offset,
        });
      }
      this.schedulingNextTrack = false;

      loopLog('engine.scheduleNextTrack', 'Next track scheduled', {
        schedulingTrackId: track.id,
        nextTrackScheduled: this.nextTrackScheduled,
        scheduledSourceCount: this.scheduledSources.size,
      });
    }).catch(error => {
      loopError('engine.scheduleNextTrack', 'Unhandled scheduling error', {
        schedulingTrackId: track?.id ?? null,
        error: error?.message ?? String(error),
      });
      this.schedulingNextTrack = false;
    });
  }
  
  /**
   * Start progress update interval
   */
  startProgressUpdates(startTime, duration) {
    this.stopProgressUpdates();
    
    this.progressInterval = setInterval(() => {
      if (!this.isPlaying || !this.loopStartTime) {
        return;
      }
      
      const now = this.context.currentTime;
      const elapsed = now - this.loopStartTime;
      this.currentProgress = Math.max(0, Math.min(elapsed, this.loopDuration));
      
      // Emit progress update event
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PROGRESS_UPDATE, {
        progress: this.currentProgress,
        loopDuration: this.loopDuration,
        track: this.currentTrack
      });

      if (elapsed > this.loopDuration) { // new loop started
        loopLog('engine.progress', 'Loop boundary crossed', {
          currentTrackId: this.currentTrack?.id ?? null,
          nextTrackId: this.nextTrack?.id ?? null,
          elapsed: Number(elapsed.toFixed(4)),
          loopDuration: this.loopDuration,
          isCycleMode: this.isCycleMode,
        });

        this.nextTrackScheduled = false;
        this.loopStartTime = this.loopStartTime + this.loopDuration;

        if(!this.isCycleMode) {

          this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, {
            track: this.nextTrack,
            previousTrack: this.currentTrack
          });

          if(!this.nextTrack) {
            loopWarn('engine.progress', 'No next track at loop boundary — pausing playback', {
              previousTrackId: this.currentTrack?.id ?? null,
            });
            this.pause(); // no next track, so stop playback
          }

          this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_ENDED, {
            track: this.currentTrack
          });
          
          this.currentTrack = this.nextTrack;
          // Handle async getNextTrack
          this.getNextTrack().then(track => {
            loopLog('engine.progress', 'Resolved next track after loop boundary', {
              nextTrackId: track?.id ?? null,
            });
            this.nextTrack = track;
          }).catch(error => {
            loopError('engine.progress', 'Failed to resolve next track after loop boundary', {
              error: error?.message ?? String(error),
            });
            this.nextTrack = null;
          });
        }
      }
      else if(!this.nextTrackScheduled && this.loopDuration - this.currentProgress < SCHEDULE_NEXT_TRACK_THRESHOLD) {
        loopLog('engine.progress', 'Triggering scheduleNextTrack from progress interval', {
          currentTrackId: this.currentTrack?.id ?? null,
          currentProgress: Number(this.currentProgress.toFixed(4)),
          remaining: Number((this.loopDuration - this.currentProgress).toFixed(4)),
        });
        this.scheduleNextTrack();
      }
    }, 50); // Update every 50ms
  }
  
  /**
   * Stop progress updates
   */
  stopProgressUpdates() {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  stopAllSources() {
    this.scheduledSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source may already be stopped
      }
    });
    this.scheduledSources.clear();
    this.gainNode.gain.cancelScheduledValues(0);
    this.nextTrackScheduled = false;
  }
  
  /**
   * Pause playback
   */
  pause() {
    if (!this.isPlaying) {
      loopLog('engine.pause', 'Ignored — already not playing', {
        currentTrackId: this.currentTrack?.id ?? null,
      });
      return;
    }

    loopLog('engine.pause', 'Pausing playback', {
      currentTrackId: this.currentTrack?.id ?? null,
      progress: Number(this.currentProgress.toFixed(4)),
      scheduledSourceCount: this.scheduledSources.size,
    });
    
    this.isPlaying = false;
    this.stopProgressUpdates();
  
    this.stopAllSources();
    
    // Emit playback paused event
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_PAUSED, {
      track: this.currentTrack,
      progress: this.currentProgress
    });
  }
  
  /**
   * Resume playback
   */
  async resume() {
    loopLog('engine.resume', 'resume() called', {
      isPlaying: this.isPlaying,
      currentTrackId: this.currentTrack?.id ?? null,
      currentProgress: Number(this.currentProgress.toFixed(4)),
      audioContextState: this.context?.state,
    });

    if (this.isPlaying || !this.currentTrack) {
      loopWarn('engine.resume', 'Abort', {
        reason: this.isPlaying ? 'already playing' : 'no current track',
        currentTrackId: this.currentTrack?.id ?? null,
      });
      return;
    }
    
    // Resume context
    if (this.context.state === 'suspended') {
      loopWarn('engine.resume', 'AudioContext suspended — attempting resume', {
        currentTrackId: this.currentTrack.id,
      });
      await this.context.resume();
      loopLog('engine.resume', 'AudioContext resume completed', {
        currentTrackId: this.currentTrack.id,
        audioContextState: this.context.state,
      });
    }
    
    // Get buffer and reschedule from current progress position
    const buffer = await this.getOrDecodeBuffer(this.currentTrack);
    if (buffer) {
      this.isPlaying = true;
      
      // Emit playback started event
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
        track: this.currentTrack
      });
      
      // Resume from current progress position
      const result = this.play(this.currentProgress);
      loopLog('engine.resume', 'Called play() from resume', {
        currentTrackId: this.currentTrack.id,
        currentProgress: Number(this.currentProgress.toFixed(4)),
        playReturnType: result?.constructor?.name ?? typeof result,
        playReturnTruthy: Boolean(result),
      });

      if(result) {
        // Emit playback started event
        this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
          track: this.currentTrack
        });
      } else {
        loopError('engine.resume', 'play() returned falsy synchronously (may still be pending)', {
          currentTrackId: this.currentTrack.id,
          currentProgress: Number(this.currentProgress.toFixed(4)),
        });
      }
    } else {
      loopError('engine.resume', 'Abort: failed to get buffer', {
        currentTrackId: this.currentTrack.id,
      });
    }
  }
  
  /**
   * Stop playback
   */
  stop(send_event = true) {
    const wasPlaying = this.isPlaying;
    const stoppedTrack = this.currentTrack;

    loopLog('engine.stop', 'stop() called', {
      sendEvent: send_event,
      wasPlaying,
      stoppedTrackId: stoppedTrack?.id ?? null,
      scheduledSourceCount: this.scheduledSources.size,
    });
    
    this.pause();
    this.loopStartTime = null;
    this.currentProgress = 0;
    this.currentTrack = null;
    
    // Emit playback stopped event (only if it was actually playing)
    if (wasPlaying && send_event) {
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STOPPED, {
        track: stoppedTrack
      });
    }
  }
  
  /**
   * Seek within current loop
   */
  async seek(position) {
    loopLog('engine.seek', 'seek() called', {
      requestedPosition: position,
      currentTrackId: this.currentTrack?.id ?? null,
      loopDuration: this.loopDuration,
      wasPlaying: this.isPlaying,
    });

    if (!this.currentTrack || !this.loopDuration) {
      loopWarn('engine.seek', 'Abort: missing current track or loop duration', {
        currentTrackId: this.currentTrack?.id ?? null,
        loopDuration: this.loopDuration,
      });
      return;
    }
    
    // Clamp position to loop duration
    const seekPosition = Math.max(0, Math.min(position, this.loopDuration));
    
    // Store whether we were playing before seeking
    const wasPlaying = this.isPlaying;
    
    // Stop all scheduled sources
    this.stopAllSources();
    
    // Stop progress updates
    this.stopProgressUpdates();
    
    // Update progress position
    this.currentProgress = seekPosition;
    
    // Reset timing state for fresh start from seek position
    const now = this.context.currentTime;
    const startTime = now + 0.1; // Start playback slightly in the future
    // Set loopStartTime so that progress calculation accounts for the offset
    // When we calculate: elapsed = now - loopStartTime, we want it to equal seekPosition initially
    // So: loopStartTime = now - seekPosition
    // But we also need to account for the fact that playback starts at startTime
    // So we set loopStartTime = startTime - seekPosition
    this.loopStartTime = startTime - seekPosition;
    
    // Emit seek event
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.SEEK, {
      position: seekPosition,
      track: this.currentTrack
    });
    
    // Only schedule playback if we were playing before seeking
    if (wasPlaying) {
        const result = this.play(seekPosition);
        loopLog('engine.seek', 'Called play() after seek', {
          seekPosition,
          playReturnType: result?.constructor?.name ?? typeof result,
          playReturnTruthy: Boolean(result),
        });
    } else {
      // If paused, just update the position without starting playback
      this.isPlaying = false;
    }
  }
  
  /**
   * Enable cycle mode (repeat current track)
   */
  enableCycleMode() {
    if (this.isCycleMode) return;
    this.isCycleMode = true;

    if(this.nextTrackScheduled) { // if next track is scheduled, schedule it again to account for the new cycle mode
      this.scheduleNextTrack();
    }
    
    // Emit cycle mode changed event
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.CYCLE_MODE_CHANGED, {
      enabled: true
    });
  }
  
  /**
   * Disable cycle mode
   */
  disableCycleMode() {
    if (!this.isCycleMode) return;
    this.isCycleMode = false;

    if(this.nextTrackScheduled) { // if next track is scheduled, schedule it again to account for the new cycle mode
      this.scheduleNextTrack();
    }
    
    // Emit cycle mode changed event
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.CYCLE_MODE_CHANGED, {
      enabled: false
    });
  }
  
  /**
   * Get current progress
   */
  getProgress() {
    return this.currentProgress;
  }

  hasNextTrack() {
    return this.nextTrack !== null;
  }

  setNextTrack(track) {
    this.nextTrack = track;
  }
  
  /**
   * Cleanup
   */
  destroy() {
    loopLog('engine.destroy', 'Destroying engine', {
      currentTrackId: this.currentTrack?.id ?? null,
      scheduledSourceCount: this.scheduledSources.size,
    });
    this.stop();
    this.gainNode.disconnect();
    this.gainNode = null;

    if (this.context) {
      this.context.close();
    }
  }
}

export default LoopListeningEngine;

