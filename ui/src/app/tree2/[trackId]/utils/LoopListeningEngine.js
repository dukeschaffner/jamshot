/**
 * LoopListeningEngine - Web Audio API engine for sample-accurate loop playback
 * Handles buffer scheduling, fade transitions, and precise timing
 */

import { bufferRegistry } from '../../../../components/DAW/core/BufferRegistry.js';
import { getAudioBufferFromS3 } from '../../../../components/DAW/misc/DAWUtils.js';
import { eventBus } from '../../../../components/DAW/misc/EventBus.js';
import { DAW_EVENTS } from '../../../../components/DAW/misc/DAWEvents.js';

const SCHEDULE_NEXT_TRACK_THRESHOLD = 0.5;

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
    
    // Set initial next track
    this.nextTrack = await this.getNextTrack();
    
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
    
    // Schedule playback
    const result = await this.play();
    if(result) {
      // Emit playback started event
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
        track
      });
      
      // Emit track started event
      this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_STARTED, {
        track
      });
    }
    
    // Pre-decode next track if available (will be handled by context)
    // This is just for the first track - context will handle subsequent tracks
  }

  async next() {
    if(!this.nextTrack) return;

    const wasPlaying = this.isPlaying;
    this.pause();

    this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, {
      track: this.nextTrack,
      previousTrack: this.currentTrack
    });

    this.currentTrack = this.nextTrack;
    this.nextTrack = await this.getNextTrack();

    if(wasPlaying) {
      await this.play();
    }
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

  addFades(gainNode, startTime, endTime) {
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(1, startTime + this.fadeDuration);
    gainNode.gain.setValueAtTime(1, endTime - this.fadeDuration);
    gainNode.gain.linearRampToValueAtTime(0, endTime);
  }

  scheduleBuffer(buffer, startTime, offset, playDuration) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);
    this.addFades(this.gainNode, startTime, startTime + playDuration);
    source.start(startTime, offset, playDuration);

    this.scheduledSources.add(source);
    source.onended = () => {
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
    if (!this.loopDuration) {
      console.error('Loop duration not set');
      this.isPlaying = false;
      return false;
    }

    // Get buffer and reschedule from current progress position
    const buffer = await this.getOrDecodeBuffer(this.currentTrack);
    if (buffer) {
      this.isPlaying = true;
    }
    else{
      console.error('Failed to get buffer for track:', this.currentTrack.id);
      this.isPlaying = false;
      return false;
    }
    
    // Calculate how much of the buffer to play
    const bufferDuration = buffer.duration;
    const playDuration = Math.min(bufferDuration - offset, this.loopDuration);
    
    // Calculate when to start (aligned to loop duration)
    const startTime = this.context.currentTime + 0.1;
    this.loopStartTime = startTime - offset;
    
    this.scheduleBuffer(buffer, startTime, offset, playDuration);
    
    // Start progress updates
    this.startProgressUpdates(startTime, playDuration);

    return true;
  }

  scheduleNextTrack() {
    if (!this.isPlaying || !this.currentTrack || this.nextTrackScheduled || this.schedulingNextTrack) return;
    this.schedulingNextTrack = true;

    const track = this.isCycleMode ? this.currentTrack : this.nextTrack;
    if(!track) {
      this.schedulingNextTrack = false;
      return;
    }
    this.getOrDecodeBuffer(track).then(buffer => {
      const startTime = this.loopStartTime + this.loopDuration;
      const bufferDuration = buffer.duration;
      const playDuration = Math.min(bufferDuration, this.loopDuration);
      this.scheduleBuffer(buffer, startTime, 0, playDuration);
      this.nextTrackScheduled = true;
      this.schedulingNextTrack = false;
    }).catch(error => {
      console.error('Error scheduling next track:', error);
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
        this.nextTrackScheduled = false;
        this.loopStartTime = this.loopStartTime + this.loopDuration;

        if(!this.isCycleMode) {

          this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_CHANGED, {
            track: this.nextTrack,
            previousTrack: this.currentTrack
          });

          if(!this.nextTrack) {
            this.pause(); // no next track, so stop playback
          }

          this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.TRACK_ENDED, {
            track: this.currentTrack
          });
          
          this.currentTrack = this.nextTrack;
          // Handle async getNextTrack
          this.getNextTrack().then(track => {
            this.nextTrack = track;
          }).catch(error => {
            console.error('Error getting next track:', error);
            this.nextTrack = null;
          });
        }
      }
      else if(!this.nextTrackScheduled && this.loopDuration - this.currentProgress < SCHEDULE_NEXT_TRACK_THRESHOLD) {
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
    if (!this.isPlaying) return;
    
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
    if (this.isPlaying || !this.currentTrack) return;
    
    // Resume context
    if (this.context.state === 'suspended') {
      await this.context.resume();
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
      if(result) {
        // Emit playback started event
        this.eventBus.emit(this.DAW_EVENTS.LOOP_LISTENING.PLAYBACK_STARTED, {
          track: this.currentTrack
        });
      }
    }
  }
  
  /**
   * Stop playback
   */
  stop() {
    const wasPlaying = this.isPlaying;
    const stoppedTrack = this.currentTrack;
    
    this.pause();
    this.loopStartTime = null;
    this.currentProgress = 0;
    this.currentTrack = null;
    
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
        this.play(seekPosition);
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
    this.stop();
    this.gainNode.disconnect();
    this.gainNode = null;

    if (this.context) {
      this.context.close();
    }
  }
}

export default LoopListeningEngine;

