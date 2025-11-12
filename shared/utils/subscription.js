// Shared Subscription Configuration and Utilities
// Single source of truth for subscription plans used by both UI and API

// Subscription Tier Constants
const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  BASIC: 'basic', 
  PREMIUM: 'premium'
};

// Base Subscription Plan Definitions (without environment-specific data)
const SUBSCRIPTION_PLANS = {
  [SUBSCRIPTION_TIERS.FREE]: {
    id: 'free',
    name: 'Free',
    price: 0,
    currency: 'USD',
    billing_period: null,
    features: {
      uploads_per_day: 3,
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
      daily_uploads: 3,
      max_total_uploads: 25,
      max_recording_duration: 300 // 5 minutes in seconds
    },
    highlights: [
      '3 uploads per day',
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
      'Analytics',
      'Host competitions',
    //   'No ads'
    ]
  },
  
  [SUBSCRIPTION_TIERS.PREMIUM]: {
    id: 'premium',
    name: 'Premium',
    price: 12.99,
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
      'Analytics ( + streams by user)',
      'Host competitions (No hosting fees)',
    //   'No ads'
    ]
  }
};

// Team Subscription Plan Constants
const TEAM_PRODUCT_VERSIONS = {
  TEN_USERS: '10_users',
  TWENTY_FIVE_USERS: '25_users',
  FIFTY_USERS: '50_users',
  ONE_HUNDRED_USERS: '100_users',
  ENTERPRISE: 'enterprise'
};

// Team Subscription Plan Definitions
const TEAM_PLANS = {
  [TEAM_PRODUCT_VERSIONS.TEN_USERS]: {
    id: '10_users',
    name: 'Team Plan (Up to 10 users)',
    price: 49.00,
    currency: 'USD',
    billing_period: 'month',
    max_users: 10,
    features: {
      ads: false
    },
    limits: {
      max_users: 10,
      daily_uploads: 100,
      max_total_uploads: 1000
    },
    highlights: [
      'Up to 10 team members',
      'Private tracks',
      'Team Dashboard + Track Folders',
      'Shared upload pool (100/day, 1,000 total)',
      'No ads'
    ]
  },
  [TEAM_PRODUCT_VERSIONS.TWENTY_FIVE_USERS]: {
    id: '25_users',
    name: 'Team Plan (Up to 25 users)',
    price: 99.00,
    currency: 'USD',
    billing_period: 'month',
    max_users: 25,
    features: {
      ads: false
    },
    limits: {
      max_users: 25,
      daily_uploads: 250,
      max_total_uploads: 2500
    },
    highlights: [
      'Up to 25 team members',
      'Private tracks',
      'Team Dashboard + Track Folders',
      'Shared upload pool (250/day, 2,500 total)',
      'No ads'
    ]
  },
  [TEAM_PRODUCT_VERSIONS.FIFTY_USERS]: {
    id: '50_users',
    name: 'Team Plan (Up to 50 users)',
    price: 199.00,
    amount_cents: 19900,
    currency: 'USD',
    billing_period: 'month',
    max_users: 50,
    features: {
      ads: false
    },
    limits: {
      max_users: 50,
      daily_uploads: 500,
      max_total_uploads: 5000
    },
    highlights: [
      'Up to 50 team members',
      'Private tracks',
      'Team Dashboard + Track Folders',
      'Shared upload pool (500/day, 5,000 total)',
      'No ads'
    ]
  },
  [TEAM_PRODUCT_VERSIONS.ONE_HUNDRED_USERS]: {
    id: '100_users',
    name: 'Team Plan (Up to 100 users)',
    price: 299.00,
    amount_cents: 29900,
    currency: 'USD',
    billing_period: 'month',
    max_users: 100,
    features: {
      ads: false
    },
    limits: {
      max_users: 100,
      daily_uploads: 1000,
      max_total_uploads: 10000
    },
    highlights: [
      'Up to 100 team members',
      'Private tracks',
      'Team Dashboard + Track Folders',
      'Shared upload pool (1000/day, 10,000 total)',
      'No ads'
    ]
  },
  [TEAM_PRODUCT_VERSIONS.ENTERPRISE]: {
    id: 'enterprise',
    name: 'Enterprise Plan',
    price: null, // Custom pricing
    amount_cents: null,
    currency: 'USD',
    billing_period: 'month',
    max_users: -1, // Unlimited
    features: {
      ads: false,
    },
    limits: {
      max_users: -1, // Unlimited
      daily_uploads: -1, // Unlimited
      max_total_uploads: -1, // Unlimited
    },
    highlights: [
      'Private tracks',
      'Team Dashboard + Track Folders',
      'No ads',
      'Contact us for pricing'
    ]
  }
};

// Helper function to extend plans with environment-specific data
const createSubscriptionPlans = (extensions = {}) => {
  const plans = {};
  
  for (const [tier, basePlan] of Object.entries(SUBSCRIPTION_PLANS)) {
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

// UI-specific Utility Functions
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

const canUserAccessStreamsByUser = (user) => {
  const plan = getUserPlan(user);
  return plan.features.analytics_streams_by_user;
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

const formatPrice = (price) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(price);
};

const formatLimitDisplay = (limit) => {
  if (limit === -1) return 'Unlimited';
  return limit.toString();
};



// Validate team product version
const isValidTeamProductVersion = (version) => {
  return Object.values(TEAM_PRODUCT_VERSIONS).includes(version);
};

// Get team plan by product version
const getTeamPlan = (productVersion) => {
  return TEAM_PLANS[productVersion] || null;
};

// Export lists for different platforms
const API_EXPORTS = [
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PLANS,
  createSubscriptionPlans,
  isValidTier,
  compareTiers,
  getTierRank,
  isUpgrade,
  isDowngrade,
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
  getTierUpgradeOptions,
  TEAM_PRODUCT_VERSIONS,
  TEAM_PLANS,
  isValidTeamProductVersion,
  getTeamPlan
];

const UI_EXPORTS = [
  SUBSCRIPTION_TIERS,
  SUBSCRIPTION_PLANS,
  createSubscriptionPlans,
  isValidTier,
  compareTiers,
  getTierRank,
  isUpgrade,
  isDowngrade,
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
  getTierUpgradeOptions,
  formatPrice,
  formatLimitDisplay,
  TEAM_PRODUCT_VERSIONS,
  TEAM_PLANS
];