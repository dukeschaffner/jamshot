/**
 * Format seconds into MM:SS format
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(seconds) {
  if (!seconds && seconds !== 0) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
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
export function renderWaveform(buffer, canvasRef){
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
  
  // Number of segments to divide the waveform into (fewer segments = simpler waveform)
  const segmentsPerSecond = 6;
  const numSegments = buffer.duration * segmentsPerSecond;
  const samplesPerSegment = Math.floor(channelData.length / numSegments);
  
  // Start drawing
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  
  // Draw simplified waveform
  for (let i = 0; i < numSegments; i++) {
    const startSample = i * samplesPerSegment;
    let sum = 0;
    let count = 0;
    let maxAmp = 0;
    
    // Calculate average amplitude for this segment
    for (let j = 0; j < samplesPerSegment && (startSample + j) < channelData.length; j++) {
      const amplitude = Math.abs(channelData[startSample + j]);
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