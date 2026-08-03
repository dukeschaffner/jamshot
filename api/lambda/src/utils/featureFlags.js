// Feature Flags Utility
// Provides caching and retrieval of feature flags from the database

import pool from '../config/db.js';

// In-memory cache for feature flags
let flagsCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds

/**
 * Get all feature flags from database
 * @returns {Promise<Object>} Object with flag_key as keys and flag_value as values
 */
async function getFeatureFlags() {
  try {
    const result = await pool.query(
      'SELECT flag_key, flag_value FROM feature_flags'
    );

    const flags = {};
    result.rows.forEach(row => {
      flags[row.flag_key] = row.flag_value;
    });

    return flags;
  } catch (err) {
    console.error('Error fetching feature flags:', err);
    return {};
  }
}

/**
 * Get a single feature flag value
 * @param {string} flagKey - The flag key to retrieve
 * @returns {Promise<boolean|null>} Flag value or null if not found
 */
async function getFeatureFlag(flagKey) {
  try {
    const result = await pool.query(
      'SELECT flag_value FROM feature_flags WHERE flag_key = $1',
      [flagKey]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].flag_value;
  } catch (err) {
    console.error(`Error fetching feature flag ${flagKey}:`, err);
    return null;
  }
}

/**
 * Check if a feature is enabled
 * @param {string} flagKey - The flag key to check
 * @param {boolean} defaultValue - Default value if flag doesn't exist (defaults to false)
 * @returns {Promise<boolean>} True if feature is enabled, false otherwise
 */
async function isFeatureEnabled(flagKey, defaultValue = false) {
  // Check cache first
  const now = Date.now();
  if (flagsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
    if (flagKey in flagsCache) {
      return flagsCache[flagKey];
    }
  }

  // Cache miss or expired, fetch from DB
  try {
    const flags = await getFeatureFlags();
    flagsCache = flags;
    cacheTimestamp = now;

    if (flagKey in flags) {
      return flags[flagKey];
    }

    return defaultValue;
  } catch (err) {
    console.error(`Error checking feature flag ${flagKey}:`, err);
    return defaultValue;
  }
}

/**
 * Refresh the feature flags cache
 * Forces a reload from the database
 * @returns {Promise<Object>} Updated flags object
 */
async function refreshFeatureFlags() {
  try {
    const flags = await getFeatureFlags();
    flagsCache = flags;
    cacheTimestamp = Date.now();
    return flags;
  } catch (err) {
    console.error('Error refreshing feature flags:', err);
    return flagsCache || {};
  }
}

/**
 * Get all feature flags (cached)
 * @returns {Promise<Object>} Object with all flags
 */
async function getAllFeatureFlags() {
  // Check cache first
  const now = Date.now();
  if (flagsCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
    return flagsCache;
  }

  // Cache miss or expired, fetch from DB
  return await refreshFeatureFlags();
}

export {
  getFeatureFlag,
  getFeatureFlags,
  isFeatureEnabled,
  refreshFeatureFlags,
  getAllFeatureFlags
};

