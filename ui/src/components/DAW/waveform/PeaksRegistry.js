/**
 * PeakCalculator - Analyzes AudioBuffer data and calculates peaks at different resolutions
 * for efficient waveform rendering and zoom functionality.
 * Optimized for files up to 10 minutes in length.
 */
export class PeaksRegistry {
  constructor() {
    this.peaksCache = new Map(); // cacheKey -> peaks array
    this.maxCacheSize = 50; // Maximum number of cached peak sets
  }

  /**
   * Calculate peaks for an AudioBuffer at a specific resolution
   * @param {AudioBuffer} audioBuffer - The audio buffer to analyze
   * @param {number} samplesPerPixel - Number of samples to average per pixel
   * @returns {Array} Array of peak data [min, max] for each pixel
   */
  calculatePeaks(audioBuffer, bufferKey, samplesPerPixel) {
    const cacheKey = this.generateCacheKey(bufferKey, samplesPerPixel);
    
    // Check cache first
    if (this.peaksCache.has(cacheKey)) {
      return this.peaksCache.get(cacheKey);
    }

    const channelData = audioBuffer.getChannelData(0); // Use first channel
    const bufferLength = audioBuffer.length;
    
    // Calculate number of pixels needed for entire file
    const numPixels = Math.ceil(bufferLength / samplesPerPixel);
    
    const peaks = new Array(numPixels);
    
    for (let pixelIndex = 0; pixelIndex < numPixels; pixelIndex++) {
      const start = pixelIndex * samplesPerPixel;
      const end = Math.min(start + samplesPerPixel, bufferLength);
      
      let min = 1;
      let max = -1;
      
      // Find min/max values for this pixel range
      for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
        const sample = channelData[sampleIndex];
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
      
      peaks[pixelIndex] = [min, max];
    }
    
    // Cache the result
    this.cachePeaks(cacheKey, peaks);
    
    return peaks;
  }

  /**
   * Calculate peaks for multiple zoom levels
   * @param {AudioBuffer} audioBuffer - The audio buffer to analyze
   * @param {Array} zoomLevels - Array of samples per pixel values
   * @returns {Object} Object with zoom levels as keys and peak arrays as values
   */
  calculateMultiResolutionPeaks(audioBuffer, zoomLevels = [1, 10, 100, 1000]) {
    const multiResPeaks = {};
    
    for (const samplesPerPixel of zoomLevels) {
      multiResPeaks[samplesPerPixel] = this.calculatePeaks(audioBuffer, samplesPerPixel);
    }
    
    return multiResPeaks;
  }

  /**
   * Get the best zoom level for a given viewport width and audio duration
   * @param {number} secondsPerPixel - Seconds per pixel
   * @param {number} sampleRate - Audio sample rate
   * @returns {number} Optimal samples per pixel
   */
  getOptimalZoomLevel(secondsPerPixel, sampleRate) {
    const samplesPerPixel = secondsPerPixel * sampleRate;
    
    // Round to nearest power of 2 for consistency
    return Math.pow(2, Math.round(Math.log2(samplesPerPixel)));
  }

  /**
   * Generate a cache key for peak data
   * @param {string} bufferKey - The key of the audio buffer
   * @param {number} samplesPerPixel - Samples per pixel
   * @returns {string} Cache key
   */
  generateCacheKey(bufferKey, samplesPerPixel) {
    return `${bufferKey}_${samplesPerPixel}`;
  }

  /**
   * Cache peak data with LRU eviction
   * @param {string} key - Cache key
   * @param {Array} peaks - Peak data to cache
   */
  cachePeaks(key, peaks) {
    // Implement LRU eviction if cache is full
    if (this.peaksCache.size >= this.maxCacheSize) {
      const firstKey = this.peaksCache.keys().next().value;
      this.peaksCache.delete(firstKey);
    }
    
    this.peaksCache.set(key, peaks);
  }

  /**
   * Clear the peak cache
   */
  clearCache() {
    this.peaksCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.peaksCache.size,
      maxSize: this.maxCacheSize
    };
  }
}

// Export singleton instance
export const peaksRegistry = new PeaksRegistry(); 