import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pool = require('../config/db.cjs');

/**
 * Middleware to check if user profile is complete
 * Blocks API usage for users who haven't completed their profile (DOB and terms acceptance)
 * Allows certain routes to bypass this check (e.g., completing profile, checking profile status)
 */
export const profileCompletionMiddleware = async (req, res, next) => {
  // Skip check for OPTIONS requests
  if (req.method === 'OPTIONS') {
    return next();
  }

  // Skip check if user is not authenticated (handled by betterAuthMiddleware)
  if (!req.user || !req.user.id) {
    return next();
  }

  // Routes that should be accessible even with incomplete profile
  // Format: { path: string, method?: string } - if method is specified, only that method is allowed
  // Note: paths are relative to the router mount point (e.g., /me not /users/me)
  const allowedRoutes = [
    { path: '/me', method: 'GET' }, // Allow checking profile status (GET only)
    { path: '/me/complete-profile' }, // Allow completing profile (all methods)
  ];

  // Check if current path is in allowed list
  const isAllowedPath = allowedRoutes.some(route => {
    // Check if path matches exactly or starts with the route path followed by /
    const pathMatches = req.path === route.path || 
                        (route.path !== '/' && req.path.startsWith(route.path + '/'));
    if (!pathMatches) return false;
    
    // If method is specified, check it matches
    if (route.method) {
      return req.method === route.method;
    }
    
    return true;
  });

  if (isAllowedPath) {
    return next();
  }

  try {
    // Check if user has completed profile
    const userResult = await pool.query(
      'SELECT date_of_birth, terms_accepted, privacy_policy_accepted FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Check if profile is incomplete
    if (!user.date_of_birth || !user.terms_accepted || !user.privacy_policy_accepted) {
      return res.status(403).json({
        error: 'Profile incomplete',
        code: 'PROFILE_INCOMPLETE',
        message: 'Please complete your profile by providing your date of birth and accepting the terms of service and privacy policy.',
        requiresCompletion: true
      });
    }

    // Profile is complete, continue
    next();
  } catch (error) {
    console.error('Profile completion middleware error:', error);
    return res.status(500).json({
      error: 'Failed to verify profile completion',
      code: 'PROFILE_CHECK_FAILED'
    });
  }
};

