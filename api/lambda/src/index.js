import { createRequire } from 'module';
const require = createRequire(import.meta.url);

import { toNodeHandler } from 'better-auth/node';
import { auth } from '../auth.js';
import userRoutes from './routes/users.js';
import trackRoutes from './routes/tracks.js';
import notificationRoutes from './routes/notifications.js';
import tagRoutes from './routes/tags.js';
import searchRoutes from './routes/search.js';
import paymentRoutes from './routes/payments.js';
import contactRoutes from './routes/contact.js';
import analyticsRoutes from './routes/analytics.js';
import competitionRoutes from './routes/competitions.js';
import releaseNotesRoutes from './routes/releaseNotes.js';
import campRoutes from './routes/camps.js';
import teamRoutes from './routes/teams.js';
import groupRoutes from './routes/groups.js';
import landingRoutes from './routes/landing.js';
import featureFlagsRoutes from './routes/featureFlags.js';
// TEMP: Temporary logging endpoint - remove after debugging token refresh issues
import loggingRoutes from './routes/logging.js';

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { globalLimiter, speedLimiter } = require('./middleware/rateLimiting.cjs');
const { bodyParser } = require('./middleware/bodyParser.cjs');
require('dotenv').config();


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

// Apply global rate limiting first (before CORS and other middleware)
app.use(globalLimiter);
app.use(speedLimiter);


// CORS configuration for API Gateway
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow local development
    if (origin === 'http://localhost:3000' || 
        origin === 'http://localhost:8081' || 
        origin === 'http://localhost:5173' || 
        process.env.NODE_ENV === 'dev') {
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
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
  credentials: true // Allow cookies to be sent
};

app.use(cors(corsOptions));

app.all("/api/auth/*", toNodeHandler(auth));

if (process.env.NODE_ENV === 'dev') {
  app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
} else { // CORS configured in API Gateway
  // Body parser middleware to handle Buffer objects from API Gateway
  app.use(bodyParser);
}

// Cookie parser middleware (must come before CSRF)
app.use(cookieParser());

// TEMP: Temporary logging endpoint (only in dev/test) - register before CSRF protection
// This is a temporary debugging endpoint, so we bypass CSRF for convenience
// Remove after debugging token refresh issues
const env = process.env.NODE_ENV || 'development';
if (env === 'dev' || env === 'test' || env === 'development') {
  app.use('/api/logging', loggingRoutes);
}

// Routes
app.use('/api/tracks', trackRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/competitions', competitionRoutes);
app.use('/api/release-notes', releaseNotesRoutes);
app.use('/api/camps', campRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api', landingRoutes);
app.use('/api/feature-flags', featureFlagsRoutes);

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

export default app;