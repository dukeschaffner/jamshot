# Jamshot Shared Utilities

This package contains shared utilities, types, and business logic that can be used across both the web and mobile platforms of Jamshot.

## Structure

```
shared/
├── api/
│   └── index.js          # Platform-agnostic API client
├── types/
│   └── index.js          # Type definitions and constants
├── utils/
│   ├── privacy.js        # Privacy rule implementation
│   ├── validation.js     # Form validation utilities
│   ├── formatting.js     # Data formatting utilities
│   └── audio.js          # Audio processing utilities
├── index.js              # Main export file
└── package.json          # Package configuration
```

## Usage

### Web App (Next.js)

```javascript
import { 
  createApiClient, 
  createApiMethods,
  formatDuration, 
  validateEmail,
  canAccessTrack,
  AUDIO_CONSTANTS 
} from '../shared/index.js';

// Create API client with web-specific token management
const api = createApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  getToken: () => Cookies.get('accessToken'),
  setToken: (token) => Cookies.set('accessToken', token),
  removeToken: () => Cookies.remove('accessToken'),
  getRefreshToken: () => Cookies.get('refreshToken'),
  setRefreshToken: (token) => Cookies.set('refreshToken', token),
  removeRefreshToken: () => Cookies.remove('refreshToken'),
  getCsrfToken: () => Cookies.get('csrfToken'),
  setCsrfToken: (token) => Cookies.set('csrfToken', token),
  removeCsrfToken: () => Cookies.remove('csrfToken'),
  setAuthError: (message) => sessionStorage.setItem('authError', message),
  redirectToLogin: () => window.location.href = '/login',
  refreshUserState: () => {/* Update user context */},
  withCredentials: true,
});

// Create API methods using shared implementation
const {
  trackApi,
  userApi,
  authApi,
  searchApi,
  notificationApi,
} = createApiMethods(api);

// Use API methods
const tracks = await trackApi.getFeed('for-you', 1);
const user = await userApi.getCurrentUser();
```

### Mobile App (React Native)

```javascript
import { 
  createApiClient, 
  createApiMethods,
  formatDuration, 
  validateEmail,
  canAccessTrack,
  AUDIO_CONSTANTS 
} from '../shared/index.js';

// Create API client with mobile-specific token management
const api = createApiClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL,
  getToken: () => AsyncStorage.getItem('accessToken'),
  setToken: (token) => AsyncStorage.setItem('accessToken', token),
  removeToken: () => AsyncStorage.removeItem('accessToken'),
  getRefreshToken: () => AsyncStorage.getItem('refreshToken'),
  setRefreshToken: (token) => AsyncStorage.setItem('refreshToken', token),
  removeRefreshToken: () => AsyncStorage.removeItem('refreshToken'),
  setAuthError: (message) => {/* Handle auth error */},
  redirectToLogin: () => {/* Navigate to login */},
  refreshUserState: () => {/* Update user context */},
  withCredentials: false,
});

// Create API methods using shared implementation
const {
  trackApi,
  userApi,
  authApi,
  searchApi,
  notificationApi,
} = createApiMethods(api);

// Use API methods
const tracks = await trackApi.getFeed('for-you', 1);
const user = await userApi.getCurrentUser();
```

## Available Utilities

### API Client (`createApiClient`)

Platform-agnostic API client with automatic token management and refresh handling.

**Configuration Options:**
- `baseURL`: API base URL
- `getToken`: Function to retrieve access token
- `setToken`: Function to store access token
- `removeToken`: Function to remove access token
- `getRefreshToken`: Function to get refresh token
- `setRefreshToken`: Function to set refresh token
- `removeRefreshToken`: Function to remove refresh token
- `getCsrfToken`: Function to get CSRF token (web only)
- `setCsrfToken`: Function to set CSRF token (web only)
- `removeCsrfToken`: Function to remove CSRF token (web only)
- `setAuthError`: Function to set auth error message
- `redirectToLogin`: Function to redirect to login
- `refreshUserState`: Function to refresh user state
- `withCredentials`: Whether to send cookies with requests

### API Methods (`createApiMethods`)

Consistent API methods across platforms:

**Track API:**
- `getFeed(type, page)` - Get track feed
- `getTrack(id, secret)` - Get single track
- `likeTrack(id)` - Like a track
- `unlikeTrack(id)` - Unlike a track
- `uploadTrack(formData)` - Upload new track
- `getComments(id, page, limit, parentId)` - Get track comments
- `addComment(id, content, parentCommentId)` - Add comment
- `updateComment(commentId, content)` - Update comment
- `deleteComment(commentId)` - Delete comment
- `refreshTrackUrl(id, secret)` - Refresh track URL
- `updateTrackPrivacy(id, isPrivate)` - Update track privacy

**User API:**
- `getProfile(username)` - Get user profile
- `getCurrentUser()` - Get current user
- `updateProfile(data)` - Update profile
- `updatePrivacy(isPrivate)` - Update privacy settings
- `followUser(id)` - Follow user
- `unfollowUser(id)` - Unfollow user
- `getFollowers(username, page)` - Get followers
- `getFollowing(username, page)` - Get following

**Auth API:**
- `login(email, password)` - Login
- `register(userData)` - Register
- `logout()` - Logout
- `refreshToken(refreshToken)` - Refresh token
- `forgotPassword(email)` - Forgot password
- `resetPassword(token, password)` - Reset password
- `verifyEmail(token)` - Verify email

**Search API:**
- `searchTracks(query, page)` - Search tracks
- `searchUsers(query, page)` - Search users

**Notification API:**
- `getNotifications(page)` - Get notifications
- `markAsRead(id)` - Mark notification as read
- `markAllAsRead()` - Mark all notifications as read

### Privacy Utilities

Business logic for track and user privacy rules:

- `canAccessTrack(track, currentUser, secret)`: Check if user can access a track
- `canCollaborateOnTrack(track, currentUser)`: Check if user can collaborate
- `canViewProfile(targetUser, currentUser)`: Check if user can view profile
- `filterTracksByPrivacy(tracks, currentUser)`: Filter tracks by privacy rules

### Validation Utilities

Form validation functions:

- `validateEmail(email)`: Email format validation
- `validateUsername(username)`: Username format and length validation
- `validatePassword(password)`: Password strength validation
- `validateTrackTitle(title)`: Track title validation
- `validateBPM(bpm)`: BPM range validation
- `validateTimeSignature(timeSignature)`: Time signature validation

### Formatting Utilities

Data formatting functions:

- `formatDuration(seconds, precision)`: Format seconds to MM:SS
- `formatTimeAgo(dateString)`: Format relative time
- `formatPlayCount(count)`: Format play counts with K/M suffixes
- `formatFileSize(bytes)`: Format file sizes
- `truncateText(text, maxLength)`: Truncate text with ellipsis

### Audio Utilities

Audio processing functions:

- `audioBufferToWav(buffer, sampleRate)`: Convert AudioBuffer to WAV
- `calculateRMS(audioData)`: Calculate RMS of audio data
- `calculatePeak(audioData)`: Calculate peak amplitude
- `normalizeAudio(audioData, targetPeak)`: Normalize audio data
- `applyFades(audioData, fadeInDuration, fadeOutDuration)`: Apply fades

### Constants

Shared constants and types:

- `AUDIO_CONSTANTS`: Audio-related constants (BPM, time signatures, etc.)
- `SUBSCRIPTION_TIERS`: Subscription tier definitions
- `UPLOAD_LIMITS`: Upload limits per subscription tier
- `FEED_TYPES`: Feed type definitions
- `API_ENDPOINTS`: API endpoint definitions

## Installation

The shared package is included as a local dependency in the monorepo. To use it:

1. **Web App**: Add to `ui/package.json`:
   ```json
   {
     "dependencies": {
       "@jamshot/shared": "file:../shared"
     }
   }
   ```

2. **Mobile App**: Add to `mobile/package.json`:
   ```json
   {
     "dependencies": {
       "@jamshot/shared": "file:../shared"
     }
   }
   ```

## Development

To test the shared utilities:

```bash
cd shared
npm test
```

## Benefits

- **Code Reuse**: 70%+ of business logic is shared between platforms
- **Consistency**: Same validation rules, privacy logic, and formatting across platforms
- **Maintenance**: Bug fixes and features benefit both platforms
- **Type Safety**: Shared type definitions ensure consistency
- **Performance**: Optimized utilities that work on both platforms 