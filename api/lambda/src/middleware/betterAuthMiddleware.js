import { fromNodeHeaders } from 'better-auth/node';
import { auth } from '../../auth.js';

/**
 * Better Auth middleware - Required authentication
 * Ensures user is authenticated and adds user object to req.user
 * Backwards compatible with legacy auth middleware
 */
export const betterAuthMiddleware = async (req, res, next) => {
  // Skip authentication for OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    return next();
  }

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      return res.status(401).json({
        error: 'Authentication required',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }



    // If profile is not completed and route is not allowed, remove authentication
    if (session.profile_completed !== true) {
      // Get the request path (remove query string if present)
      // Use originalUrl for full path, fallback to path or url
      const fullPath = req.originalUrl?.split('?')[0] || req.path || req.url?.split('?')[0] || '';

      
      // Define allowed routes that don't require profile completion
      // Routes are mounted at /api/users, so paths include /api prefix
      const stagePrefix = process.env.NODE_ENV === 'test' ? '/test' : process.env.NODE_ENV === 'prod' ? '/prod' : '';
      const allowedPaths = [
        '/api/users/me',
        '/api/users/me/complete-profile',
        '/users/me', // Also check without /api prefix for flexibility
        '/users/me/complete-profile',
        ...(stagePrefix ? [
          `${stagePrefix}/api/users/me`,
          `${stagePrefix}/api/users/me/complete-profile`,
          `${stagePrefix}/users/me`,
          `${stagePrefix}/users/me/complete-profile`,
        ] : []),
      ];
      
      // Check if the path matches any allowed route (exact match or starts with allowed path)
      const isAllowedRoute = allowedPaths.some(allowedPath => 
        fullPath === allowedPath || fullPath.startsWith(allowedPath + '/')
      );

      if (!isAllowedRoute) {
        // Wipe user from request to ensure request is not authenticated
        req.user = null;
        req.session = null;
        
        return res.status(401).json({
          error: 'Profile completion required',
          code: 'PROFILE_INCOMPLETE',
          message: 'Please complete your profile before accessing this resource'
        });
      }
    }

    // Add user to request object for backwards compatibility
    // Map Better Auth user structure to match legacy format if needed
    req.user = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      username: session.user.username,
      emailVerified: session.user.emailVerified,
      image: session.user.image,
      // Include any additional fields from Better Auth user
      ...session.user
    };

    // Also attach session for potential future use
    req.session = session.session;

    next();
  } catch (error) {
    console.error('Better Auth middleware error:', error);
    return res.status(401).json({
      error: 'Authentication failed',
      code: 'AUTHENTICATION_FAILED'
    });
  }
};

/**
 * Better Auth optional middleware - Optional authentication
 * Extracts user if session exists but doesn't require authentication
 * Backwards compatible with legacy optionalAuthMiddleware
 */
export const optionalBetterAuthMiddleware = async (req, res, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (session && session.user) {
      // Add user to request object for backwards compatibility
      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        username: session.user.username,
        emailVerified: session.user.emailVerified,
        image: session.user.image,
        // Include any additional fields from Better Auth user
        ...session.user
      };

      // Also attach session for potential future use
      req.session = session.session;
    } else {
      // No session found, but continue anyway (optional auth)
      req.user = null;
      req.session = null;
    }
  } catch (error) {
    // Invalid session or error, but we don't fail the request
    console.warn('Optional Better Auth middleware warning:', error.message);
    req.user = null;
    req.session = null;
  }

  // Always continue to the next middleware
  next();
};

