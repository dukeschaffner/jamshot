// ui/src/components/DAW/core/Track.js
import { bufferRegistry } from './BufferRegistry.js';
import { eventBus } from '../misc/EventBus.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';
import { audioBufferToWav } from '../../../lib/utils.js';
import AudioState from './AudioStateStore.js';
import { handleRegionOverlaps } from '../misc/DAWUtils.js';
import { COMMAND_TYPES } from './UndoManager.js';

class Track {
  constructor(id, context, regions = [], title = null) {
    this.id = id;
    this.context = context;
    this.regions = regions; // Array of region objects
    this.gainNode = context.createGain();
    this.analyzer = context.createAnalyser();
    this.sources = new Set();
    this.isRecordingTrack = id === 'recording-track';

    this.gain = 0.8;
    this.isSolo = false;
    this.title = title; // Store track title
    
    // Configure analyzer for meter functionality
    this.analyzer.fftSize = 2048;
    this.analyzer.smoothingTimeConstant = 0.8;
    
    // For recording track: create separate meter gain node for always-on input metering
    // This allows input signal to be shown in meter even when monitoring is disabled
    if (id === 'recording-track') {
      this.meterGainNode = context.createGain();
      this.meterGainNode.gain.value = this.gain;
      // Connect meter gain node to analyzer (always active for metering)
      this.meterGainNode.connect(this.analyzer);
      this.gainNode.connect(this.analyzer);
      this.gainNode.connect(this.context.destination);
    }
    else{
      this.gainNode.connect(this.analyzer);
      this.analyzer.connect(this.context.destination);
    }
    
    // Calculate total duration from all regions
    this.duration = this.calculateTotalDuration();

    // Listen for region update events
    this.handleRegionUpdate = this.handleRegionUpdate.bind(this);
    this.handleRegionRemove = this.handleRegionRemove.bind(this);
    eventBus.on(DAW_EVENTS.REGION.UPDATE, this.handleRegionUpdate);
    eventBus.on(DAW_EVENTS.REGION.REMOVE, this.handleRegionRemove);
  }

  handleRegionUpdate(data) {
    // Only update if the region belongs to this track
    if (data.trackId === this.id) {
      this.regions = this.regions.map(r => r.id === data.region.id ? data.region : r);
      console.log('Track - handleRegionUpdate', data);
      // Forward the action metadata if present (for undo/redo)
      eventBus.emit(DAW_EVENTS.REGION.UPDATED, { 
        region: data.region, 
        trackId: this.id,
        ...(data.action && { action: data.action })
      });
    }
  }

  handleRegionRemove(data) {
    if (data.trackId === this.id) {
      // Find the region before removing to capture state for undo
      const regionToRemove = this.regions.find(r => r.id === data.region.id);
      
      this.regions = this.regions.filter(r => r.id !== data.region.id);
      
      // Emit REGION.REMOVED with optional action metadata for undo
      // Skip undo for recording track to avoid undo pollution
      eventBus.emit(DAW_EVENTS.REGION.REMOVED, { 
        region: data.region, 
        trackId: this.id,
        ...(regionToRemove && {
          action: {
            canUndo: true,
            type: COMMAND_TYPES.REGION_REMOVE,
            before: {
              startTime: regionToRemove.startTime,
              endTime: regionToRemove.endTime,
              offset: regionToRemove.offset,
              key: regionToRemove.key,
              duration: regionToRemove.duration,
              active: regionToRemove.active,
              name: regionToRemove.name
            },
            description: 'Delete Region'
          }
        })
      });
    }
  }
  
  // Region structure: { key, startTime, duration, name }
  // @param {boolean} recordUndo - Whether to record this operation for undo (default: false)
  addRegion(bufferKey, startTime = null, offset = null, endTime = null, name = '', overwriteTrack = false, recordUndo = false) {
    const duration = bufferRegistry.getMetadata(bufferKey)?.duration || 0;
    startTime = startTime || 0;
    offset = offset || 0;
    endTime = endTime || (startTime + duration - offset);

    // Only update DAW duration if not a collab
    if(!AudioState.isCollab && endTime > AudioState.dawDuration) {
      AudioState.dawDuration = endTime;
    }

    const id = 'track-' + this.id + '-' + Math.random().toString(36).substring(2, 15);
    const region = {
      key: bufferKey,
      offset,
      startTime,
      endTime,
      duration: duration,
      active: true,
      name: name || `Region ${this.regions.length + 1}`,
      id: id
    };

    if (overwriteTrack) { // Set all regions to inactive
      this.regions.forEach(r => {
        r.active = false;
        eventBus.emit(DAW_EVENTS.REGION.UPDATE, { region: r, trackId: this.id });
      });
    }
    else {
      // Handle overlaps with existing regions before adding the new region
      handleRegionOverlaps(this, null, region.startTime, region.endTime, this.id, eventBus, DAW_EVENTS);
    }
    this.regions.push(region);
    
    // Emit REGION.ADDED with optional action metadata for undo
    eventBus.emit(DAW_EVENTS.REGION.ADDED, { 
      region, 
      trackId: this.id,
      ...(recordUndo && {
        action: {
          canUndo: true,
          type: COMMAND_TYPES.REGION_ADD,
          description: 'Add Region'
        }
      })
    });

    this.duration = this.calculateTotalDuration();
    
    // Return the created region so callers can use it (e.g., for selection)
    return region;
  }

  addRegionFromBuffer(buffer, startTime = null, offset = null, endTime = null, name = '', recordUndo = false) {
    const regionName = name || 'Region';
    const bufferKey = bufferRegistry.generateBufferKey(this.id, regionName);
    bufferRegistry.storeBuffer(bufferKey, buffer);

    this.addRegion(bufferKey, startTime, offset, endTime, regionName, false, recordUndo);
    return bufferKey;
  }
  
  calculateTotalDuration() {
    if (this.regions.length === 0) return 0;
    
    return Math.max(
      ...this.regions.map(region => region.endTime)
    );
  }

  setGain(gain) {
    this.gain = gain;
    this.gainNode.gain.setValueAtTime(gain, this.context.currentTime);
    this.gainNode.gain.linearRampToValueAtTime(gain, this.context.currentTime + 0.05);
    // Sync meter gain node with track gain for recording track
    if (this.meterGainNode) {
      this.meterGainNode.gain.setValueAtTime(gain, this.context.currentTime);
      this.meterGainNode.gain.linearRampToValueAtTime(gain, this.context.currentTime + 0.05);
    }
  }
  
  setSolo(isSolo) {
    this.isSolo = isSolo;
    // The actual solo logic is handled by the AudioEngine
    // which will coordinate between all tracks
  }
  
  // Get all regions for UI display
  getRegions() {
    return this.regions.map(region => ({
      ...region,
      metadata: bufferRegistry.getMetadata(region.key)
    }));
  }

  getActiveRegions() {
    return this.regions.filter(region => region.active);
  }

  /**
   * Get regions formatted for upload, filtering out regions that start after
   * the DAW duration and clamping regions that extend beyond it.
   * @returns {Array} Array of region objects with { startTime, endTime, offset }
   */
  getRegionsForUpload() {
    const activeRegions = this.getActiveRegions();
    const dawDuration = AudioState.dawDuration;
    
    return activeRegions
      .filter(region => {
        // Filter out regions that start after the project end
        return region.startTime < dawDuration;
      })
      .map(region => {
        // Clamp regions that start before project end but end after project end
        const clampedEndTime = Math.min(region.endTime, dawDuration);
        
        return {
          startTime: region.startTime,
          endTime: clampedEndTime,
          offset: region.offset
        };
      });
  }
  
  // Get regions with buffer data for ChunkScheduler
  getActiveRegionsWithBuffers() {
    return this.regions.map(region => {
      const buffer = bufferRegistry.getBuffer(region.key);
      return {
        ...region,
        buffer,
        gain: this.gain
      };
    }).filter(region => region.buffer && region.active); // Only return regions with valid buffers
  }
  
  // Get a specific region
  getRegion(index) {
    const region = this.regions[index];
    if (!region) return null;
    
    return {
      ...region,
      metadata: bufferRegistry.getMetadata(region.key)
    };
  }

  // Get analyzer node for meter functionality
  getAnalyzer() {
    return this.analyzer;
  }

  // Get meter gain node for recording track (used for always-on input metering)
  getMeterGainNode() {
    return this.meterGainNode || null;
  }

  hasSilenceAtStart() {
    const activeRegions = this.getActiveRegions();
    const earliestStartTime = Math.min(...activeRegions.map(region => region.startTime));
    return earliestStartTime > 0;
  }

  hasSilenceAtEnd() {
    const activeRegions = this.getActiveRegions();
    const latestEndTime = Math.max(...activeRegions.map(region => region.endTime));
    return latestEndTime < AudioState.dawDuration;
  }

  // Combine all active regions into a single buffer, convert to Wav
  exportTrack(trimSilence = false) {
    console.log('Exporting track with trimSilence:', trimSilence);
    // Get all active regions with their buffers
    const activeRegions = this.getActiveRegions();
    
    if (activeRegions.length === 0) {
      return null; // No active regions to export
    }
    
    // Get buffers for all active regions
    const regionsWithBuffers = activeRegions.map(region => {
      const buffer = bufferRegistry.getBuffer(region.key);
      return {
        ...region,
        buffer
      };
    }).filter(region => region.buffer); // Only include regions with valid buffers
    
    if (regionsWithBuffers.length === 0) {
      return null; // No valid buffers found
    }
    
    // Get sample rate and channel count from first buffer (assuming all are the same)
    const firstBuffer = regionsWithBuffers[0].buffer;
    const sampleRate = firstBuffer.sampleRate;
    const numberOfChannels = firstBuffer.numberOfChannels;
    
    // Calculate duration based on trimSilence setting
    let exportDuration = AudioState.dawDuration;
    let startOffset = 0;
    
    if (trimSilence) {
      // Find the latest end time of active regions
      const endTimes = regionsWithBuffers.map(region => region.endTime);
      const latestEnd = Math.max(...endTimes);
      
      // Only trim silence at end when applicable (if there's silence at the end)
      if (this.hasSilenceAtEnd()) {
        exportDuration = latestEnd;
      } else {
        exportDuration = Math.max(0, AudioState.dawDuration - (1 / sampleRate));
      }
      // Don't trim silence at start - always start from 0
      startOffset = 0;
    } 
    else{
      exportDuration = Math.max(0, AudioState.dawDuration - (1 / sampleRate));
    }
    
    // Create the combined buffer
    const totalLength = Math.ceil(exportDuration * sampleRate);
    const combinedBuffer = this.context.createBuffer(numberOfChannels, totalLength, sampleRate);
    
    // Copy each region's audio data to the correct position
    regionsWithBuffers.forEach(region => {
      const { buffer, startTime, offset, endTime } = region;
      
      // Calculate the actual audio data to copy
      const startSample = Math.floor(offset * sampleRate);
      const endSample = Math.floor((endTime - startTime) * sampleRate);
      const copyLength = Math.min(endSample, buffer.length - startSample);
      
      if (copyLength <= 0) return; // Skip invalid regions
      
      // Calculate destination position in the combined buffer
      // Adjust for startOffset when trimming empty space
      const destStartSample = Math.floor((startTime - startOffset) * sampleRate);
      
      // Copy audio data for each channel
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sourceChannelData = buffer.getChannelData(channel);
        const destChannelData = combinedBuffer.getChannelData(channel);
        
        // Copy the audio data with proper offset and timing
        for (let i = 0; i < copyLength; i++) {
          const sourceIndex = startSample + i;
          const destIndex = destStartSample + i;
          
          if (sourceIndex < sourceChannelData.length && destIndex < destChannelData.length && destIndex >= 0) {
            destChannelData[destIndex] += sourceChannelData[sourceIndex];
          }
        }
      }
    });
    
    // Convert the combined buffer to WAV format
    const wavArrayBuffer = audioBufferToWav(combinedBuffer, sampleRate);
    
    return wavArrayBuffer;
  }
  
  destroy() {
    //this.pause();
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.meterGainNode) {
      this.meterGainNode.disconnect();
    }
    if (this.analyzer) {
      this.analyzer.disconnect();
    }
    // Remove event listener
    eventBus.off(DAW_EVENTS.REGION.UPDATE, this.handleRegionUpdate);
    eventBus.off(DAW_EVENTS.REGION.REMOVE, this.handleRegionRemove);
  }
}

export default Track;