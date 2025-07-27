// User types
export const UserType = {
  id: 'number',
  username: 'string',
  email: 'string',
  name: 'string',
  verified: 'boolean',
  is_private: 'boolean',
  profile_pic_url: 'string',
  bio: 'string',
  created_at: 'string',
  updated_at: 'string',
  is_supporter: 'boolean',
  subscription_tier: 'string',
  subscription_expires_at: 'string',
};

// Track types
export const TrackType = {
  id: 'number',
  title: 'string',
  audio_url: 'string',
  combined_audio_url: 'string',
  duration: 'number',
  layer: 'number',
  parent_track_id: 'number',
  metronome_bpm: 'number',
  metronome_offset: 'number',
  time_signature: 'string',
  is_private: 'boolean',
  secret_token: 'string',
  allow_download: 'boolean',
  play_count: 'number',
  like_count: 'number',
  comment_count: 'number',
  created_at: 'string',
  user: 'object', // User object
  liked: 'boolean', // Whether current user has liked this track
};

// Comment types
export const CommentType = {
  id: 'number',
  content: 'string',
  created_at: 'string',
  updated_at: 'string',
  parent_comment_id: 'number',
  user: 'object', // User object
  track_id: 'number',
};

// Notification types
export const NotificationType = {
  id: 'number',
  type: 'string', // 'new_version', 'like', 'comment', 'featured', 'repost', 'follow_request'
  is_read: 'boolean',
  created_at: 'string',
  related_track_id: 'number',
  related_user_id: 'number',
  related_track: 'object', // Track object
  related_user: 'object', // User object
};

// Audio constants
export const AUDIO_CONSTANTS = {
  MIN_BPM: 60,
  MAX_BPM: 200,
  DEFAULT_BPM: 120,
  TIME_SIGNATURES: ['4/4', '3/4', '2/4', '6/8', '9/8', '12/8'],
  MAX_RECORDING_DURATION: 90, // seconds
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

// API endpoints
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/auth/login',
    REGISTER: '/auth/register',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh-token',
    FORGOT_PASSWORD: '/auth/forgot-password',
    RESET_PASSWORD: '/auth/reset-password',
  },
  USERS: {
    ME: '/users/me',
    PROFILE: (username) => `/users/${username}`,
    FOLLOW: (id) => `/users/${id}/follow`,
    UNFOLLOW: (id) => `/users/${id}/follow`,
  },
  TRACKS: {
    FEED: (type) => `/tracks/feed/${type}`,
    GET: (id, secret) => secret ? `/tracks/${id}?secret=${secret}` : `/tracks/${id}`,
    UPLOAD: '/tracks/upload',
    LIKE: (id) => `/tracks/${id}/like`,
    UNLIKE: (id) => `/tracks/${id}/like`,
    COMMENTS: (id) => `/tracks/${id}/comments`,
    ADD_COMMENT: (id) => `/tracks/${id}/comment`,
    REFRESH_URL: (id, secret) => {
      const url = `/tracks/${id}/refresh-url`;
      return secret ? `${url}?secret=${secret}` : url;
    },
  },
  SEARCH: {
    TRACKS: '/search/tracks',
    USERS: '/search/users',
  },
  NOTIFICATIONS: {
    LIST: '/notifications',
    MARK_READ: (id) => `/notifications/${id}/read`,
    MARK_ALL_READ: '/notifications/read-all',
  },
}; 