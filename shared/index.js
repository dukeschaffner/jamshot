/**
 * Shared utilities for Jamshot
 * Gets manually copied/synced between the web and mobile apps by a python script
 * Export lists define what gets exported to each platform
 */

// Import all shared items
import { createApiClient, createApiMethods } from './api/index.js';
import { AUDIO_CONSTANTS, SUBSCRIPTION_TIERS, FEED_TYPES, PRIVACY_TYPES } from './types/index.js';
import {
  SUBSCRIPTION_PLANS,
  createSubscriptionPlans,
  isValidTier,
  compareTiers,
  getTierRank,
  isUpgrade,
  isDowngrade
} from './utils/subscription.js';
import {
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
} from './utils/formatting.js';
import {
  validateDateOfBirth
} from './utils/validation.js';

// Export lists for different platforms
const API_EXPORTS = [
  // Types and constants (available to all platforms)
  AUDIO_CONSTANTS,
  SUBSCRIPTION_TIERS,
  FEED_TYPES,
  PRIVACY_TYPES,
  // Subscription utilities (available to API)
  SUBSCRIPTION_PLANS,
  createSubscriptionPlans,
  isValidTier,
  compareTiers,
  getTierRank,
  isUpgrade,
  isDowngrade,
  validateDateOfBirth
];
const UI_EXPORTS = [
  // API utilities
  createApiClient,
  createApiMethods,
  // Types and constants
  AUDIO_CONSTANTS,
  SUBSCRIPTION_TIERS,
  FEED_TYPES,
  PRIVACY_TYPES,
  // Formatting utilities
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
  validateDateOfBirth
];