// ui/src/components/DAW/core/Track.js
import { bufferRegistry } from './BufferRegistry.js';

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
  addRegion(bufferKey, startTime = 0, name = '') {
    const region = {
      key: bufferKey,
      startTime,
      duration: bufferRegistry.getMetadata(bufferKey)?.duration || 0,
      name: name || `Region ${this.regions.length + 1}`
    };
    
    this.regions.push(region);
    this.duration = this.calculateTotalDuration();
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