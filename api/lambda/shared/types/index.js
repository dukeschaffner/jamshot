// Audio constants
export const AUDIO_CONSTANTS = {
  MIN_BPM: 60,
  MAX_BPM: 200,
  DEFAULT_BPM: 120,
  TIME_SIGNATURES: ['4/4', '3/4', '2/4', '6/8', '9/8', '12/8'],
  SAMPLE_RATE: 44100,
  MAX_LAYERS: 5, // Maximum collaborators per track
};

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
  FREE: 'free',
  BASIC: 'basic',
  PREMIUM: 'premium',
};

// Note: Upload limits are defined in subscriptionConfig.js
// The web app uses a more complex structure with features and limits
// This is just a reference - actual limits should come from subscriptionConfig

// Feed types
export const FEED_TYPES = {
  FOR_YOU: 'for-you',
  FOLLOWING: 'following',
  POPULAR: 'popular',
};

// Privacy constants
export const PRIVACY_TYPES = {
  PUBLIC: 'public',
  PRIVATE: 'private',
};
