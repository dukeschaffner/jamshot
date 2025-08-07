// ui/src/components/DAW/core/BufferRegistry.js
class BufferRegistry {
    constructor() {
      this.buffers = new Map(); // bufferKey -> AudioBuffer
      this.metadata = new Map(); // bufferKey -> { name, duration, etc }
    }
    
    // Generate unique key for each buffer
    generateBufferKey(trackId, regionName) {
      // Validate inputs
      if (!trackId || !regionName) {
        throw new Error('trackId and regionName are required');
      }
      
      // get max region index for track. get keys where key starts with trackId
      const trackKeys = Array.from(this.buffers.keys()).filter(key => key.startsWith(trackId));
      
      let regionIndex = 0;
      let maxRegionIndex = 0; // Default to 0 if no existing regions
      
      if (trackKeys.length > 0) {
        const regionIndexes = trackKeys
          .map(key => {
            const parts = key.split('_');
            return parts.length >= 3 ? parseInt(parts[2]) : 0;
          })
          .filter(index => !isNaN(index)); // Filter out NaN values
        
        if (regionIndexes.length > 0) {
          maxRegionIndex = Math.max(...regionIndexes);
        }
        regionIndex = maxRegionIndex + 1;
      }
      
      
      return `${trackId}_region_${regionIndex}_${regionName}`;
    }
    
    // Store a buffer with metadata
    storeBuffer(key, buffer, metadata = {}) {
      this.buffers.set(key, buffer);
      this.metadata.set(key, {
        ...metadata,
        key,
        duration: buffer.duration
      });
    }
    
    // Get buffer by key
    getBuffer(key) {
      return this.buffers.get(key);
    }
    
    // Get metadata by key
    getMetadata(key) {
      return this.metadata.get(key);
    }
    
    // Check if buffer exists
    hasBuffer(key) {
      return this.buffers.has(key);
    }
    
    // Cleanup (for memory management if needed)
    removeBuffer(key) {
      this.buffers.delete(key);
      this.metadata.delete(key);
    }
  }
  
  // Singleton instance
  export const bufferRegistry = new BufferRegistry();