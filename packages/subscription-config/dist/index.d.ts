// Type definitions for @jamshot/subscription-config

export interface SubscriptionFeatures {
  uploads_per_day: number;
  total_uploads: number;
  private_tracks: boolean;
  recording_limit_minutes: number;
  analytics: boolean;
  ads: boolean;
  free_samples_per_month: number;
  advanced_daw: boolean;
}

export interface SubscriptionLimits {
  daily_uploads: number;
  max_total_uploads: number;
  max_recording_duration: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  price: number;
  currency: string;
  billing_period: string | null;
  features: SubscriptionFeatures;
  limits: SubscriptionLimits;
  highlights: string[];
  [key: string]: any; // Allow for extensions
}

export interface SubscriptionPlans {
  [key: string]: SubscriptionPlan;
}

export interface SubscriptionTiers {
  FREE: 'free';
  BASIC: 'basic';
  PREMIUM: 'premium';
}

export declare const SUBSCRIPTION_TIERS: SubscriptionTiers;

export declare const SUBSCRIPTION_PLANS_BASE: SubscriptionPlans;

export declare function createSubscriptionPlans(extensions?: Record<string, any>): SubscriptionPlans;

export declare function isValidTier(tier: string): boolean;

export declare function compareTiers(tier1: string, tier2: string): number;

export declare function getTierRank(tier: string): number;

export declare function isUpgrade(fromTier: string, toTier: string): boolean;

export declare function isDowngrade(fromTier: string, toTier: string): boolean;

export declare function getTierOrder(): string[];

export declare function getPlanByTier(tier: string, plans?: SubscriptionPlans): SubscriptionPlan | null;

export declare function validateSubscriptionLimits(tier: string, action: string, count: number): boolean;

declare const _default: {
  SUBSCRIPTION_TIERS: SubscriptionTiers;
  SUBSCRIPTION_PLANS_BASE: SubscriptionPlans;
  createSubscriptionPlans: typeof createSubscriptionPlans;
  isValidTier: typeof isValidTier;
  compareTiers: typeof compareTiers;
  getTierRank: typeof getTierRank;
  isUpgrade: typeof isUpgrade;
  isDowngrade: typeof isDowngrade;
  getTierOrder: typeof getTierOrder;
  getPlanByTier: typeof getPlanByTier;
  validateSubscriptionLimits: typeof validateSubscriptionLimits;
};

export default _default;
