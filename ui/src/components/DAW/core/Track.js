// ui/src/components/DAW/core/Track.js
import { bufferRegistry } from './BufferRegistry.js';
import { eventBus } from '../misc/EventBus.js';
import { DAW_EVENTS } from '../misc/DAWEvents.js';

class Track {
  constructor(id, context, regions = []) {
    this.id = id;
    this.context = context;
    this.regions = regions; // Array of region objects
    this.gainNode = context.createGain();
    this.analyzer = context.createAnalyser();
    this.sources = new Set();
    this.readonly = id != 'recording-track';

    this.gain = 0.8;
    this.isSolo = false;
    
    // Configure analyzer for meter functionality
    this.analyzer.fftSize = 2048;
    this.analyzer.smoothingTimeConstant = 0.8;
    
    // Connect gain node to analyzer, then analyzer to destination
    this.gainNode.connect(this.analyzer);
    this.analyzer.connect(this.context.destination);
    
    // Calculate total duration from all regions
    this.duration = this.calculateTotalDuration();

    // Listen for region update events
    this.handleRegionUpdate = this.handleRegionUpdate.bind(this);
    eventBus.on(DAW_EVENTS.REGION.UPDATE, this.handleRegionUpdate);
  }

  handleRegionUpdate(data) {
    // Only update if the region belongs to this track
    if (data.trackId === this.id) {
      this.regions = this.regions.map(r => r.id === data.region.id ? data.region : r);
    }
  }
  
  // Region structure: { key, startTime, duration, name }
  addRegion(bufferKey, startTime = null, offset = null, endTime = null, name = '', overwriteTrack = false) {
    const duration = bufferRegistry.getMetadata(bufferKey)?.duration || 0;
    startTime = startTime || 0;
    offset = offset || 0;
    endTime = endTime || (startTime + duration - offset);

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
    eventBus.emit(DAW_EVENTS.REGION.ADD, { region, trackId: this.id });
    this.regions.push(region);

    this.duration = this.calculateTotalDuration();
  }

  addRegionFromBuffer(buffer, startTime = null, offset = null, endTime = null, name = '') {
    const regionName = name || 'Region';
    const bufferKey = bufferRegistry.generateBufferKey(this.id, regionName);
    bufferRegistry.storeBuffer(bufferKey, buffer);

    this.addRegion(bufferKey, startTime, offset, endTime, regionName);
    return bufferKey;
  }
  
  calculateTotalDuration() {
    if (this.regions.length === 0) return 0;
    
    return Math.max(
      ...this.regions.map(region => region.startTime + region.duration)
    );
  }

  setGain(gain) {
    this.gain = gain;
    this.gainNode.gain.setValueAtTime(gain, this.context.currentTime);
    this.gainNode.gain.linearRampToValueAtTime(gain, this.context.currentTime + 0.05);
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
  
  destroy() {
    this.pause();
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.analyzer) {
      this.analyzer.disconnect();
    }
    // Remove event listener
    eventBus.off(DAW_EVENTS.REGION.UPDATE, this.handleRegionUpdate);
  }
}

export default Track;