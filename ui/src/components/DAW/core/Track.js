// ui/src/components/DAW/core/Track.js
import { bufferRegistry } from './BufferRegistry.js';
import { eventBus } from '../EventBus';
import { DAW_EVENTS } from '../DAWEvents';

class Track {
  constructor(id, context, regions = []) {
    this.id = id;
    this.context = context;
    this.regions = regions; // Array of region objects
    this.gainNode = context.createGain();
    this.analyzer = context.createAnalyser();
    this.sources = new Set();
    
    this.gainNode.connect(this.context.destination);
    
    // Calculate total duration from all regions
    this.duration = this.calculateTotalDuration();
  }
  
  // Region structure: { key, startTime, duration, name }
  addRegion(bufferKey, startTime = null, offset = null, endTime = null, name = '') {
    const duration = bufferRegistry.getMetadata(bufferKey)?.duration || 0;
    startTime = startTime || 0;
    offset = offset || 0;
    endTime = endTime || (startTime + duration - offset);
    const region = {
      key: bufferKey,
      offset,
      startTime,
      endTime,
      duration: duration,
      name: name || `Region ${this.regions.length + 1}`
    };
    eventBus.emit(DAW_EVENTS.REGION.ADD, { region });
    this.regions.push(region);

    this.duration = this.calculateTotalDuration();
  }

  updateRegion(region) {
    eventBus.emit(DAW_EVENTS.REGION.UPDATE, { region });
    this.regions = this.regions.map(r => r.id === region.id ? region : r);
  }
  
  calculateTotalDuration() {
    if (this.regions.length === 0) return 0;
    
    return Math.max(
      ...this.regions.map(region => region.startTime + region.duration)
    );
  }
  
  play(startTime, offset = 0) {
    // Play all regions for this track
    this.regions.forEach(region => {
      const buffer = bufferRegistry.getBuffer(region.key);
      if (!buffer) return;
      
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);
      
      // Schedule playback at the correct time
      const playTime = startTime + region.startTime;
      source.start(playTime, offset);
      
      this.sources.add(source);
    });
  }
  
  pause() {
    this.sources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // Source may have already stopped
      }
    });
    this.sources.clear();
  }
  
  // Get all regions for UI display
  getRegions() {
    return this.regions.map(region => ({
      ...region,
      metadata: bufferRegistry.getMetadata(region.key)
    }));
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
  
  destroy() {
    this.pause();
    if (this.gainNode) {
      this.gainNode.disconnect();
    }
    if (this.analyzer) {
      this.analyzer.disconnect();
    }
  }
}

export default Track;