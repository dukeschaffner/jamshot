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
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

// Apply global rate limiting first (before CORS and other middleware)
app.use(globalLimiter);
app.use(speedLimiter);

app.use(cors({
  origin: (origin, callback) => {
    // Allow local development
    if (!origin || origin === 'http://localhost:3000' || origin === 'http://localhost:8081' || process.env.NODE_ENV === 'test') {
      return callback(null, true);
    }
    // Allow any Vercel deployment under your project
    if (origin.startsWith('https://jamshot-') && origin.endsWith('-duke-schaffners-projects.vercel.app')) {
      return callback(null, true);
    }

    if (origin === 'https://main.d3cx888lrkmdbn.amplifyapp.com') {
      return callback(null, true);
    }

    if (origin === 'https://sterio.fm') {
      return callback(null, true);
    }
    // Deny other origins
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true // Allow cookies to be sent
}));

// Cookie parser middleware (must come before CSRF)
app.use(cookieParser());

// Special handling for Stripe webhook
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Regular JSON parsing for all other routes
app.use(express.json());

// Apply CSRF protection globally (after auth middleware in routes)
app.use(csrfProtection);

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

app.get('/', (req, res) => res.send('Music Collab API'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));