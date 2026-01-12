/**
 * Error message mappings for authentication and OAuth errors
 * Maps error codes to user-friendly display messages
 */

// Error code to message mapping
const errorMessages = {
  // OAuth callback errors
  'please_restart_the_process': 'Please restart the sign-up process. The OAuth session may have expired.',
  'invalid_callback_request': 'Invalid OAuth callback. Please try signing in again.',
  'state_not_found': 'OAuth session expired. Please try signing in again.',
  'no_code': 'OAuth authorization failed. Please try signing in again.',
  'no_callback_url': 'OAuth callback URL missing. Please try signing in again.',
  'oauth_provider_not_found': 'OAuth provider not found. Please try signing in again.',
  'unable_to_get_user_info': 'Unable to retrieve user information from Google. Please try again.',
  'state_mismatch': 'OAuth state mismatch. Please try signing in again.',
  'email_already_registered': 'This email is already registered. Please sign in instead.',
  'email_is_already_registered': 'This email is already registered. Please sign in instead.',
  'signup_disabled': 'Sign up is not allowed on this page. Join the waitlist to get early access.',

  // Generic fallback
  'unknown_error': 'An error occurred during sign-up. Please try again.',
};

/**
 * Get a user-friendly error message from an error code
 * @param {string} errorCode - The error code from the URL or API response
 * @returns {string} - User-friendly error message
 */
function getErrorMessage(errorCode) {
  if (!errorCode) {
    return errorMessages['unknown_error'];
  }

  return errorMessages[errorCode] || `An unexpected error occurred: ${errorCode}`;
}

/**
 * Get all available error codes for reference
 * @returns {Object} - All error code mappings
 */
function getAllErrorMessages() {
  return { ...errorMessages };
}

const UI_EXPORTS = [
  getErrorMessage,
  getAllErrorMessages,
];
