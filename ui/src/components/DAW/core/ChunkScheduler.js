// ui/src/components/DAW/core/ChunkScheduler.js
import { eventBus } from '../misc/EventBus.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';
import DAWConfig from '../misc/DAWConfig.js';

class ChunkScheduler {
  constructor(audioContext, trackManager) {
    this.context = audioContext;
    this.trackManager = trackManager;
    this.scheduledSegments = new Map(); // segmentId -> segment info
    this.activeSources = new Set(); // currently playing sources
    this.schedulingInterval = null;
    this.isPlaying = false;

    this.startTime = 0; // audioContext.currentTime that playback started at
    this.currentTime = 0; // last playback time checkpoint

    this.lastScheduledTime = 0;
    
    // Configuration
    this.lookAheadWindow = DAWConfig.segments?.lookAheadWindow || 4.0; // seconds
    this.segmentDuration = DAWConfig.segments?.segmentDuration || 2.0; // seconds
    this.scheduleInterval = DAWConfig.segments?.scheduleInterval || 50; // ms
    this.crossfadeDuration = DAWConfig.segments?.crossfadeDuration || 0.05; // seconds
    this.maxConcurrentSegments = DAWConfig.segments?.maxConcurrentSegments || 50;
    
    // Bind methods
    this.updateScheduling = this.updateScheduling.bind(this);
    this.cleanupCompletedSegments = this.cleanupCompletedSegments.bind(this);
  }
  
  /**
   * Start the chunk scheduler
   */
  start(startTime, currentTime) {
    this.startTime = startTime;
    this.currentTime = currentTime;
    this.lastScheduledTime = 0;
    
    if (this.schedulingInterval) return;
    
    this.isPlaying = true;
    this.schedulingInterval = setInterval(() => {
      if (this.isPlaying) {
        this.updateScheduling();
        this.cleanupCompletedSegments();
      }
    }, this.scheduleInterval);
    
    eventBus.emit(DAW_EVENTS.SEGMENT.SCHEDULER_STARTED);
  }
  
  /**
   * Stop the chunk scheduler
   */
  stop() {
    this.isPlaying = false;
    
    if (this.schedulingInterval) {
      clearInterval(this.schedulingInterval);
      this.schedulingInterval = null;
    }
    
    // Stop all active sources
    this.activeSources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (error) {
        // Source may have already stopped
      }
    });
    this.activeSources.clear();
    this.scheduledSegments.clear();
    
    eventBus.emit(DAW_EVENTS.SEGMENT.SCHEDULER_STOPPED);
  }

  /**
   * Update scheduling for all tracks
   */
  updateScheduling() {
    if (!this.trackManager) return;
    
    // If playback just starting, playbackTime could be negative (playback gets scheduled in the future)
    const playbackTime = this.currentTime + (this.context.currentTime - this.startTime);

    // Check if we need to schedule more segments
    const needToSchedule = this.lastScheduledTime - playbackTime < this.lookAheadWindow;
    if(!needToSchedule) return;

    // Calculate scheduling window
    const windowStart = this.lastScheduledTime > playbackTime ? this.lastScheduledTime : playbackTime;
    const windowEnd = this.lastScheduledTime + this.segmentDuration;

    this.lastScheduledTime = windowEnd;
    
    // Get all tracks from track manager
    const tracks = this.trackManager.getAllTracks();
    
    // Process each track
    tracks.forEach(track => {
      this.processTrackSegments(track, windowStart, windowEnd);
    });
  }
  
  /**
   * Process segments for a specific track
   */
  processTrackSegments(track, windowStart, windowEnd) {
    // Get regions with buffer data from track
    const regions = track.getActiveRegionsWithBuffers();
    
    // Convert regions to segments
    const segments = this.getNextSegmentsForTrack(track.id, regions, windowStart, windowEnd);
    
    // Schedule each segment
    segments.forEach(segment => {
      this.scheduleSegment(segment);
    });
  }
  
  /**
   * Convert regions to segments for scheduling
   */
  getNextSegmentsForTrack(trackId, regions, startTime, endTime) {
    const segments = [];
    
    regions.forEach(region => {
      if (!region.active || !region.buffer) return;

      // If region starts after the end of the scheduling window, skip it
      if(region.startTime > endTime) return;

      // If region ends before the start of the scheduling window, skip it
      if(region.endTime < startTime) return;
      
      // Calculate segment boundaries
      const segmentStartTime = Math.max(region.startTime, startTime);
      const segmentEndTime = Math.min(region.endTime, endTime);
      
      if (segmentStartTime >= segmentEndTime) return;
      
      // Create segment
      const segment = {
        id: `${trackId}-${region.id}-${segmentStartTime}-${segmentEndTime}`,
        trackId,
        regionId: region.id,
        buffer: region.buffer,
        startTime: segmentStartTime,
        endTime: segmentEndTime,
        duration: segmentEndTime - segmentStartTime,
        offset: region.offset + (segmentStartTime - region.startTime),
        playTime: this.startTime + (segmentStartTime - this.currentTime),
        gain: region.gain || 1.0,
        needsCrossfade: this.shouldApplyCrossfade(region, startTime, endTime)
      };
      
      segments.push(segment);
    });
    
    return segments;
  }
  
  /**
   * Schedule a single segment
   */
  scheduleSegment(segment) {
    if (this.scheduledSegments.has(segment.id)) return;
    
    try {
      // Get the track for this segment
      const track = this.trackManager.getTrack(segment.trackId);
      if (!track) {
        throw new Error(`Track ${segment.trackId} not found`);
      }
      
      // Create audio source
      const source = this.context.createBufferSource();
      source.buffer = segment.buffer;
      
      // Connect source through track's signal chain
      source.connect(track.gainNode);
      // Track's gainNode already connects to analyzer -> destination
      
      // Store segment info
      this.scheduledSegments.set(segment.id, {
        ...segment,
        source,
        track,
        scheduled: true
      });
      
      // Schedule playback
      source.start(segment.playTime, segment.offset, segment.duration);
      
      // Add to active sources
      this.activeSources.add(source);
      
      // Handle completion
      source.onended = () => {
        this.handleSegmentComplete(segment.id);
      };
      
      // Apply crossfade if needed
      if (segment.needsCrossfade) {
        this.applyCrossfade(segment);
      }

      console.log('Scheduled segment from: ', segment.startTime, 'to: ', segment.endTime, 'for track: ', segment.trackId);
      
      eventBus.emit(DAW_EVENTS.SEGMENT.SCHEDULED, { segment });
      
    } catch (error) {
      eventBus.emit(DAW_EVENTS.SEGMENT.ERROR, { 
        segment, 
        error: error.message 
      });
    }
  }
  
  /**
   * Determine if crossfade should be applied
   */
  shouldApplyCrossfade(region, startTime, endTime) {
    // Apply crossfade if region starts or ends within the scheduling window
    const regionStart = region.startTime;
    const regionEnd = region.endTime;
    return false;
    return (regionStart > startTime && regionStart < startTime + this.crossfadeDuration) ||
           (regionEnd < endTime && regionEnd > endTime - this.crossfadeDuration);
  }
  
  /**
   * Apply crossfade to a segment
   */
  applyCrossfade(segment) {
    // const segmentInfo = this.scheduledSegments.get(segment.id);
    // if (!segmentInfo) return;
    
    // const { track, startTime, endTime } = segmentInfo;
    // const currentTime = this.context.currentTime;
    
    // // Fade in if segment starts within crossfade window
    // if (startTime > this.currentPlaybackTime && 
    //     startTime < this.currentPlaybackTime + this.crossfadeDuration) {
    //   const fadeInStart = currentTime + (startTime - this.currentPlaybackTime);
    //   const fadeInEnd = fadeInStart + this.crossfadeDuration;
      
    //   track.gainNode.gain.setValueAtTime(0, fadeInStart);
    //   track.gainNode.gain.linearRampToValueAtTime(track.gain, fadeInEnd);
      
    //   eventBus.emit(DAW_EVENTS.REGION.CROSSFADE_START, { 
    //     segment, 
    //     type: 'fadeIn',
    //     startTime: fadeInStart,
    //     endTime: fadeInEnd
    //   });
    // }
    
    // // Fade out if segment ends within crossfade window
    // if (endTime < this.currentPlaybackTime + this.lookAheadWindow && 
    //     endTime > this.currentPlaybackTime + this.lookAheadWindow - this.crossfadeDuration) {
    //   const fadeOutStart = currentTime + (endTime - this.currentPlaybackTime) - this.crossfadeDuration;
    //   const fadeOutEnd = currentTime + (endTime - this.currentPlaybackTime);
      
    //   track.gainNode.gain.setValueAtTime(track.gain, fadeOutStart);
    //   track.gainNode.gain.linearRampToValueAtTime(0, fadeOutEnd);
      
    //   eventBus.emit(DAW_EVENTS.REGION.CROSSFADE_START, { 
    //     segment, 
    //     type: 'fadeOut',
    //     startTime: fadeOutStart,
    //     endTime: fadeOutEnd
    //   });
    // }
  }
  
  
  
  /**
   * Handle real-time region updates
   */
  handleRegionUpdate(trackId, region) {
    // Cancel existing segments for this region
    this.cancelSegmentsInRange(region.startTime, region.endTime);
    
    // New segments will be scheduled in the next update cycle
    eventBus.emit(DAW_EVENTS.REGION.REAL_TIME_UPDATE, { trackId, region });
  }
  

  // #region: Getters
  
  /**
   * Get active segments
   */
  getActiveSegments() {
    return Array.from(this.scheduledSegments.values());
  }
  
  /**
   * Get segments for a specific track
   */
  getTrackSegments(trackId) {
    return Array.from(this.scheduledSegments.values())
      .filter(segment => segment.trackId === trackId);
  }
  
  /**
   * Get scheduling statistics
   */
  getStats() {
    return {
      activeSegments: this.scheduledSegments.size,
      activeSources: this.activeSources.size,
      isPlaying: this.isPlaying,
      currentPlaybackTime: this.currentPlaybackTime,
      lookAheadWindow: this.lookAheadWindow
    };
  }

  // #endregion
  
  // #region: Cleanup/Destruction

  /**
   * Handle segment completion
   */
  handleSegmentComplete(segmentId) {
    const segmentInfo = this.scheduledSegments.get(segmentId);
    if (!segmentInfo) return;
    
    // Remove from active sources
    this.activeSources.delete(segmentInfo.source);
    
    // Clean up audio nodes
    try {
      segmentInfo.source.disconnect();
    } catch (error) {
      // Nodes may have already been disconnected
    }
    
    // Remove from scheduled segments
    this.scheduledSegments.delete(segmentId);
    
    eventBus.emit(DAW_EVENTS.SEGMENT.COMPLETED, { segment: segmentInfo });
  }
  
  /**
   * Clean up completed segments
   */
  cleanupCompletedSegments() {
    const currentTime = this.context.currentTime;
    const completedSegments = [];
    
    this.scheduledSegments.forEach((segmentInfo, segmentId) => {
      if (segmentInfo.playTime + segmentInfo.duration < currentTime) {
        completedSegments.push(segmentId);
      }
    });
    
    completedSegments.forEach(segmentId => {
      this.handleSegmentComplete(segmentId);
    });
  }
  
  /**
   * Cancel segments in a time range
   */
  cancelSegmentsInRange(startTime, endTime) {
    const segmentsToCancel = [];
    
    this.scheduledSegments.forEach((segmentInfo, segmentId) => {
      if (segmentInfo.startTime < endTime && segmentInfo.endTime > startTime) {
        segmentsToCancel.push(segmentId);
      }
    });
    
    segmentsToCancel.forEach(segmentId => {
      this.cancelSegment(segmentId);
    });
  }
  
  /**
   * Cancel segments for a specific track
   */
  cancelTrackSegments(trackId) {
    const segmentsToCancel = [];
    
    this.scheduledSegments.forEach((segmentInfo, segmentId) => {
      if (segmentInfo.trackId === trackId) {
        segmentsToCancel.push(segmentId);
      }
    });
    
    segmentsToCancel.forEach(segmentId => {
      this.cancelSegment(segmentId);
    });
  }

    /**
     * Cancel a specific segment
     */
    cancelSegment(segmentId) {
        const segmentInfo = this.scheduledSegments.get(segmentId);
        if (!segmentInfo) return;
        
        try {
            segmentInfo.source.stop();
            segmentInfo.source.disconnect();
        } catch (error) {
            // Source may have already stopped
        }
        
        this.activeSources.delete(segmentInfo.source);
        this.scheduledSegments.delete(segmentId);
        
        eventBus.emit(DAW_EVENTS.SEGMENT.CANCELLED, { segment: segmentInfo });
    }

  /**
   * Cleanup and destroy
   */
  destroy() {
    this.stop();
    
    // Clear all references
    this.scheduledSegments.clear();
    this.activeSources.clear();
    
    eventBus.emit(DAW_EVENTS.SEGMENT.SCHEDULER_DESTROYED);
  }

  // #endregion
}

export default ChunkScheduler; 