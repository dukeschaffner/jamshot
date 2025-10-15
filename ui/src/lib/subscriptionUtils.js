// Client-side Subscription Utilities
// Uses shared subscription utilities for consistent behavior

// Re-export all functions from the shared subscription utils
export {
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
  formatLimitDisplay
} from '../../shared/utils/subscription.js'; 