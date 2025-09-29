const crypto = require('crypto');

// Generate a secure CSRF token
const generateCSRFToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Middleware to generate and set CSRF token
const setCSRFToken = (req, res, next) => {
  // Only set CSRF token if user is authenticated
  if (req.user) {
    const csrfToken = generateCSRFToken();
    
    // Set CSRF token in cookie (HttpOnly: false so client can read it)
    res.cookie('csrfToken', csrfToken, {
      httpOnly: false, // Client needs to read this
      secure: process.env.NODE_ENV === 'production', // HTTPS only in production
      sameSite: 'strict',
      maxAge: 60 * 60 * 1000 // 1 hour
    });
    
    // Also make it available in response headers for SPA
    res.set('X-CSRF-Token', csrfToken);
  }
  
  next();
};

// Middleware to validate CSRF token
const validateCSRFToken = (req, res, next) => {
  // Skip CSRF validation for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip CSRF validation for unauthenticated requests
  if (!req.user) {
    return next();
  }
  
  const tokenFromHeader = req.get('X-CSRF-Token');
  const tokenFromCookie = req.cookies.csrfToken;
  
  // Check if both tokens exist
  if (!tokenFromHeader || !tokenFromCookie) {
    return res.status(403).json({ 
      error: 'CSRF token missing',
      code: 'CSRF_TOKEN_MISSING'
    });
  }
  
  // Validate tokens match (double-submit cookie pattern)
  if (tokenFromHeader !== tokenFromCookie) {
    return res.status(403).json({ 
      error: 'CSRF token mismatch',
      code: 'CSRF_TOKEN_MISMATCH'
    });
  }
  
  next();
};

// Combined middleware that sets token on auth and validates on subsequent requests
const csrfProtection = (req, res, next) => {
  // First, validate existing token if this is a state-changing request
  validateCSRFToken(req, res, (err) => {
    if (err) return next(err);
    
    // Then set a new token for the response
    setCSRFToken(req, res, next);
  });
};

module.exports = {
  generateCSRFToken,
  setCSRFToken,
  validateCSRFToken,
  csrfProtection
}; 