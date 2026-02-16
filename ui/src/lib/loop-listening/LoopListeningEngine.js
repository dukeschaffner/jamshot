/**
 * LoopListeningEngine - Web Audio API engine for sample-accurate loop playback
 * Handles buffer scheduling, fade transitions, and precise timing
 */

import { bufferRegistry } from '../../components/DAW/core/BufferRegistry.js';
import { getAudioBufferFromS3 } from '../../components/DAW/misc/DAWUtils.js';
import { eventBus } from '../../components/DAW/misc/EventBus.js';
import { DAW_EVENTS } from '../../components/DAW/misc/DAWEvents.js';

class LoopListeningEngine {
  constructor(audioContext) {
    this.context = audioContext;
    this.loopDuration = null; // Set from root track duration
    this.currentTrack = null;
    this.isPlaying = false;
    this.isCycleMode = false;
    this.currentProgress = 0; // Progress within current loop (0 to loopDuration)
    
    // Scheduling state
    this.scheduledSources = new Set(); // Track all scheduled sources
    this.currentSource = null;
    this.nextSource = null;
    this.scheduleStartTime = null; // When playback started
    this.loopStartTime = null; // When current loop started
    this.loopEndTimeout = null; // Timeout for loop end
    
    // Gain nodes for fade transitions
    this.currentGainNode = null;
    this.nextGainNode = null;
    
    // Progress update interval
    this.progressInterval = null;
    
    // Event bus
    this.eventBus = eventBus;
    this.DAW_EVENTS = DAW_EVENTS;
    
    // Fade duration (micro fade)
    this.fadeDuration = 0.05; // 50ms fade
  }
  
  /**
   * Set the loop duration (from root track)
   */
  setLoopDuration(duration) {
    const previousDuration = this.loopDuration;
    this.loopDuration = duration;
    
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
    if (!track) {
      console.error('No track provided to playTrack');
      return;
    }
    
    // Stop current playback
    this.stop();
    
    // Set loop duration if provided
    if (loopDuration) {
      this.setLoopDuration(loopDuration);
    }
    
    if (!this.loopDuration) {
      console.error('Loop duration not set');
      return;
    }
    
    const previousTrack = this.currentTrack;
    this.currentTrack = track;
    this.isPlaying = true;
    
    // Emit track changed event if track actually changed
    if (previousTrack?.id !== track.id) {
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, {
        track,
        previousTrack
      });
    }
    
    // Resume context if suspended
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    
    // Get or decode buffer
    const buffer = await this.getOrDecodeBuffer(track);
    if (!buffer) {
      console.error('Failed to get buffer for track:', track.id);
      this.isPlaying = false;
      return;
    }
    
    // Emit playback started event
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
      track
    });
    
    // Emit track started event
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_STARTED, {
      track
    });
    
    // Schedule playback
    this.schedulePlayback(buffer, track);
    
    // Pre-decode next track if available (will be handled by context)
    // This is just for the first track - context will handle subsequent tracks
  }
  
  /**
   * Get buffer from cache or decode from S3
   */
  async getOrDecodeBuffer(track) {
    const bufferKey = `${track.id}_loop-listening`;
    
    // Check cache first
    if (bufferRegistry.hasBuffer(bufferKey)) {
      return bufferRegistry.getBuffer(bufferKey);
    }
    
    // Decode from S3
    try {
      const url = track.combined_audio_url || track.audio_url;
      if (!url) {
        console.error('No audio URL for track:', track.id);
        return null;
      }
      
      const buffer = await getAudioBufferFromS3(url, this.context);
      
      // Store in cache
      bufferRegistry.storeBuffer(bufferKey, buffer, {
        name: 'loop-listening',
        trackId: track.id
      });
      
      return buffer;
    } catch (error) {
      console.error('Error decoding buffer:', error);
      return null;
    }
  }
  
  /**
   * Schedule playback of a buffer
   * @param {AudioBuffer} buffer - The audio buffer to play
   * @param {Object} track - The track object
   * @param {number} offset - Optional offset in seconds to start playback from (for seeking)
   */
  schedulePlayback(buffer, track, offset = 0) {
    if (!this.loopDuration) {
      console.error('Loop duration not set');
      return;
    }
    
    // Calculate how much of the buffer to play
    const bufferDuration = buffer.duration;
    const playDuration = Math.min(bufferDuration - offset, this.loopDuration);
    
    // Calculate when to start (aligned to loop duration)
    const now = this.context.currentTime;
    let startTime;
    
    if (this.scheduleStartTime === null) {
      // First track or resuming from pause - start immediately with small delay
      startTime = now + 0.1;
      this.scheduleStartTime = startTime - offset; // Adjust for offset
      // If offset > 0, we're resuming from a paused position, so adjust loopStartTime accordingly
      this.loopStartTime = offset > 0 ? startTime - offset : startTime;
    } else if (offset > 0) {
      // Seeking - calculate startTime and update loopStartTime to match
      startTime = now + 0.1;
      // Update loopStartTime so progress calculation is correct: loopStartTime = startTime - offset
      this.loopStartTime = startTime - offset;
      // Update scheduleStartTime to keep them in sync
      this.scheduleStartTime = this.loopStartTime;
    } else {
      // Calculate next loop boundary
      const elapsed = now - this.scheduleStartTime;
      const loopsElapsed = Math.floor(elapsed / this.loopDuration);
      const nextLoopStart = this.scheduleStartTime + (loopsElapsed + 1) * this.loopDuration;
      startTime = Math.max(now + 0.01, nextLoopStart);
      this.loopStartTime = startTime;
    }
    
    // Stop any currently playing source
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch (e) {
        // Source may already be stopped
      }
      this.currentSource = null;
    }
    
    // Create gain node for fade
    const gainNode = this.context.createGain();
    gainNode.connect(this.context.destination);
    
    // Set initial gain to 0 for fade in
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + this.fadeDuration);
    
    // Create source
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    
    // Schedule playback with offset
    source.start(startTime, offset, playDuration);
    
    // Calculate when the loop should end (always loop duration, not buffer duration)
    const loopEndTime = startTime + this.loopDuration;
    
    // Schedule fade out at loop end (not buffer end)
    gainNode.gain.setValueAtTime(1, loopEndTime - this.fadeDuration);
    gainNode.gain.linearRampToValueAtTime(0, loopEndTime);

    
    // Store source
    this.currentSource = source;
    this.currentGainNode = gainNode;
    this.scheduledSources.add(source);
    
    // Handle source completion (when buffer ends, which may be before loop ends)
    source.onended = () => {
      this.scheduledSources.delete(source);
      // Don't clear currentSource here - it will be cleared when loop ends
    };
    
    // Clear any existing loop end timeout before creating a new one
    if (this.loopEndTimeout) {
      clearTimeout(this.loopEndTimeout);
      this.loopEndTimeout = null;
    }
    
    // Schedule loop end handler (when loop duration completes)
    // Calculate timeout based on scheduled start time, not current time
    const currentTime = this.context.currentTime;
    const timeoutMs = Math.max(0, (loopEndTime - currentTime) * 1000);
    
    const loopEndTimeout = setTimeout(() => {
      // Check if this timeout is still the current one (might have been replaced)
      if (this.loopEndTimeout !== loopEndTimeout) {
        return;
      }
      
      this.scheduledSources.delete(source);
      this.currentSource = null;
      this.currentGainNode = null;
      this.loopEndTimeout = null;
      
      // If in cycle mode, reschedule the same track
      if (this.isCycleMode && this.isPlaying && this.currentTrack) {
        // Get buffer again and reschedule
        this.getOrDecodeBuffer(this.currentTrack).then(buffer => {
          if (buffer && this.isPlaying) {
            this.schedulePlayback(buffer, this.currentTrack);
          }
        });
      } else if (!this.isCycleMode) {
        // Emit track end event
        this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_ENDED, {
          track
        });
      }
    }, timeoutMs);
    
    // Store timeout for cleanup
    this.loopEndTimeout = loopEndTimeout;
    
    // Start progress updates
    this.startProgressUpdates(startTime, playDuration);
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
  
  /**
   * Pause playback
   */
  pause() {
    if (!this.isPlaying) return;
    
    this.isPlaying = false;
    this.stopProgressUpdates();
    
    // Clear loop end timeout
    if (this.loopEndTimeout) {
      clearTimeout(this.loopEndTimeout);
      this.loopEndTimeout = null;
    }
    
    // Stop all scheduled sources
    this.scheduledSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source may already be stopped
      }
    });
    
    this.scheduledSources.clear();
    this.currentSource = null;
    this.currentGainNode = null;
    this.nextSource = null;
    this.nextGainNode = null;
    
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
    if (this.isPlaying || !this.currentTrack) return;
    
    // Resume context
    if (this.context.state === 'suspended') {
      await this.context.resume();
    }
    
    // Get buffer and reschedule from current progress position
    const buffer = await this.getOrDecodeBuffer(this.currentTrack);
    if (buffer) {
      this.isPlaying = true;
      
      // Reset timing state so schedulePlayback can calculate correctly from resume position
      // This is similar to seeking - we're starting fresh from the current progress
      this.scheduleStartTime = null;
      this.loopStartTime = null;
      
      // Emit playback started event
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
        track: this.currentTrack
      });
      
      // Resume from current progress position
      this.schedulePlayback(buffer, this.currentTrack, this.currentProgress);
    }
  }
  
  /**
   * Stop playback
   */
  stop() {
    const wasPlaying = this.isPlaying;
    const stoppedTrack = this.currentTrack;
    
    this.pause();
    this.scheduleStartTime = null;
    this.loopStartTime = null;
    this.currentProgress = 0;
    this.currentTrack = null;
    
    // Clear loop end timeout
    if (this.loopEndTimeout) {
      clearTimeout(this.loopEndTimeout);
      this.loopEndTimeout = null;
    }
    
    // Emit playback stopped event (only if it was actually playing)
    if (wasPlaying) {
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STOPPED, {
        track: stoppedTrack
      });
    }
  }
  
  /**
   * Seek within current loop
   */
  async seek(position) {
    if (!this.currentTrack || !this.loopDuration) {
      return;
    }
    
    // Clamp position to loop duration
    const seekPosition = Math.max(0, Math.min(position, this.loopDuration));
    
    // Store whether we were playing before seeking
    const wasPlaying = this.isPlaying;
    
    // Cancel all sources and timeouts first
    // Clear loop end timeout
    if (this.loopEndTimeout) {
      clearTimeout(this.loopEndTimeout);
      this.loopEndTimeout = null;
    }
    
    // Stop all scheduled sources
    this.scheduledSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Source may already be stopped
      }
    });
    
    // Clear all sources
    this.scheduledSources.clear();
    this.currentSource = null;
    this.currentGainNode = null;
    this.nextSource = null;
    this.nextGainNode = null;
    
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
    this.scheduleStartTime = this.loopStartTime; // Keep them in sync for seeking
    
    // Emit seek event
    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.SEEK, {
      position: seekPosition,
      track: this.currentTrack
    });
    
    // Only schedule playback if we were playing before seeking
    if (wasPlaying) {
      this.isPlaying = true;
      const buffer = await this.getOrDecodeBuffer(this.currentTrack);
      if (buffer) {
        // Schedule playback starting from the seek position offset
        this.schedulePlayback(buffer, this.currentTrack, seekPosition);
      } else {
        console.error('Failed to get buffer for seek');
        this.isPlaying = false;
      }
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
  
  /**
   * Cleanup
   */
  destroy() {
    this.stop();
    this.stopProgressUpdates();
  }
}

export default LoopListeningEngine;

