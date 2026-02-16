/**
 * LoopListeningEngine - Web Audio API engine for sample-accurate loop playback
 * Handles buffer scheduling, fade transitions, and precise timing
 */

import { bufferRegistry } from '../../components/DAW/core/BufferRegistry.js';
import { getAudioBufferFromS3 } from '../../components/DAW/misc/DAWUtils.js';

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
    
    // Callbacks
    this.onTrackEnd = null;
    this.onProgressUpdate = null;
    
    // Fade duration (micro fade)
    this.fadeDuration = 0.05; // 50ms fade
  }
  
  /**
   * Set the loop duration (from root track)
   */
  setLoopDuration(duration) {
    this.loopDuration = duration;
  }
  
  /**
   * Get the loop duration
   */
  getLoopDuration() {
    return this.loopDuration;
  }
  
  /**
   * Set callbacks
   */
  setCallbacks({ onTrackEnd, onProgressUpdate }) {
    this.onTrackEnd = onTrackEnd;
    this.onProgressUpdate = onProgressUpdate;
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
    
    this.currentTrack = track;
    this.isPlaying = true;
    
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
    
    // Schedule playback
    this.schedulePlayback(buffer, track);
    
    // Pre-decode next track if available (will be handled by context)
    // This is just for the first track - context will handle subsequent tracks
  }
  
  /**
   * Get buffer from cache or decode from S3
   */
  async getOrDecodeBuffer(track) {
    const bufferKey = bufferRegistry.generateBufferKey(track.id, 'loop-listening');
    
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
   */
  schedulePlayback(buffer, track) {
    if (!this.loopDuration) {
      console.error('Loop duration not set');
      return;
    }
    
    // Calculate how much of the buffer to play
    const bufferDuration = buffer.duration;
    const playDuration = Math.min(bufferDuration, this.loopDuration);
    
    // Calculate when to start (aligned to loop duration)
    const now = this.context.currentTime;
    let startTime;
    
    if (this.scheduleStartTime === null) {
      // First track - start immediately with small delay
      startTime = now + 0.1;
      this.scheduleStartTime = startTime;
      this.loopStartTime = startTime;
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
    
    // Schedule playback
    source.start(startTime, 0, playDuration);
    
    // Calculate when the loop should end (always loop duration, not buffer duration)
    const loopEndTime = startTime + this.loopDuration;
    
    // Schedule fade out at loop end (not buffer end)
    gainNode.gain.linearRampToValueAtTime(0, loopEndTime - this.fadeDuration);
    gainNode.gain.setValueAtTime(0, loopEndTime);
    
    // Store source
    this.currentSource = source;
    this.currentGainNode = gainNode;
    this.scheduledSources.add(source);
    
    // Handle source completion (when buffer ends, which may be before loop ends)
    source.onended = () => {
      this.scheduledSources.delete(source);
      // Don't clear currentSource here - it will be cleared when loop ends
    };
    
    // Schedule loop end handler (when loop duration completes)
    // Calculate timeout based on scheduled start time, not current time
    const currentTime = this.context.currentTime;
    const timeoutMs = Math.max(0, (loopEndTime - currentTime) * 1000);
    
    const loopEndTimeout = setTimeout(() => {
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
      } else if (!this.isCycleMode && this.onTrackEnd) {
        // Trigger track end callback
        this.onTrackEnd(track);
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
      
      if (this.onProgressUpdate) {
        this.onProgressUpdate(this.currentProgress);
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
    
    // Get buffer and reschedule
    const buffer = await this.getOrDecodeBuffer(this.currentTrack);
    if (buffer) {
      this.isPlaying = true;
      this.schedulePlayback(buffer, this.currentTrack);
    }
  }
  
  /**
   * Stop playback
   */
  stop() {
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
  }
  
  /**
   * Seek within current loop
   */
  async seek(position) {
    if (!this.currentTrack || !this.loopDuration) return;
    
    // Clamp position to loop duration
    const seekPosition = Math.max(0, Math.min(position, this.loopDuration));
    
    // Stop current playback
    this.pause();
    
    // Reschedule from new position
    this.isPlaying = true;
    const buffer = await this.getOrDecodeBuffer(this.currentTrack);
    if (buffer) {
      // Adjust schedule start time to account for seek
      if (this.scheduleStartTime !== null) {
        const now = this.context.currentTime;
        const elapsed = now - this.scheduleStartTime;
        const loopsElapsed = Math.floor(elapsed / this.loopDuration);
        this.scheduleStartTime = now - (loopsElapsed * this.loopDuration + seekPosition);
        this.loopStartTime = now - seekPosition;
      }
      
      this.schedulePlayback(buffer, this.currentTrack);
    }
  }
  
  /**
   * Enable cycle mode (repeat current track)
   */
  enableCycleMode() {
    this.isCycleMode = true;
  }
  
  /**
   * Disable cycle mode
   */
  disableCycleMode() {
    this.isCycleMode = false;
    // When current track ends, it will trigger onTrackEnd normally
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
    this.onTrackEnd = null;
    this.onProgressUpdate = null;
  }
}

export default LoopListeningEngine;

