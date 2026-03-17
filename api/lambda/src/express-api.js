
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
import adminRoutes from './routes/admin.js';


import express from 'express';
import cors from 'cors';
import { bodyParser } from './middleware/bodyParser.js';
import { asyncContextMiddleware } from './middleware/asyncContext.js';
import { requestLoggerMiddleware } from './middleware/requestLogger.js';
import { pluginMetaMiddleware } from './middleware/pluginMeta.js';
import { logger } from './utils/logger.js';


const app = express();

// Trust proxy for accurate IP detection (required for API Gateway/Lambda)
// Set to 1 to trust only the immediate proxy (API Gateway)
app.set('trust proxy', 1);

app.use(pluginMetaMiddleware);

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
        origin === 'https://test.sterio.fm' ||
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

// Helper function to get stage prefix based on environment
const getStagePrefix = () => {
  const env = process.env.NODE_ENV;
  if (env === 'test') return '/test';
  if (env === 'production') return '/prod';
  return ''; // No prefix for dev/staging/other environments
};


// Register Better Auth routes with conditional stage prefix
const stagePrefix = getStagePrefix();


if (process.env.NODE_ENV === 'dev') {
  app.use(`${stagePrefix}/api/payments/webhook`, express.raw({ type: 'application/json' }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));
} else { // CORS configured in API Gateway
  // Body parser middleware to handle Buffer objects from API Gateway
  app.use(bodyParser);
}

// Set up async local storage context with correlation ID and user ID
app.use(asyncContextMiddleware);

// Request logger middleware to log all HTTP requests
app.use(requestLoggerMiddleware);

// Register routes with conditional stage prefix
app.use(`${stagePrefix}/api/tracks`, trackRoutes);
app.use(`${stagePrefix}/api/users`, userRoutes);
app.use(`${stagePrefix}/api/tags`, tagRoutes);
app.use(`${stagePrefix}/api/notifications`, notificationRoutes);
app.use(`${stagePrefix}/api/search`, searchRoutes);
app.use(`${stagePrefix}/api/payments`, paymentRoutes);
app.use(`${stagePrefix}/api/contact`, contactRoutes);
app.use(`${stagePrefix}/api/analytics`, analyticsRoutes);
app.use(`${stagePrefix}/api/competitions`, competitionRoutes);
app.use(`${stagePrefix}/api/release-notes`, releaseNotesRoutes);
app.use(`${stagePrefix}/api/camps`, campRoutes);
app.use(`${stagePrefix}/api/teams`, teamRoutes);
app.use(`${stagePrefix}/api/groups`, groupRoutes);
app.use(`${stagePrefix}/api`, landingRoutes);
app.use(`${stagePrefix}/api/feature-flags`, featureFlagsRoutes);
app.use(`${stagePrefix}/api/admin`, adminRoutes);

// Health check endpoint
app.get('/', (req, res) => {
  console.log('Health check endpoint hit:', req.path, req.method);
  res.json({ status: 'ok', service: 'Sterio API', environment: process.env.NODE_ENV || 'development' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    route: req.originalUrl,
    method: req.method,
    userId: req.user?.id,
    correlationId: req.correlationId,
  });

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      error: 'CORS policy violation',
      correlationId: req.correlationId,
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    correlationId: req.correlationId,
  });
});

export default app;