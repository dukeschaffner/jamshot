/**
 * Privacy rules implementation for Jamshot
 * Based on the privacy rules defined in app-notes.txt
 */

/**
 * Check if a user can access a track based on privacy rules
 * This is a simplified client-side version. The actual backend has more complex logic
 * involving follows and track ancestry. For full privacy enforcement, rely on the backend.
 * @param {Object} track - Track object with privacy settings
 * @param {Object} currentUser - Current authenticated user (can be null)
 * @param {string} secret - Secret token for private tracks (optional)
 * @returns {boolean} Whether the user can access the track
 */
export const canAccessTrack = (track, currentUser, secret = null) => {
  // Public tracks are always accessible
  if (!track.is_private) return true;
  
  // Track owner can always access their own tracks
  if (currentUser && track.user_id === currentUser.id) return true;
  
  // Private tracks with valid secret token
  if (secret && track.secret_token === secret) return true;
  
  // Note: The backend has more complex logic involving:
  // - Follow relationships for private user accounts
  // - Track ancestry for secret token validation
  // - Parent track privacy inheritance
  
  // Private tracks are not accessible to other users without secret
  return false;
};

/**
 * Check if a user can collaborate on a track
 * @param {Object} track - Track object with privacy settings
 * @param {Object} currentUser - Current authenticated user
 * @returns {boolean} Whether the user can collaborate
 */
export const canCollaborateOnTrack = (track, currentUser) => {
  // Must be able to access the track first
  if (!canAccessTrack(track, currentUser)) return false;
  
  // Public tracks allow collaboration from anyone
  if (!track.is_private) return true;
  
  // Private tracks only allow collaboration from owner
  return currentUser && track.user_id === currentUser.id;
};

/**
 * Check if a user can see another user's tracks in lists
 * @param {Object} targetUser - User whose tracks are being viewed
 * @param {Object} currentUser - Current authenticated user (can be null)
 * @returns {boolean} Whether the current user can see the target user's tracks
 */
export const canSeeUserTracks = (targetUser, currentUser) => {
  // Public users' tracks are always visible
  if (!targetUser.is_private) return true;
  
  // Private users' tracks are only visible to authenticated followers
  if (!currentUser) return false;
  
  // Users can always see their own tracks
  if (currentUser.id === targetUser.id) return true;
  
  // Check if current user is following the target user
  // This would need to be implemented based on your follow relationship logic
  // For now, we'll assume this check is done elsewhere
  return false;
};

/**
 * Check if a track can be made private
 * @param {Object} track - Track object
 * @returns {boolean} Whether the track can be made private
 */
export const canMakeTrackPrivate = (track) => {
  // Tracks cannot go from public to private if they have collabs
  // This is a business rule from app-notes.txt
  if (track.layer > 0) {
    // This track is a collaboration, so it inherits privacy from parent
    return false;
  }
  
  // Original tracks can be made private if they have no collaborations
  return true;
};

/**
 * Get the effective privacy status of a track
 * @param {Object} track - Track object
 * @param {Object} parentTrack - Parent track object (if this is a collaboration)
 * @returns {string} 'public' or 'private'
 */
export const getEffectivePrivacy = (track, parentTrack = null) => {
  // If this is a collaboration, it inherits privacy from parent
  if (track.parent_track_id && parentTrack) {
    return parentTrack.is_private ? 'private' : 'public';
  }
  
  // Original tracks have their own privacy setting
  return track.is_private ? 'private' : 'public';
};

/**
 * Check if a user can view a user's profile
 * @param {Object} targetUser - User whose profile is being viewed
 * @param {Object} currentUser - Current authenticated user (can be null)
 * @returns {boolean} Whether the current user can view the profile
 */
export const canViewProfile = (targetUser, currentUser) => {
  // Public profiles are always viewable
  if (!targetUser.is_private) return true;
  
  // Users can always view their own profile
  if (currentUser && currentUser.id === targetUser.id) return true;
  
  // Private profiles are not viewable to others
  return false;
};

/**
 * Filter tracks based on privacy rules for a user
 * @param {Array} tracks - Array of track objects
 * @param {Object} currentUser - Current authenticated user (can be null)
 * @returns {Array} Filtered array of tracks the user can access
 */
export const filterTracksByPrivacy = (tracks, currentUser) => {
  return tracks.filter(track => {
    // Check if user can access this track
    return canAccessTrack(track, currentUser);
  });
};

/**
 * Filter users based on privacy rules
 * @param {Array} users - Array of user objects
 * @param {Object} currentUser - Current authenticated user (can be null)
 * @returns {Array} Filtered array of users the current user can see
 */
export const filterUsersByPrivacy = (users, currentUser) => {
  return users.filter(user => {
    return canViewProfile(user, currentUser);
  });
}; 