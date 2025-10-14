const jwt = require('jsonwebtoken');
require('dotenv').config();

const authMiddleware = (req, res, next) => {
  // Skip authentication for OPTIONS requests (CORS preflight)
  if (req.method === 'OPTIONS') {
    return next();
  }

  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({
    error: 'No token provided',
    code: 'NO_TOKEN_PROVIDED'
  });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user ID to request
    next();
  } catch (err) {
    // Instead of immediately returning 401, check if it's a token expiration
    if (err.name === 'TokenExpiredError') {
      // Set a flag that can be used by the client to know it should try refreshing
      return res.status(401).json({ 
        error: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    res.status(401).json({ 
      error: 'Invalid token',
      code: 'INVALID_TOKEN'
    });
  }
};

// Optional authentication middleware - doesn't require auth but extracts user if token exists
const optionalAuthMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  
  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = decoded; // Attach user ID to request
    } catch (err) {
      // Invalid token, but we don't fail the request
      console.warn('Invalid token in optional auth:', err.message);
    }
  }
  
  next(); // Always continue to the next middleware
};

module.exports = { authMiddleware, optionalAuthMiddleware };