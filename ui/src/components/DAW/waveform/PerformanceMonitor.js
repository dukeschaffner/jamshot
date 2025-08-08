/**
 * PerformanceMonitor - Tracks rendering performance and provides metrics
 */
export class PerformanceMonitor {
  constructor() {
    this.metrics = {
      renderTimes: [],
      chunkRenders: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryUsage: 0
    };
    this.maxRenderTimes = 100; // Keep last 100 render times
  }

  /**
   * Start timing a render operation
   * @returns {number} Start timestamp
   */
  startRender() {
    return performance.now();
  }

  /**
   * End timing a render operation
   * @param {number} startTime - Start timestamp from startRender()
   */
  endRender(startTime) {
    const renderTime = performance.now() - startTime;
    this.metrics.renderTimes.push(renderTime);
    this.metrics.chunkRenders++;
    
    // Keep only the last N render times
    if (this.metrics.renderTimes.length > this.maxRenderTimes) {
      this.metrics.renderTimes.shift();
    }
  }

  /**
   * Record a cache hit
   */
  recordCacheHit() {
    this.metrics.cacheHits++;
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss() {
    this.metrics.cacheMisses++;
  }

  /**
   * Update memory usage estimate
   * @param {number} bytes - Estimated memory usage in bytes
   */
  updateMemoryUsage(bytes) {
    this.metrics.memoryUsage = bytes;
  }

  /**
   * Get performance statistics
   * @returns {Object} Performance metrics
   */
  getStats() {
    const renderTimes = this.metrics.renderTimes;
    const avgRenderTime = renderTimes.length > 0 
      ? renderTimes.reduce((a, b) => a + b, 0) / renderTimes.length 
      : 0;
    
    const cacheHitRate = this.metrics.cacheHits + this.metrics.cacheMisses > 0
      ? this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)
      : 0;

    return {
      avgRenderTime: avgRenderTime.toFixed(2),
      totalRenders: this.metrics.chunkRenders,
      cacheHitRate: (cacheHitRate * 100).toFixed(1),
      memoryUsage: this.formatBytes(this.metrics.memoryUsage),
      recentRenderTimes: renderTimes.slice(-10)
    };
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Bytes to format
   * @returns {string} Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.metrics = {
      renderTimes: [],
      chunkRenders: 0,
      cacheHits: 0,
      cacheMisses: 0,
      memoryUsage: 0
    };
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor(); 