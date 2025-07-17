// Client-side Subscription Utilities
// Uses shared subscription config for consistent behavior

import { 
  SUBSCRIPTION_TIERS, 
  SUBSCRIPTION_PLANS_BASE,
  createSubscriptionPlans,
  isValidTier,
  compareTiers,
  getTierRank,
  isUpgrade,
  isDowngrade
} from '../../../shared/subscriptionConfig.js';

// UI doesn't need additional extensions, so we use the base plans directly
export const SUBSCRIPTION_PLANS = createSubscriptionPlans();

// Re-export shared constants and utilities
export { 
  SUBSCRIPTION_TIERS,
  isValidTier,
  compareTiers,
  getTierRank,
  isUpgrade,
  isDowngrade
};

// UI-specific Utility Functions
export const getUserTier = (user) => {
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

export const getUserPlan = (user) => {
  const tier = getUserTier(user);
  return SUBSCRIPTION_PLANS[tier];
};

export const canUserUpload = (user, uploadsToday = 0) => {
  const plan = getUserPlan(user);
  return uploadsToday < plan.limits.daily_uploads;
};

export const canUserCreatePrivateTrack = (user) => {
  const plan = getUserPlan(user);
  return plan.features.private_tracks;
};

export const canUserAccessAnalytics = (user) => {
  const plan = getUserPlan(user);
  return plan.features.analytics;
};

export const canUserAccessAdvancedDAW = (user) => {
  const plan = getUserPlan(user);
  return plan.features.advanced_daw;
};

export const getUserUploadLimit = (user) => {
  const plan = getUserPlan(user);
  return {
    daily: plan.limits.daily_uploads,
    total: plan.limits.max_total_uploads
  };
};

export const getUserRecordingLimit = (user) => {
  const plan = getUserPlan(user);
  return plan.limits.max_recording_duration;
};

export const hasReachedTotalUploadLimit = (user, currentUploads = 0) => {
  const plan = getUserPlan(user);
  if (plan.limits.max_total_uploads === -1) return false; // unlimited
  return currentUploads >= plan.limits.max_total_uploads;
};

export const getFeaturesByTier = (tier) => {
  return SUBSCRIPTION_PLANS[tier]?.features || SUBSCRIPTION_PLANS[SUBSCRIPTION_TIERS.FREE].features;
};

export const getLimitsByTier = (tier) => {
  return SUBSCRIPTION_PLANS[tier]?.limits || SUBSCRIPTION_PLANS[SUBSCRIPTION_TIERS.FREE].limits;
};

export const getTierUpgradeOptions = (currentTier) => {
  const tiers = [SUBSCRIPTION_TIERS.FREE, SUBSCRIPTION_TIERS.BASIC, SUBSCRIPTION_TIERS.PREMIUM];
  const currentIndex = tiers.indexOf(currentTier);
  return tiers.slice(currentIndex + 1).map(tier => SUBSCRIPTION_PLANS[tier]);
};

export const formatPrice = (price) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price);
};

export const formatLimitDisplay = (limit) => {
  if (limit === -1) return 'Unlimited';
  return limit.toString();
}; 