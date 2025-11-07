// API Subscription Utilities
// Uses shared subscription logic with API-specific extensions

const {
  SUBSCRIPTION_TIERS,
  createSubscriptionPlans,
  getUserTier,
  getUserPlan,
  canUserUpload,
  canUserCreatePrivateTrack,
  canUserAccessAnalytics,
  canUserAccessStreamsByUser,
  canUserAccessAdvancedDAW,
  getUserUploadLimit,
  getUserRecordingLimit,
  hasReachedTotalUploadLimit,
  getFeaturesByTier,
  getLimitsByTier,
  isValidTier,
  getTierUpgradeOptions
} = require('../../shared/utils/subscription');

const pool = require('../config/db');

// API-specific extensions (Stripe price IDs)
const API_PLAN_EXTENSIONS = {
  [SUBSCRIPTION_TIERS.FREE]: {
    stripe_price_id: null
  },
  [SUBSCRIPTION_TIERS.BASIC]: {
    stripe_price_id: process.env.STRIPE_BASIC_PRICE_ID
  },
  [SUBSCRIPTION_TIERS.PREMIUM]: {
    stripe_price_id: process.env.STRIPE_PREMIUM_PRICE_ID
  }
};

// Create subscription plans with API extensions
const SUBSCRIPTION_PLANS_EXTENDED = createSubscriptionPlans(API_PLAN_EXTENSIONS);

/**
 * Check if user has reached their daily upload quota
 * @param {number} userId - User ID (required)
 * @param {object} user - Optional user object with subscription_tier and subscription_expires_at
 * @param {object} subscription - Optional subscription plan object
 * @returns {Promise<{status: number, body: object}|null>} Returns error response body or null if valid
 */
async function checkDailyUploadQuota(userId, user = null, subscription = null) {
  try {
    // Fetch user from DB if not provided
    if (!user) {
      const userResult = await pool.query(
        'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return {
          status: 404,
          body: { error: 'User not found' }
        };
      }

      user = userResult.rows[0];
    }

    // Get subscription plan if not provided
    if (!subscription) {
      subscription = getUserPlan(user);
    }

    // Check daily upload limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const uploadCountResult = await pool.query(
      'SELECT COUNT(*) FROM tracks WHERE user_id = $1 AND created_at >= $2 AND processing_status = $3',
      [userId, today, 'completed']
    );

    const dailyUploadCount = parseInt(uploadCountResult.rows[0].count);

    if (subscription.limits.daily_uploads !== -1 && dailyUploadCount >= subscription.limits.daily_uploads) {
      return {
        status: 429,
        body: {
          error: 'Daily upload limit reached',
          message: `You can only upload ${subscription.limits.daily_uploads} tracks per day. Upgrade your plan to increase your upload limit.`,
          daily_count: dailyUploadCount,
          upgrade_link: `${process.env.FRONTEND_URL || ''}/subscribe`
        }
      };
    }

    return null; // Valid, no error
  } catch (err) {
    console.error('Error checking daily upload quota:', err);
    return {
      status: 500,
      body: { error: 'Failed to check upload limit' }
    };
  }
}

/**
 * Check if user has reached their total upload quota
 * @param {number} userId - User ID (required)
 * @param {object} user - Optional user object with subscription_tier and subscription_expires_at
 * @param {object} subscription - Optional subscription plan object
 * @returns {Promise<{status: number, body: object}|null>} Returns error response body or null if valid
 */
async function checkTotalUploadQuota(userId, user = null, subscription = null) {
  try {
    // Fetch user from DB if not provided
    if (!user) {
      const userResult = await pool.query(
        'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
        [userId]
      );

      if (userResult.rows.length === 0) {
        return {
          status: 404,
          body: { error: 'User not found' }
        };
      }

      user = userResult.rows[0];
    }

    // Get subscription plan if not provided
    if (!subscription) {
      subscription = getUserPlan(user);
    }

    // Check total track limit
    const totalTrackCountResult = await pool.query(
      'SELECT COUNT(*) FROM tracks WHERE user_id = $1 AND processing_status = $2',
      [userId, 'completed']
    );

    const totalTrackCount = parseInt(totalTrackCountResult.rows[0].count);

    if (subscription.limits.max_total_uploads !== -1 && totalTrackCount >= subscription.limits.max_total_uploads) {
      return {
        status: 429,
        body: {
          error: 'Total track limit reached',
          message: `You can only have ${subscription.limits.max_total_uploads} tracks maximum. Upgrade your plan to increase your track limit.`,
          total_count: totalTrackCount,
          upgrade_link: `${process.env.FRONTEND_URL || ''}/subscribe`
        }
      };
    }

    return null; // Valid, no error
  } catch (err) {
    console.error('Error checking total upload quota:', err);
    return {
      status: 500,
      body: { error: 'Failed to check total track limit' }
    };
  }
}

// Export all constants and functions
module.exports = {
  // Constants
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PLANS: SUBSCRIPTION_PLANS_EXTENDED,

  // Utility Functions (from shared utils, but some overridden for extended plans)
  getUserTier,
  getUserPlan,
  canUserUpload,
  canUserCreatePrivateTrack,
  canUserAccessAnalytics,
  canUserAccessStreamsByUser,
  canUserAccessAdvancedDAW,
  getUserUploadLimit,
  getUserRecordingLimit,
  hasReachedTotalUploadLimit,
  getFeaturesByTier,
  getLimitsByTier,
  isValidTier,
  getTierUpgradeOptions,

  // Quota check functions
  checkDailyUploadQuota,
  checkTotalUploadQuota
};
