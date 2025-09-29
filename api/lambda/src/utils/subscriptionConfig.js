// Shared Subscription Configuration
// Single source of truth for subscription plans used by both UI and API

// Subscription Tier Constants
const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  BASIC: 'basic', 
  PREMIUM: 'premium'
};

// Base Subscription Plan Definitions (without environment-specific data)
const SUBSCRIPTION_PLANS_BASE = {
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
      analytics_streams_by_user: false,
      ads: true,
      free_samples_per_month: 0,
      advanced_daw: false,
      host_competitions: false,
      no_hosting_fees: false
    },
    limits: {
      daily_uploads: 1,
      max_total_uploads: 25,
      max_recording_duration: 300 // 5 minutes in seconds
    },
    highlights: [
      '1 upload per day',
      '25 total uploads',
    //   '5 minute recording limit',
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
      analytics_streams_by_user: false,
      ads: false,
      free_samples_per_month: 0,
      advanced_daw: false,
      host_competitions: true,
      no_hosting_fees: false
    },
    limits: {
      daily_uploads: 5,
      max_total_uploads: 60,
      max_recording_duration: 300 // 5 minutes in seconds
    },
    highlights: [
      '5 uploads per day',
      '60 total uploads',
      'Private tracks',
    //   'Analytics dashboard',
    //   'No ads'
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
      analytics_streams_by_user: true,
      ads: false,
      free_samples_per_month: 5,
      advanced_daw: true,
      host_competitions: true,
      no_hosting_fees: true
    },
    limits: {
      daily_uploads: 25,
      max_total_uploads: -1, // unlimited
      max_recording_duration: 600 // 10 minutes in seconds
    },
    highlights: [
      '25 uploads per day',
      'Unlimited total uploads',
    //   '10 minute recording limit',
      'Private tracks',
    //   'Advanced DAW',
    //   '5 free samples per month',
    //   'Analytics dashboard',
    //   'No ads'
    ]
  }
};

// Helper function to extend plans with environment-specific data
const createSubscriptionPlans = (extensions = {}) => {
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
const isValidTier = (tier) => {
  return Object.values(SUBSCRIPTION_TIERS).includes(tier);
};

// Compare tiers - returns negative if tier1 < tier2, positive if tier1 > tier2, 0 if equal
const compareTiers = (tier1, tier2) => {
  const tierOrder = [SUBSCRIPTION_TIERS.FREE, SUBSCRIPTION_TIERS.BASIC, SUBSCRIPTION_TIERS.PREMIUM];
  const index1 = tierOrder.indexOf(tier1);
  const index2 = tierOrder.indexOf(tier2);
  
  if (index1 === -1 || index2 === -1) {
    throw new Error('Invalid tier for comparison');
  }
  
  return index1 - index2;
};

// Get tier rank (0 = lowest, higher number = higher tier)
const getTierRank = (tier) => {
  const tierOrder = [SUBSCRIPTION_TIERS.FREE, SUBSCRIPTION_TIERS.BASIC, SUBSCRIPTION_TIERS.PREMIUM];
  const rank = tierOrder.indexOf(tier);
  if (rank === -1) {
    throw new Error('Invalid tier');
  }
  return rank;
};

// Check if tier1 is an upgrade from tier2
const isUpgrade = (fromTier, toTier) => {
  return compareTiers(toTier, fromTier) > 0;
};

// Check if tier1 is a downgrade from tier2
const isDowngrade = (fromTier, toTier) => {
  return compareTiers(toTier, fromTier) < 0;
};

// For Node.js environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SUBSCRIPTION_TIERS,
    SUBSCRIPTION_PLANS_BASE,
    createSubscriptionPlans,
    isValidTier,
    compareTiers,
    getTierRank,
    isUpgrade,
    isDowngrade
  };
}

// For ES modules/browser environments
if (typeof window !== 'undefined' || typeof self !== 'undefined') {
  window.SubscriptionConfig = {
    SUBSCRIPTION_TIERS,
    SUBSCRIPTION_PLANS_BASE,
    createSubscriptionPlans,
    isValidTier,
    compareTiers,
    getTierRank,
    isUpgrade,
    isDowngrade
  };
}

// For ES modules
export {
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PLANS_BASE,
  createSubscriptionPlans,
  isValidTier,
  compareTiers,
  getTierRank,
  isUpgrade,
  isDowngrade
}; 