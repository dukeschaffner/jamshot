// API Subscription Utilities
// Uses shared subscription config with API-specific extensions

const { 
  SUBSCRIPTION_TIERS, 
  SUBSCRIPTION_PLANS_BASE,
  createSubscriptionPlans,
  isValidTier
} = require('../../../shared/subscriptionConfig');

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
const SUBSCRIPTION_PLANS = createSubscriptionPlans(API_PLAN_EXTENSIONS);

// Utility Functions
const getUserTier = (user) => {
  if (!user) return SUBSCRIPTION_TIERS.FREE;
  
  // Check if subscription has expired
  if (user.subscription_expires_at && new Date(user.subscription_expires_at) < new Date()) {
    return SUBSCRIPTION_TIERS.FREE;
  }
  
  // Check if user has premium subscription
  if (user.subscription_tier === SUBSCRIPTION_TIERS.PREMIUM) {
    return SUBSCRIPTION_TIERS.PREMIUM;
  }
  
  // Check if user has basic subscription  
  if (user.subscription_tier === SUBSCRIPTION_TIERS.BASIC) {
    return SUBSCRIPTION_TIERS.BASIC;
  }
  
  // Default to free tier
  return SUBSCRIPTION_TIERS.FREE;
};

const getUserPlan = (user) => {
  const tier = getUserTier(user);
  return SUBSCRIPTION_PLANS[tier];
};

const canUserUpload = (user, uploadsToday = 0) => {
  const plan = getUserPlan(user);
  return uploadsToday < plan.limits.daily_uploads;
};

const canUserCreatePrivateTrack = (user) => {
  const plan = getUserPlan(user);
  return plan.features.private_tracks;
};

const canUserAccessAnalytics = (user) => {
  const plan = getUserPlan(user);
  return plan.features.analytics;
};

const canUserAccessAdvancedDAW = (user) => {
  const plan = getUserPlan(user);
  return plan.features.advanced_daw;
};

const getUserUploadLimit = (user) => {
  const plan = getUserPlan(user);
  return {
    daily: plan.limits.daily_uploads,
    total: plan.limits.max_total_uploads
  };
};

const getUserRecordingLimit = (user) => {
  const plan = getUserPlan(user);
  return plan.limits.max_recording_duration;
};

const hasReachedTotalUploadLimit = (user, currentUploads = 0) => {
  const plan = getUserPlan(user);
  if (plan.limits.max_total_uploads === -1) return false; // unlimited
  return currentUploads >= plan.limits.max_total_uploads;
};

const getFeaturesByTier = (tier) => {
  return SUBSCRIPTION_PLANS[tier]?.features || SUBSCRIPTION_PLANS[SUBSCRIPTION_TIERS.FREE].features;
};

const getLimitsByTier = (tier) => {
  return SUBSCRIPTION_PLANS[tier]?.limits || SUBSCRIPTION_PLANS[SUBSCRIPTION_TIERS.FREE].limits;
};

const getTierUpgradeOptions = (currentTier) => {
  const tiers = [SUBSCRIPTION_TIERS.FREE, SUBSCRIPTION_TIERS.BASIC, SUBSCRIPTION_TIERS.PREMIUM];
  const currentIndex = tiers.indexOf(currentTier);
  return tiers.slice(currentIndex + 1).map(tier => SUBSCRIPTION_PLANS[tier]);
};

// Export all constants and functions
module.exports = {
  // Constants
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PLANS,
  
  // Utility Functions
  getUserTier,
  getUserPlan,
  canUserUpload,
  canUserCreatePrivateTrack,
  canUserAccessAnalytics,
  canUserAccessAdvancedDAW,
  getUserUploadLimit,
  getUserRecordingLimit,
  hasReachedTotalUploadLimit,
  getFeaturesByTier,
  getLimitsByTier,
  isValidTier,
  getTierUpgradeOptions
};
