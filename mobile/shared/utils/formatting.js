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
const formatDuration = (seconds, precision = 0) => {
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
const formatDate = (dateString) => {
  if (!dateString) return '';

  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
};

/**
 * Format a datetime to a readable string in user's local timezone
 * @param {string} dateString - ISO date string (UTC)
 * @param {boolean} includeTime - Whether to include time in the format
 * @returns {string} Formatted datetime string in user's local timezone
 */
const formatDateTime = (dateString, includeTime = true) => {
  if (!dateString) return '';

  const date = new Date(dateString);
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  };

  if (includeTime) {
    options.hour = 'numeric';
    options.minute = '2-digit';
    options.hour12 = true;
  }

  return date.toLocaleDateString('en-US', options);
};

/**
 * Format competition date range for display
 * @param {string} startDate - ISO start date string (UTC)
 * @param {string} endDate - ISO end date string (UTC)
 * @returns {string} Formatted date range string
 */
const formatCompetitionDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return '';

  const start = new Date(startDate);
  const end = new Date(endDate);

  const startFormatted = start.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const endFormatted = end.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  return `${startFormatted} - ${endFormatted}`;
};

/**
 * Format time ago (e.g., "2 hours ago", "3 days ago")
 * @param {string} dateString - ISO date string
 * @returns {string} Formatted time ago string
 */
const formatTimeAgo = (dateString) => {
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
const formatPlayCount = (count) => {
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
const getLikeCountString = (likeCount) => {
  if (likeCount === 0) return '0 likes';
  if (likeCount === 1) return '1 like';
  return `${Number(likeCount).toLocaleString()} likes`;
};

/**
 * Format comment count with proper pluralization
 * @param {number} commentCount - Number of comments
 * @returns {string} Formatted comment count
 */
const getCommentCountString = (commentCount) => {
  if (commentCount === 0) return '0 comments';
  if (commentCount === 1) return '1 comment';
  return `${Number(commentCount).toLocaleString()} comments`;
};

/**
 * Format follower count with K/M suffixes
 * @param {number} count - Follower count
 * @returns {string} Formatted follower count
 */
const formatFollowerCount = (count) => {
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
const formatFileSize = (bytes) => {
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
const formatUsername = (username) => {
  if (!username) return '';
  return `@${username}`;
};

/**
 * Truncate text to specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
const truncateText = (text, maxLength) => {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

/**
 * Capitalize first letter of each word
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
const capitalizeWords = (text) => {
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
const posToTime = (position, duration) => {
  return (position / 100) * duration;
};

/**
 * Convert time in seconds to percentage position
 * @param {number} time - Time in seconds
 * @param {number} duration - Total duration in seconds
 * @returns {number} Position as percentage (0-100)
 */
const timeToPos = (time, duration) => {
  return (time / duration) * 100;
};

/**
 * Get country name from country code
 * @param {string} countryCode - ISO country code (e.g., 'US', 'UK', 'CA')
 * @returns {string} Full country name or country code if not found
 */
const getCountryName = (countryCode) => {
  const countryNames = {
    'US': 'United States',
    'UK': 'United Kingdom',
    'GB': 'United Kingdom', // Alternative code for UK
    'CA': 'Canada',
    'DE': 'Germany',
    'FR': 'France',
    'AU': 'Australia',
    'JP': 'Japan',
    'BR': 'Brazil',
    'IN': 'India',
    'MX': 'Mexico',
    'ES': 'Spain',
    'IT': 'Italy',
    'NL': 'Netherlands',
    'SE': 'Sweden',
    'NO': 'Norway',
    'DK': 'Denmark',
    'FI': 'Finland'
  };

  return countryNames[countryCode] || countryCode;
};

/**
 * Get country flag emoji from country code
 * @param {string} countryCode - ISO country code (e.g., 'US', 'UK', 'CA')
 * @returns {string} Flag emoji or globe emoji if not found
 */
const getCountryFlag = (countryCode) => {
  const flagEmojis = {
    'US': '🇺🇸',
    'UK': '🇬🇧',
    'GB': '🇬🇧',
    'CA': '🇨🇦',
    'DE': '🇩🇪',
    'FR': '🇫🇷',
    'AU': '🇦🇺',
    'JP': '🇯🇵',
    'BR': '🇧🇷',
    'IN': '🇮🇳',
    'MX': '🇲🇽',
    'ES': '🇪🇸',
    'IT': '🇮🇹',
    'NL': '🇳🇱',
    'SE': '🇸🇪',
    'NO': '🇳🇴',
    'DK': '🇩🇰',
    'FI': '🇫🇮'
  };

  return flagEmojis[countryCode] || '🌍';
};

// Export lists for different platforms
const API_EXPORTS = [];
const UI_EXPORTS = [
  formatDuration,
  formatDate,
  formatDateTime,
  formatCompetitionDateRange,
  formatTimeAgo,
  formatPlayCount,
  getLikeCountString,
  getCommentCountString,
  formatFollowerCount,
  formatFileSize,
  formatUsername,
  truncateText,
  capitalizeWords,
  posToTime,
  timeToPos,
  getCountryName,
  getCountryFlag
]; 

// Auto-generated ES6 exports
export {
  formatDuration,
  formatDate,
  formatDateTime,
  formatCompetitionDateRange,
  formatTimeAgo,
  formatPlayCount,
  getLikeCountString,
  getCommentCountString,
  formatFollowerCount,
  formatFileSize,
  formatUsername,
  truncateText,
  capitalizeWords,
  posToTime,
  timeToPos,
  getCountryName,
  getCountryFlag,
};
