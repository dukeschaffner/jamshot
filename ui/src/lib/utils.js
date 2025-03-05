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