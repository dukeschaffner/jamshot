// Subscription Tier Constants
export const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  BASIC: 'basic', 
  PREMIUM: 'premium'
};

// Base Subscription Plan Definitions (without environment-specific data)
export const SUBSCRIPTION_PLANS_BASE = {
  [SUBSCRIPTION_TIERS.FREE]: {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    billing_period: null,
    features: {
      uploads_per_day: 1,
      total_uploads: 25,
      private_tracks: false,
      recording_limit_minutes: 5,
      analytics: false,
      ads: true,
      free_samples_per_month: 0,
      advanced_daw: false
    },
    limits: {
      daily_uploads: 1,
      max_total_uploads: 25,
      max_recording_duration: 300 // 5 minutes in seconds
    },
    highlights: [
      '1 upload per day',
      '25 total uploads',
      'Community features'
    ]
  },
  
  [SUBSCRIPTION_TIERS.BASIC]: {
    id: 'basic',
    name: 'Basic',
    price: 4.99,
    currency: 'USD',
    billing_period: 'month',
    features: {
      uploads_per_day: 5,
      total_uploads: 60,
      recording_limit_minutes: 5,
      private_tracks: true,
      analytics: true,
      ads: false,
      free_samples_per_month: 0,
      advanced_daw: false
    },
    limits: {
      daily_uploads: 5,
      max_total_uploads: 60,
      max_recording_duration: 300 // 5 minutes in seconds
    },
    highlights: [
      '5 uploads per day',
      '60 total uploads',
      'Private tracks'
    ]
  },
  
  [SUBSCRIPTION_TIERS.PREMIUM]: {
    id: 'premium',
    name: 'Premium',
    price: 19.99,
    currency: 'USD',
    billing_period: 'month',
    features: {
      uploads_per_day: 25,
      total_uploads: -1, // -1 indicates unlimited
      recording_limit_minutes: 10,
      private_tracks: true,
      analytics: true,
      ads: false,
      free_samples_per_month: 5,
      advanced_daw: true
    },
    limits: {
      daily_uploads: 25,
      max_total_uploads: -1, // unlimited
      max_recording_duration: 600 // 10 minutes in seconds
    },
    highlights: [
      '25 uploads per day',
      'Unlimited total uploads',
      'Private tracks'
    ]
  }
};

// Helper function to extend plans with environment-specific data
export const createSubscriptionPlans = (extensions = {}) => {
  const plans = {};
  
  for (const [tier, basePlan] of Object.entries(SUBSCRIPTION_PLANS_BASE)) {
    plans[tier] = {
      ...basePlan,
      ...(extensions[tier] || {})
    };
  }
  
  return plans;
};

// Core utility functions that work with any plan structure
export const isValidTier = (tier) => {
  return Object.values(SUBSCRIPTION_TIERS).includes(tier);
};

// Compare tiers - returns negative if tier1 < tier2, positive if tier1 > tier2, 0 if equal
export const compareTiers = (tier1, tier2) => {
  const tierOrder = [SUBSCRIPTION_TIERS.FREE, SUBSCRIPTION_TIERS.BASIC, SUBSCRIPTION_TIERS.PREMIUM];
  const index1 = tierOrder.indexOf(tier1);
  const index2 = tierOrder.indexOf(tier2);
  
  if (index1 === -1 || index2 === -1) {
    throw new Error('Invalid tier for comparison');
  }
  
  return index1 - index2;
};

// Get tier rank (0 = lowest, higher number = higher tier)
export const getTierRank = (tier) => {
  const tierOrder = [SUBSCRIPTION_TIERS.FREE, SUBSCRIPTION_TIERS.BASIC, SUBSCRIPTION_TIERS.PREMIUM];
  const rank = tierOrder.indexOf(tier);
  if (rank === -1) {
    throw new Error('Invalid tier');
  }
  return rank;
};

// Check if tier1 is an upgrade from tier2
export const isUpgrade = (fromTier, toTier) => {
  return compareTiers(toTier, fromTier) > 0;
};

// Check if tier1 is a downgrade from tier2
export const isDowngrade = (fromTier, toTier) => {
  return compareTiers(toTier, fromTier) < 0;
};

// Get ordered list of tiers
export const getTierOrder = () => {
  return [SUBSCRIPTION_TIERS.FREE, SUBSCRIPTION_TIERS.BASIC, SUBSCRIPTION_TIERS.PREMIUM];
};

// Utility function to get plan by tier
export const getPlanByTier = (tier, plans = SUBSCRIPTION_PLANS_BASE) => {
  return plans[tier] || null;
};

// Utility function to validate subscription limits
export const validateSubscriptionLimits = (tier, action, count) => {
  const plan = getPlanByTier(tier);
  if (!plan) return false;
  
  switch (action) {
    case 'daily_uploads':
      return count < plan.limits.daily_uploads;
    case 'total_uploads':
      return plan.limits.max_total_uploads === -1 || count < plan.limits.max_total_uploads;
    case 'recording_duration':
      return count <= plan.limits.max_recording_duration;
    default:
      return false;
  }
};

// Default export for convenience
export default {
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PLANS_BASE,
  createSubscriptionPlans,
  isValidTier,
  compareTiers,
  getTierRank,
  isUpgrade,
  isDowngrade,
  getTierOrder,
  getPlanByTier,
  validateSubscriptionLimits
}; 