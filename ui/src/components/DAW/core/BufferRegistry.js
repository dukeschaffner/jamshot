// ui/src/components/DAW/core/BufferRegistry.js
class BufferRegistry {
    constructor() {
      this.buffers = new Map(); // bufferKey -> AudioBuffer
      this.metadata = new Map(); // bufferKey -> { name, duration, etc }
    }
    
    // Generate unique key for each buffer
    generateBufferKey(trackId, regionIndex, regionName) {
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