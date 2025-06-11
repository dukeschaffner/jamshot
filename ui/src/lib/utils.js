/**
 * Format seconds into MM:SS format
 * @param {number} seconds - Duration in seconds
 * @param {number} precision - Precision of the duration (0-2) 0 is seconds, 1 is tenths, 2 is hundredths
 * @returns {string} Formatted duration string
 */
export function formatDuration(seconds, precision = 0) {
  if (!seconds && seconds !== 0) return '0:00';
  
  if(precision === 0){
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  else if(precision === 1){
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const tenths = Math.floor(remainingSeconds * 10) % 10;
    return `${minutes}:${Math.floor(remainingSeconds)}.${tenths}`;
  }
    
}

/**
 * Format a date to a readable string
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
export function formatDate(dateString) {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Convert percentage position to time in seconds
 * @param {number} position - Position as percentage (0-100)
 * @param {number} duration - Total duration in seconds
 * @returns {number} Time in seconds
 */
export function posToTime(position, duration) {
  return (position / 100) * duration;
}

/**
 * Convert time in seconds to percentage position
 * @param {number} time - Time in seconds
 * @param {number} duration - Total duration in seconds
 * @returns {number} Position as percentage (0-100)
 */
export function timeToPos(time, duration) {
  return (time / duration) * 100;
} 

// Render waveform for audio buffer
export function renderWaveform(buffer, canvasRef, cropStart, cropEnd, zoom = 1){
  if (!buffer || !canvasRef.current) return;
  
  const canvas = canvasRef.current;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  // Clear canvas
  ctx.clearRect(0, 0, width, height);
  
  // Set up drawing
  ctx.strokeStyle = 'var(--seafoam)';
  ctx.lineWidth = 2;
  
  // Get audio data
  const channelData = buffer.getChannelData(0);
  
  // Calculate crop indices if cropStart and cropEnd are provided
  let startSampleIndex = 0;
  let endSampleIndex = channelData.length - 1;
  
  if (cropStart !== undefined && cropStart !== null) {
    startSampleIndex = Math.floor(cropStart * buffer.sampleRate);
    startSampleIndex = Math.max(0, startSampleIndex); // Ensure it's not negative
  }
  
  if (cropEnd !== undefined && cropEnd !== null) {
    endSampleIndex = Math.floor(cropEnd * buffer.sampleRate);
    endSampleIndex = Math.min(channelData.length - 1, endSampleIndex); // Ensure it's within bounds
  }
  
  // Calculate the actual duration of the cropped audio
  const croppedDuration = (endSampleIndex - startSampleIndex + 1) / buffer.sampleRate;
  
  // Number of segments to divide the waveform into, now determined by zoom level (1-10)
  // Ensure zoom is within valid range
  const zoomValue = Math.max(1, Math.min(10, zoom));
  
  // Base segmentsPerSecond value (6) is now scaled by zoom factor
  // At zoom=1, use 6 segments per second (simplest view)
  // At zoom=10, use 60 segments per second (most detailed view)
  const segmentsPerSecond = 6;
  const numSegments = croppedDuration * segmentsPerSecond;
  const samplesPerSegment = Math.floor((endSampleIndex - startSampleIndex + 1) / numSegments);
  
  // Start drawing
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  
  // Draw simplified waveform
  for (let i = 0; i < numSegments; i++) {
    const segmentStartSample = startSampleIndex + (i * samplesPerSegment);
    let sum = 0;
    let count = 0;
    let maxAmp = 0;
    
    // Calculate average amplitude for this segment
    for (let j = 0; j < samplesPerSegment && (segmentStartSample + j) <= endSampleIndex; j++) {
      const amplitude = Math.abs(channelData[segmentStartSample + j]);
      sum += amplitude;
      count++;
      maxAmp = Math.max(maxAmp, amplitude);
    }
    
    // Calculate average and scale it (blend average with max for better visual)
    const avgAmp = count > 0 ? sum / count : 0;
    const blendedAmp = (avgAmp * 0.7) + (maxAmp * 0.3); // Blend for better visual representation
    
    // Calculate x position (scaled to canvas width)
    const x = (i / numSegments) * width;
    
    // Calculate y positions (center line +/- amplitude)
    const centerY = height / 2;
    const ampHeight = blendedAmp * height * 0.8; // Scale amplitude to 80% of half height
    
    // Draw a vertical line for this segment
    ctx.lineTo(x, centerY - ampHeight);
    ctx.lineTo(x, centerY + ampHeight);
  }
  
  // Add final point
  ctx.lineTo(width, height / 2);
  
  ctx.stroke();
};

// Helper function to write strings to DataView
export function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

export function audioBufferToWav(buffer, sampleRate) {
  // Use the provided sample rate or default to the buffer's sample rate
  const useSampleRate = sampleRate || buffer.sampleRate;
  
  // High-quality WAV settings
  const numOfChannels = buffer.numberOfChannels;
  const bitsPerSample = 24; // 24-bit for higher quality (CD quality is 16-bit)
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numOfChannels * bytesPerSample;
  const byteRate = useSampleRate * blockAlign;
  const dataSize = buffer.length * numOfChannels * bytesPerSample;
  
  // Create WAV file container
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);
  
  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // RIFF chunk length
  view.setUint32(4, 36 + dataSize, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // Format chunk identifier
  writeString(view, 12, 'fmt ');
  // Format chunk length
  view.setUint32(16, 16, true);
  // Sample format (raw)
  view.setUint16(20, 1, true);
  // Channel count
  view.setUint16(22, numOfChannels, true);
  // Sample rate
  view.setUint32(24, useSampleRate, true);
  // Byte rate (sample rate * block align)
  view.setUint32(28, byteRate, true);
  // Block align (channel count * bytes per sample)
  view.setUint16(32, blockAlign, true);
  // Bits per sample
  view.setUint16(34, bitsPerSample, true);
  // Data chunk identifier
  writeString(view, 36, 'data');
  // Data chunk length
  view.setUint32(40, dataSize, true);
  
  // Write the PCM samples with high precision
  const offset = 44;
  const channelData = [];
  for (let i = 0; i < numOfChannels; i++) {
    channelData.push(buffer.getChannelData(i));
  }
  
  let pos = 0;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numOfChannels; ch++) {
      // Clamp the value to the -1 to 1 range
      const sample = Math.max(-1, Math.min(1, channelData[ch][i]));
      
      // For 24-bit audio, we need to write 3 bytes
      if (bitsPerSample === 24) {
        // Convert to 24-bit signed integer
        const value = sample < 0 ? sample * 0x800000 : sample * 0x7FFFFF;
        const intValue = Math.floor(value);
        
        // Write the 3 bytes (little-endian)
        view.setUint8(offset + pos, intValue & 0xFF);
        view.setUint8(offset + pos + 1, (intValue >> 8) & 0xFF);
        view.setUint8(offset + pos + 2, (intValue >> 16) & 0xFF);
        pos += 3;
      } else {
        // Fallback to 16-bit if needed
        const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset + pos, value, true);
        pos += 2;
      }
    }
  }
  
  return arrayBuffer;
};