const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { csrfProtection } = require('./middleware/csrf');
const { globalLimiter, speedLimiter } = require('./middleware/rateLimiting');
const authRoutes = require('./routes/auth');
const trackRoutes = require('./routes/tracks');
const userRoutes = require('./routes/users');
const tagRoutes = require('./routes/tags');
const notificationRoutes = require('./routes/notifications');
const searchRoutes = require('./routes/search');
const paymentRoutes = require('./routes/payments');
const contactRoutes = require('./routes/contact');
const analyticsRoutes = require('./routes/analytics');
const competitionRoutes = require('./routes/competitions');
require('dotenv').config();

// Middleware to log body stream readability
const logBodyStreamStatus = (stage) => (req, res, next) => {
  const readable = req.body && typeof req.body.pipe === 'function' ? req.body.readable : 'N/A (not a stream)';
  const bodyType = typeof req.body;
  const contentType = req.headers['content-type'];
  console.log(`[${stage}] Body stream readable: ${readable}, body type: ${bodyType}, content-type: ${contentType}`);
  next();
};

const app = express();

// Trust proxy for accurate IP detection (required for API Gateway/Lambda)
// Set to 1 to trust only the immediate proxy (API Gateway)
app.set('trust proxy', 1);

// Handle API Gateway stage prefix stripping
app.use((req, res, next) => {
  // Common stage prefixes to strip (API Gateway adds these)
  const stages = ['test', 'prod', 'staging', 'dev'];

  for (const stage of stages) {
    const stagePrefix = `/${stage}`;
    const stagePrefixSlash = `/${stage}/`;

    if (req.path.startsWith(stagePrefixSlash)) {
      req.url = req.path.substring(stagePrefixSlash.length - 1); // Remove stage prefix, keep leading slash
      req.path = req.url;
      break; // Only strip one stage prefix
    } else if (req.path === stagePrefix) {
      req.url = '/';
      req.path = '/';
      break; // Only strip one stage prefix
    }
  }

  next();
});

// Log body stream status after stage prefix stripping
app.use(logBodyStreamStatus('After Stage Prefix Stripping'));

// Apply global rate limiting first (before CORS and other middleware)
app.use(globalLimiter);
app.use(speedLimiter);

// Log body stream status after rate limiting
app.use(logBodyStreamStatus('After Rate Limiting'));

// CORS configuration for API Gateway
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow local development
    if (origin === 'http://localhost:3000' || origin === 'http://localhost:8081' || process.env.NODE_ENV === 'dev') {
      return callback(null, true);
    }


    // Allow production domains
    if (origin === 'https://dev.d3cx888lrkmdbn.amplifyapp.com' ||
        origin === 'https://sterio.fm' ||
        origin === 'https://www.sterio.fm') {
      return callback(null, true);
    }

    // Allow API Gateway domain (when deployed)
    if (process.env.API_GATEWAY_DOMAIN && origin.includes(process.env.API_GATEWAY_DOMAIN)) {
      return callback(null, true);
    }

    // Deny other origins.
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
  credentials: true // Allow cookies to be sent
};

app.use(cors(corsOptions));

// Log body stream status after CORS
app.use(logBodyStreamStatus('After CORS'));

app.use((req, res, next) => {
  console.log('Incoming:', req.method, req.path);
  next();
});

// Log body stream status after existing logging middleware
app.use(logBodyStreamStatus('After Incoming Logging'));

// Log body stream status before Stripe webhook handling
app.use(logBodyStreamStatus('Before Stripe Webhook Handling'));

// Special handling for Stripe webhook - must come before JSON parsing
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Log body stream status after Stripe webhook handling
app.use(logBodyStreamStatus('After Stripe Webhook Handling'));

// Log body stream status before JSON parsing
app.use(logBodyStreamStatus('Before JSON Parsing'));

// Conditional JSON parsing - only parse if body hasn't been pre-parsed by serverless-express
app.use((req, res, next) => {
  // If body is already an object (parsed by serverless-express), skip JSON parsing
  if (typeof req.body === 'object' && req.body !== null) {
    console.log('Body already parsed by serverless-express, skipping express.json()');
    return next();
  }

  // Otherwise, apply JSON parsing middleware
  express.json({ limit: '50mb' })(req, res, next);
});

// Log body stream status after JSON parsing
app.use(logBodyStreamStatus('After JSON Parsing'));

// Conditional URL-encoded parsing - only parse if body hasn't been pre-parsed by serverless-express
app.use((req, res, next) => {
  // If body is already an object (parsed by serverless-express), skip URL-encoded parsing
  if (typeof req.body === 'object' && req.body !== null) {
    console.log('Body already parsed by serverless-express, skipping express.urlencoded()');
    return next();
  }

  // Otherwise, apply URL-encoded parsing middleware
  express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
});

// Log body stream status after URL-encoded parsing
app.use(logBodyStreamStatus('After URL-encoded Parsing'));

// Cookie parser middleware (must come before CSRF)
app.use(cookieParser());

// Log body stream status after cookie parsing
app.use(logBodyStreamStatus('After Cookie Parsing'));

// Apply CSRF protection globally (after auth middleware in routes)
app.use(csrfProtection);

// Log body stream status after CSRF protection
app.use(logBodyStreamStatus('After CSRF Protection'));

// Log body stream status before routes
app.use(logBodyStreamStatus('Before Routes'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/competitions', competitionRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  console.log('Health check endpoint hit:', req.path, req.method);
  res.json({ status: 'ok', service: 'Sterio API', environment: process.env.NODE_ENV || 'development' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

// Export the app for Lambda
module.exports = app;