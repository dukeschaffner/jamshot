/**
 * WaveformRenderer - Handles canvas-based rendering of waveform data
 * with efficient updates, zoom support, and playhead positioning.
 */
export class WaveformRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    
    // Configuration
    this.waveColor = options.waveColor || '#93e9be';
    this.progressColor = options.progressColor || '#007acc';
    this.cursorColor = options.cursorColor || '#ff6b6b';
    this.backgroundColor = options.backgroundColor || 'transparent';
    this.height = options.height || 100;
    
    // State
    this.isReady = false;
    this.currentPeaks = [];
    this.currentZoom = 1;
    this.currentOffset = 0;
    this.playheadPosition = 0;
    this.isPlaying = false;
    
    // Performance optimization
    this.lastRenderTime = 0;
    this.renderThrottle = 16; // ~60fps
    
    // Initialize canvas
    this.initializeCanvas();
  }

  /**
   * Initialize canvas with proper settings
   */
  initializeCanvas() {
    // Set canvas size
    this.canvas.width = this.canvas.offsetWidth;
    this.canvas.height = this.height;
    
    // Enable high DPI support
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.offsetWidth * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
    
    // Set canvas style dimensions
    this.canvas.style.width = this.canvas.offsetWidth + 'px';
    this.canvas.style.height = this.height + 'px';
    
    // Configure context for better performance
    this.ctx.imageSmoothingEnabled = false;
  }

  /**
   * Set waveform data and trigger render
   * @param {Array} peaks - Array of peak data [min, max] for each pixel
   * @param {number} zoom - Current zoom level (samples per pixel)
   * @param {number} offset - Horizontal offset in pixels
   */
  setWaveformData(peaks, zoom = 1, offset = 0) {
    this.currentPeaks = peaks;
    this.currentZoom = zoom;
    this.currentOffset = offset;
    this.isReady = true;
    
    this.render();
  }

  /**
   * Update playhead position
   * @param {number} position - Playhead position as percentage (0-1)
   */
  updatePlayhead(position) {
    this.playheadPosition = Math.max(0, Math.min(1, position));
    this.renderPlayhead();
  }

  /**
   * Set playing state
   * @param {boolean} isPlaying - Whether audio is currently playing
   */
  setPlayingState(isPlaying) {
    this.isPlaying = isPlaying;
    if (isPlaying) {
      this.startPlayheadAnimation();
    } else {
      this.stopPlayheadAnimation();
    }
  }

  /**
   * Main render function
   */
  render() {
    const now = performance.now();
    if (now - this.lastRenderTime < this.renderThrottle) {
      return;
    }
    
    this.lastRenderTime = now;
    
    // Clear canvas
    this.clearCanvas();
    
    if (!this.isReady || !this.currentPeaks.length) {
      return;
    }
    
    // Draw waveform
    this.drawWaveform();
    
    // Draw playhead
    this.drawPlayhead();
  }

  /**
   * Clear the canvas
   */
  clearCanvas() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Draw the waveform
   */
  drawWaveform() {
    const { width, height } = this.canvas;
    const centerY = height / 2;
    const halfHeight = height / 2;
    
    this.ctx.strokeStyle = this.waveColor;
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    
    // Draw waveform line
    for (let i = 0; i < this.currentPeaks.length; i++) {
      const x = i - this.currentOffset;
      
      if (x < 0 || x >= width) continue;
      
      const [min, max] = this.currentPeaks[i];
      
      // Scale peaks to canvas height
      const scaledMin = centerY + (min * halfHeight);
      const scaledMax = centerY + (max * halfHeight);
      
      // Draw vertical line for this sample
      this.ctx.moveTo(x, scaledMin);
      this.ctx.lineTo(x, scaledMax);
    }
    
    this.ctx.stroke();
  }

  /**
   * Draw the playhead
   */
  drawPlayhead() {
    if (this.playheadPosition <= 0) return;
    
    const { width, height } = this.canvas;
    const x = this.playheadPosition * width;
    
    this.ctx.strokeStyle = this.cursorColor;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(x, 0);
    this.ctx.lineTo(x, height);
    this.ctx.stroke();
  }

  /**
   * Render only the playhead (for performance during playback)
   */
  renderPlayhead() {
    if (!this.isReady) return;
    
    // Clear only the playhead area and redraw
    const { width, height } = this.canvas;
    const playheadWidth = 4; // Account for line width
    
    this.ctx.clearRect(0, 0, width, height);
    this.drawWaveform();
    this.drawPlayhead();
  }

  /**
   * Start playhead animation during playback
   */
  startPlayheadAnimation() {
    if (this.animationFrame) return;
    
    const animate = () => {
      if (this.isPlaying) {
        this.renderPlayhead();
        this.animationFrame = requestAnimationFrame(animate);
      }
    };
    
    this.animationFrame = requestAnimationFrame(animate);
  }

  /**
   * Stop playhead animation
   */
  stopPlayheadAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  /**
   * Handle window resize
   */
  handleResize() {
    this.initializeCanvas();
    this.render();
  }

  /**
   * Get click position as percentage
   * @param {number} clientX - Mouse X position
   * @returns {number} Position as percentage (0-1)
   */
  getClickPosition(clientX) {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / rect.width));
  }

  /**
   * Set colors
   * @param {Object} colors - Color configuration
   */
  setColors(colors) {
    if (colors.waveColor) this.waveColor = colors.waveColor;
    if (colors.progressColor) this.progressColor = colors.progressColor;
    if (colors.cursorColor) this.cursorColor = colors.cursorColor;
    if (colors.backgroundColor) this.backgroundColor = colors.backgroundColor;
    
    this.render();
  }

  /**
   * Set height
   * @param {number} height - New height in pixels
   */
  setHeight(height) {
    this.height = height;
    this.initializeCanvas();
    this.render();
  }

  /**
   * Destroy the renderer and clean up
   */
  destroy() {
    this.stopPlayheadAnimation();
    this.isReady = false;
    this.currentPeaks = [];
  }

  /**
   * Get renderer state
   * @returns {Object} Current renderer state
   */
  getState() {
    return {
      isReady: this.isReady,
      currentZoom: this.currentZoom,
      currentOffset: this.currentOffset,
      playheadPosition: this.playheadPosition,
      isPlaying: this.isPlaying,
      peakCount: this.currentPeaks.length
    };
  }
} 