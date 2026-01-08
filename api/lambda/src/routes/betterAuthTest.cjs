const express = require('express');
const router = express.Router();

let betterAuthMiddleware, optionalBetterAuthMiddleware;

// Load middleware on module initialization
(async () => {
  try {
    const middleware = await import('../middleware/betterAuthMiddleware.js');
    betterAuthMiddleware = middleware.betterAuthMiddleware;
    optionalBetterAuthMiddleware = middleware.optionalBetterAuthMiddleware;
  } catch (error) {
    console.error('Failed to load Better Auth middleware:', error);
  }
})();

const loadMiddlewareIfNeeded = async () => {
  if (!betterAuthMiddleware || !optionalBetterAuthMiddleware) {
    const middleware = await import('../middleware/betterAuthMiddleware.js');
    betterAuthMiddleware = middleware.betterAuthMiddleware;
    optionalBetterAuthMiddleware = middleware.optionalBetterAuthMiddleware;
  }
};

const createTestHandler = (isOptional = false) => {
  return async (req, res) => {
    await loadMiddlewareIfNeeded();
    
    const selectedMiddleware = isOptional ? optionalBetterAuthMiddleware : betterAuthMiddleware;
    
    return selectedMiddleware(req, res, () => {
      console.log(`Better Auth ${isOptional ? 'Optional' : 'Required'} Test - User:`, req.user?.id || 'none');
      
      res.json({
        success: true,
        user: req.user,
        session: req.session ? {
          id: req.session.id,
          expiresAt: req.session.expiresAt,
        } : null,
        authenticated: !!req.user,
      });
    });
  };
};

router.get('/required', createTestHandler(false));
router.get('/optional', createTestHandler(true));

module.exports = router;

