/**
 * Formatting utilities for Jamshot
 * Shared across web and mobile platforms
 */

/**
 * Format seconds into MM:SS format
 * @param {number} seconds - Duration in seconds
 * @param {number} precision - Precision of the duration (0-2) 0 is seconds, 1 is tenths, 2 is hundredths
 * @returns {string} Formatted duration string
 */
export const formatDuration = (seconds, precision = 0) => {
  if (!seconds && seconds !== 0) return '0:00';
  
  if (precision === 0) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else if (precision === 1) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const tenths = Math.floor(remainingSeconds * 10) % 10;
    return `${minutes}:${Math.floor(remainingSeconds)}.${tenths}`;
  }
  
  return '0:00';
};

/**
 * Format a date to a readable string
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted date string
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format time ago (e.g., "2 hours ago", "3 days ago")
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted time ago string
 */
export const formatTimeAgo = (dateString) => {
  if (!dateString) return '';
  
  const now = new Date();
  const date = new Date(dateString);
  const diffInSeconds = Math.floor((now - date) / 1000);
  
  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}d ago`;
  if (diffInSeconds < 31536000) return `${Math.floor(diffInSeconds / 2592000)}mo ago`;
  
  return `${Math.floor(diffInSeconds / 31536000)}y ago`;
};

/**
 * Format play count with K/M suffixes
 * @param {number} count - Play count
 * @returns {string} Formatted play count
 */
export const formatPlayCount = (count) => {
  if (!count || count === 0) return '0';
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(1)}M`;
};

/**
 * Format like count with proper pluralization
 * @param {number} likeCount - Number of likes
 * @returns {string} Formatted like count
 */
export const getLikeCountString = (likeCount) => {
  if (likeCount === 0) return '0 likes';
  if (likeCount === 1) return '1 like';
  return `${Number(likeCount).toLocaleString()} likes`;
};

/**
 * Format comment count with proper pluralization
 * @param {number} commentCount - Number of comments
 * @returns {string} Formatted comment count
 */
export const getCommentCountString = (commentCount) => {
  if (commentCount === 0) return '0 comments';
  if (commentCount === 1) return '1 comment';
  return `${Number(commentCount).toLocaleString()} comments`;
};

/**
 * Format follower count with K/M suffixes
 * @param {number} count - Follower count
 * @returns {string} Formatted follower count
 */
export const formatFollowerCount = (count) => {
  if (!count || count === 0) return '0';
  if (count < 1000) return count.toString();
  if (count < 1000000) return `${(count / 1000).toFixed(1)}K`;
  return `${(count / 1000000).toFixed(1)}M`;
};

/**
 * Format file size in bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};



/**
 * Format username with @ symbol
 * @param {string} username - Username to format
 * @returns {string} Formatted username with @
 */
export const formatUsername = (username) => {
  if (!username) return '';
  return `@${username}`;
};

/**
 * Truncate text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export const truncateText = (text, maxLength) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Capitalize first letter of each word
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
export const capitalizeWords = (text) => {
  if (!text) return '';
  return text.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
};

/**
 * Convert percentage position to time in seconds
 * @param {number} position - Position as percentage (0-100)
 * @param {number} duration - Total duration in seconds
 * @returns {number} Time in seconds
 */
export const posToTime = (position, duration) => {
  return (position / 100) * duration;
};

/**
 * Convert time in seconds to percentage position
 * @param {number} time - Time in seconds
 * @param {number} duration - Total duration in seconds
 * @returns {number} Position as percentage (0-100)
 */
export const timeToPos = (time, duration) => {
  return (time / duration) * 100;
}; 