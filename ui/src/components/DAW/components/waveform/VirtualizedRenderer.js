/**
 * VirtualizedRenderer - Manages efficient rendering of waveform chunks
 * with offscreen canvas support and memory optimization
 */
export class VirtualizedRenderer {
  constructor(options = {}) {
    this.chunkWidth = options.chunkWidth || 256;
    this.bufferSize = options.bufferSize || 2; // Extra chunks to render beyond viewport
    this.maxCachedChunks = options.maxCachedChunks || 20;
    this.offscreenSupported = typeof OffscreenCanvas !== 'undefined';
    this.cachedChunks = new Map(); // chunkId -> { canvas, offscreenCanvas, lastUsed }
    
    // Import performance monitor
    this.performanceMonitor = null;
    try {
      const { performanceMonitor } = require('./PerformanceMonitor');
      this.performanceMonitor = performanceMonitor;
    } catch (e) {
      // Performance monitor not available
    }
  }

  /**
   * Calculate which chunks should be visible based on scroll position
   * @param {number} scrollLeft - Current scroll position
   * @param {number} viewportWidth - Width of the viewport
   * @param {number} totalWidth - Total width of the waveform
   * @returns {Set} Set of chunk IDs that should be visible
   */
  calculateVisibleChunks(scrollLeft, viewportWidth, totalWidth) {
    const visible = new Set();
    const startChunk = Math.floor(scrollLeft / this.chunkWidth);
    const endChunk = Math.ceil((scrollLeft + viewportWidth) / this.chunkWidth);
    
    // Add buffer chunks for smooth scrolling
    const bufferStart = Math.max(0, startChunk - this.bufferSize);
    const bufferEnd = Math.min(Math.ceil(totalWidth / this.chunkWidth), endChunk + this.bufferSize);
    
    for (let i = bufferStart; i < bufferEnd; i++) {
      visible.add(i);
    }
    
    return visible;
  }

  /**
   * Render a chunk to canvas
   * @param {Object} chunk - Chunk data with peaks
   * @param {number} height - Canvas height
   * @param {boolean} useOffscreen - Whether to use offscreen canvas
   * @returns {HTMLCanvasElement} Rendered canvas
   */
  renderChunk(chunk, height, useOffscreen = true) {
    const startTime = this.performanceMonitor?.startRender();
    
    const canvas = document.createElement('canvas');
    canvas.width = chunk.peaks.length;
    canvas.height = height;
    
    const ctx = canvas.getContext('2d');
    
    let result;
    if (useOffscreen && this.offscreenSupported) {
      result = this.renderWithOffscreen(chunk, height);
    } else {
      this.renderToCanvas(ctx, chunk.peaks, chunk.peaks.length, height);
      result = canvas;
    }
    
    if (this.performanceMonitor && startTime) {
      this.performanceMonitor.endRender(startTime);
    }
    
    return result;
  }

  /**
   * Render chunk using offscreen canvas for better performance
   * @param {Object} chunk - Chunk data
   * @param {number} height - Canvas height
   * @returns {HTMLCanvasElement} Rendered canvas
   */
  renderWithOffscreen(chunk, height) {
    const offscreenCanvas = new OffscreenCanvas(chunk.peaks.length, height);
    const offscreenCtx = offscreenCanvas.getContext('2d');
    
    this.renderToCanvas(offscreenCtx, chunk.peaks, chunk.peaks.length, height);
    
    // Transfer to regular canvas
    const canvas = document.createElement('canvas');
    canvas.width = chunk.peaks.length;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    
    const imageBitmap = offscreenCanvas.transferToImageBitmap();
    ctx.drawImage(imageBitmap, 0, 0);
    
    return canvas;
  }

  /**
   * Render waveform data to canvas context
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Array} peaks - Peak data array
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   */
  renderToCanvas(ctx, peaks, width, height) {
    const centerY = height / 2;
    const scaleY = height / 2;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Set drawing style
    ctx.strokeStyle = '#4a90e2';
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    
    // Draw waveform
    ctx.beginPath();
    
    for (let i = 0; i < peaks.length; i++) {
      const [min, max] = peaks[i];
      const x = i;
      const y1 = centerY + (min * scaleY);
      const y2 = centerY + (max * scaleY);
      
      // Draw vertical line for this sample
      ctx.moveTo(x, y1);
      ctx.lineTo(x, y2);
    }
    
    ctx.stroke();
  }

  /**
   * Get or create cached chunk
   * @param {number} chunkId - Chunk ID
   * @param {Object} chunk - Chunk data
   * @param {number} height - Canvas height
   * @returns {HTMLCanvasElement} Cached canvas
   */
  getCachedChunk(chunkId, chunk, height) {
    const cached = this.cachedChunks.get(chunkId);
    
    if (cached) {
      cached.lastUsed = Date.now();
      if (this.performanceMonitor) {
        this.performanceMonitor.recordCacheHit();
      }
      return cached.canvas;
    }
    
    if (this.performanceMonitor) {
      this.performanceMonitor.recordCacheMiss();
    }
    
    // Cleanup old cached chunks if we're at the limit
    this.cleanupCache();
    
    // Render new chunk
    const canvas = this.renderChunk(chunk, height, this.offscreenSupported);
    
    this.cachedChunks.set(chunkId, {
      canvas,
      lastUsed: Date.now()
    });
    
    // Update memory usage estimate
    if (this.performanceMonitor) {
      const estimatedMemory = this.cachedChunks.size * chunk.peaks.length * height * 4; // 4 bytes per pixel
      this.performanceMonitor.updateMemoryUsage(estimatedMemory);
    }
    
    return canvas;
  }

  /**
   * Cleanup old cached chunks to prevent memory leaks
   */
  cleanupCache() {
    if (this.cachedChunks.size < this.maxCachedChunks) return;
    
    // Sort by last used time and remove oldest
    const entries = Array.from(this.cachedChunks.entries());
    entries.sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    
    const toRemove = entries.slice(0, Math.floor(this.maxCachedChunks / 2));
    
    toRemove.forEach(([chunkId]) => {
      this.cachedChunks.delete(chunkId);
    });
  }

  /**
   * Clear all cached chunks
   */
  clearCache() {
    this.cachedChunks.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.cachedChunks.size,
      maxSize: this.maxCachedChunks,
      offscreenSupported: this.offscreenSupported
    };
  }
}

// Export singleton instance
export const virtualizedRenderer = new VirtualizedRenderer(); 