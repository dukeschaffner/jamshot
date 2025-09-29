const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

// Global API rate limiting - protects against DDoS
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    error: 'Too many requests from this IP',
    message: 'Please try again later',
    retryAfter: 15 * 60 // 15 minutes in seconds
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP',
      message: 'Please try again later',
      retryAfter: 15 * 60
    });
  }
});

// Authentication rate limiting - prevents brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 authentication attempts per windowMs
  message: {
    error: 'Too many authentication attempts',
    message: 'Please try again in 15 minutes',
    retryAfter: 15 * 60
  },
  skipSuccessfulRequests: true, // Don't count successful requests
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many authentication attempts',
      message: 'Please try again in 15 minutes',
      retryAfter: 15 * 60
    });
  }
});

// Strict authentication rate limiting for failed attempts
const strictAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 failed attempts per hour
  message: {
    error: 'Account temporarily locked',
    message: 'Too many failed login attempts. Please try again in 1 hour',
    retryAfter: 60 * 60
  },
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Account temporarily locked',
      message: 'Too many failed login attempts. Please try again in 1 hour',
      retryAfter: 60 * 60
    });
  }
});

// Content creation rate limiting - prevents spam
const contentCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // Limit each IP to 50 content creation requests per hour
  message: {
    error: 'Content creation limit exceeded',
    message: 'Please wait before creating more content',
    retryAfter: 60 * 60
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Content creation limit exceeded',
      message: 'Please wait before creating more content',
      retryAfter: 60 * 60
    });
  }
});

// File upload rate limiting - more restrictive for resource-intensive operations
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: {
    error: 'Upload limit exceeded',
    message: 'Please wait before uploading more files',
    retryAfter: 60 * 60
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Upload limit exceeded',
      message: 'Please wait before uploading more files',
      retryAfter: 60 * 60
    });
  }
});

// User interaction rate limiting - prevents automated abuse
const interactionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 200, // Limit each IP to 200 interactions per hour (likes, follows, etc.)
  message: {
    error: 'Interaction limit exceeded',
    message: 'Please slow down your activity',
    retryAfter: 60 * 60
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Interaction limit exceeded',
      message: 'Please slow down your activity',
      retryAfter: 60 * 60
    });
  }
});

// Search rate limiting - prevents search abuse
const searchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // Limit each IP to 100 searches per hour
  message: {
    error: 'Search limit exceeded',
    message: 'Please wait before searching again',
    retryAfter: 60 * 60
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Search limit exceeded',
      message: 'Please wait before searching again',
      retryAfter: 60 * 60
    });
  }
});

// Password reset rate limiting - prevents abuse of password reset functionality
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // Limit each IP to 3 password reset attempts per hour
  message: {
    error: 'Password reset limit exceeded',
    message: 'Please wait before requesting another password reset',
    retryAfter: 60 * 60
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Password reset limit exceeded',
      message: 'Please wait before requesting another password reset',
      retryAfter: 60 * 60
    });
  }
});

// Email verification rate limiting
const emailVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 email verification requests per hour
  message: {
    error: 'Email verification limit exceeded',
    message: 'Please wait before requesting another verification email',
    retryAfter: 60 * 60
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Email verification limit exceeded',
      message: 'Please wait before requesting another verification email',
      retryAfter: 60 * 60
    });
  }
});

// Progressive delay middleware for repeated requests
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000, // 15 minutes
  delayAfter: 100, // Allow 100 requests per 15 minutes without delay
  delayMs: () => 500, // Add 500ms delay per request after delayAfter (updated syntax)
  maxDelayMs: 10000, // Maximum delay of 10 seconds
});

// Contact form rate limiting - prevents spam
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 contact form submissions per hour
  message: {
    error: 'Contact form limit exceeded',
    message: 'Please wait before submitting another message',
    retryAfter: 60 * 60
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Contact form limit exceeded',
      message: 'Please wait before submitting another message',
      retryAfter: 60 * 60
    });
  }
});

// API endpoint rate limiting for high-frequency operations
const apiEndpointLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per minute for API endpoints
  message: {
    error: 'API rate limit exceeded',
    message: 'Please slow down your requests',
    retryAfter: 60
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'API rate limit exceeded',
      message: 'Please slow down your requests',
      retryAfter: 60
    });
  }
});

module.exports = {
  globalLimiter,
  authLimiter,
  strictAuthLimiter,
  contentCreationLimiter,
  uploadLimiter,
  interactionLimiter,
  searchLimiter,
  passwordResetLimiter,
  emailVerificationLimiter,
  speedLimiter,
  contactLimiter,
  apiEndpointLimiter
}; 