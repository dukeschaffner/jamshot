/**
 * WaveformUtils - Helper functions for waveform operations
 */

/**
 * Convert time in seconds to pixel position
 * @param {number} time - Time in seconds
 * @param {number} samplesPerPixel - Samples per pixel
 * @param {number} sampleRate - Audio sample rate
 * @returns {number} Pixel position
 */
export function timeToPixel(time, samplesPerPixel, sampleRate) {
  const sampleIndex = time * sampleRate;
  return sampleIndex / samplesPerPixel;
}

/**
 * Convert pixel position to time in seconds
 * @param {number} pixel - Pixel position
 * @param {number} samplesPerPixel - Samples per pixel
 * @param {number} sampleRate - Audio sample rate
 * @returns {number} Time in seconds
 */
export function pixelToTime(pixel, samplesPerPixel, sampleRate) {
  const sampleIndex = pixel * samplesPerPixel;
  return sampleIndex / sampleRate;
}

/**
 * Calculate optimal zoom level for a given duration and viewport
 * @param {number} duration - Audio duration in seconds
 * @param {number} viewportWidth - Viewport width in pixels
 * @param {number} sampleRate - Audio sample rate
 * @returns {number} Optimal samples per pixel
 */
export function calculateOptimalZoom(duration, viewportWidth, sampleRate) {
  const totalSamples = duration * sampleRate;
  const samplesPerPixel = totalSamples / viewportWidth;
  
  // Round to nearest power of 2 for consistency
  return Math.pow(2, Math.round(Math.log2(samplesPerPixel)));
}

/**
 * Normalize peak data to a specific range
 * @param {Array} peaks - Array of peak data [min, max]
 * @param {number} targetRange - Target range (default: 1.0)
 * @returns {Array} Normalized peak data
 */
export function normalizePeaks(peaks, targetRange = 1.0) {
  if (!peaks.length) return peaks;
  
  // Find the maximum absolute value
  let maxAbs = 0;
  for (const [min, max] of peaks) {
    maxAbs = Math.max(maxAbs, Math.abs(min), Math.abs(max));
  }
  
  if (maxAbs === 0) return peaks;
  
  // Normalize to target range
  const scale = targetRange / maxAbs;
  return peaks.map(([min, max]) => [min * scale, max * scale]);
}

/**
 * Smooth peak data using a simple moving average
 * @param {Array} peaks - Array of peak data [min, max]
 * @param {number} windowSize - Window size for smoothing
 * @returns {Array} Smoothed peak data
 */
export function smoothPeaks(peaks, windowSize = 3) {
  if (peaks.length < windowSize) return peaks;
  
  const smoothed = [];
  const halfWindow = Math.floor(windowSize / 2);
  
  for (let i = 0; i < peaks.length; i++) {
    let minSum = 0;
    let maxSum = 0;
    let count = 0;
    
    for (let j = Math.max(0, i - halfWindow); j <= Math.min(peaks.length - 1, i + halfWindow); j++) {
      const [min, max] = peaks[j];
      minSum += min;
      maxSum += max;
      count++;
    }
    
    smoothed.push([minSum / count, maxSum / count]);
  }
  
  return smoothed;
}

/**
 * Decimate peak data to reduce resolution
 * @param {Array} peaks - Array of peak data [min, max]
 * @param {number} factor - Decimation factor
 * @returns {Array} Decimated peak data
 */
export function decimatePeaks(peaks, factor) {
  if (factor <= 1) return peaks;
  
  const decimated = [];
  for (let i = 0; i < peaks.length; i += factor) {
    decimated.push(peaks[i]);
  }
  
  return decimated;
}

/**
 * Calculate RMS (Root Mean Square) for a range of samples
 * @param {Float32Array} samples - Audio samples
 * @param {number} start - Start index
 * @param {number} end - End index
 * @returns {number} RMS value
 */
export function calculateRMS(samples, start, end) {
  let sum = 0;
  let count = 0;
  
  for (let i = start; i < end && i < samples.length; i++) {
    sum += samples[i] * samples[i];
    count++;
  }
  
  return count > 0 ? Math.sqrt(sum / count) : 0;
}

/**
 * Calculate peak and RMS for a range of samples
 * @param {Float32Array} samples - Audio samples
 * @param {number} start - Start index
 * @param {number} end - End index
 * @returns {Object} Object with min, max, and rms values
 */
export function calculatePeakAndRMS(samples, start, end) {
  let min = 1;
  let max = -1;
  let sum = 0;
  let count = 0;
  
  for (let i = start; i < end && i < samples.length; i++) {
    const sample = samples[i];
    if (sample < min) min = sample;
    if (sample > max) max = sample;
    sum += sample * sample;
    count++;
  }
  
  const rms = count > 0 ? Math.sqrt(sum / count) : 0;
  
  return { min, max, rms };
}

/**
 * Format time as MM:SS or HH:MM:SS
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time string
 */
export function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
}

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Linear interpolation between two values
 * @param {number} a - First value
 * @param {number} b - Second value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Debounce a function
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

/**
 * Throttle a function
 * @param {Function} func - Function to throttle
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Throttled function
 */
export function throttle(func, delay) {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
} 