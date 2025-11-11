/**
 * DAW Utilities - Helper functions for audio processing
 */

  // Helper functions
  export const posToTime = (pos, duration) => {
    return (pos / 100) * duration;
  };
  
  export const timeToPos = (time, duration) => {
    return (time / duration) * 100;
  };

/**
 * Fetches an audio buffer from an S3 URL
 * @param {string} url - The S3 URL to fetch audio from
 * @param {AudioContext} audioContext - Web Audio context for decoding
 * @returns {Promise<AudioBuffer>} - Decoded audio buffer
 */
export async function getAudioBufferFromS3(url, audioContext) {
  try {
    // Fetch the audio file from S3
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch audio: ${response.status} ${response.statusText}`);
    }
    
    // Get the audio data as an ArrayBuffer
    const arrayBuffer = await response.arrayBuffer();
    
    // Decode the audio data into an AudioBuffer
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    return audioBuffer;
  } catch (error) {
    console.error('Error fetching audio from S3:', error);
    throw error;
  }
}

/**
 * Fetches multiple audio buffers from S3 URLs
 * @param {string[]} urls - Array of S3 URLs to fetch
 * @param {AudioContext} audioContext - Web Audio context for decoding
 * @returns {Promise<AudioBuffer[]>} - Array of decoded audio buffers
 */
export async function getAudioBuffersFromS3(urls, audioContext) {
  try {
    const promises = urls.map(url => getAudioBufferFromS3(url, audioContext));
    const audioBuffers = await Promise.all(promises);
    return audioBuffers;
  } catch (error) {
    console.error('Error fetching multiple audio buffers:', error);
    throw error;
  }
}

/**
 * Gets file extension from S3 URL
 * @param {string} url - S3 URL
 * @returns {string} - File extension (e.g., 'mp3', 'wav')
 */
export function getFileExtensionFromS3Url(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const extension = pathname.split('.').pop().toLowerCase();
    return extension;
  } catch {
    return null;
  }
}

/**
 * Formats file size for display
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Estimates file size from audio buffer
 * @param {AudioBuffer} audioBuffer - Audio buffer
 * @param {string} format - Audio format ('wav', 'mp3', etc.)
 * @returns {number} - Estimated file size in bytes
 */
export function estimateFileSize(audioBuffer, format = 'wav') {
  const sampleRate = audioBuffer.sampleRate;
  const length = audioBuffer.length;
  const channels = audioBuffer.numberOfChannels;
  
  // Rough estimation based on format
  let bytesPerSample;
  switch (format.toLowerCase()) {
    case 'wav':
      bytesPerSample = 2; // 16-bit
      break;
    case 'mp3':
      // MP3 is compressed, rough estimate
      bytesPerSample = 0.1;
      break;
    default:
      bytesPerSample = 2;
  }
  
  return Math.round(length * channels * bytesPerSample);
}


export function getPlaybackTime(audioContext, startTime, currentTime) {
  return currentTime + (audioContext.currentTime - startTime);
}

/**
 * Snaps a position value to the nearest grid line if within threshold
 * @param {number} value - The position value to snap (percentage)
 * @param {boolean} snapToGridEnabled - Whether snap to grid is enabled
 * @param {number} duration - Duration of the audio/project
 * @param {Array} gridLines - Array of grid line objects with position property
 * @param {number} containerWidth - Width of the tracks container
 * @param {number} snapThreshold - Pixel threshold for snapping
 * @returns {number} - The snapped position or original value
 */
export function snapToGrid(value, snapToGridEnabled, duration, gridLines, containerWidth, snapThreshold) {
  if (snapToGridEnabled && duration && duration > 0) {
    // If grid lines aren't generated yet, return the original value
    if (!gridLines || gridLines.length === 0) {
      return value;
    }

    // Find the closest grid line
    let closestGridLine = value;
    let minDistance = Infinity;

    for (const gridLine of gridLines) {
      const distance = Math.abs(gridLine.position - value);
      if (distance < minDistance) {
        minDistance = distance;
        closestGridLine = gridLine;
      }
    }

    if (minDistance === Infinity) {
      return value;
    }

    const distancePx = minDistance * containerWidth / 100;

    // Only snap if the distance is less than the threshold
    if (distancePx <= snapThreshold) {
      return closestGridLine.position;
    }
  }

  return value;
}