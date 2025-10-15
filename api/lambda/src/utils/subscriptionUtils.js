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
  getTierUpgradeOptions
};
