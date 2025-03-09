const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const trackRoutes = require('./routes/tracks');
const userRoutes = require('./routes/users');
const tagRoutes = require('./routes/tags');
const notificationRoutes = require('./routes/notifications');
const searchRoutes = require('./routes/search');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin: (origin, callback) => {
    // Allow local development
    if (!origin || origin === 'http://localhost:3000') {
      return callback(null, true);
    }
    // Allow any Vercel deployment under your project
    if (origin.startsWith('https://jamshot-') && origin.endsWith('-duke-schaffners-projects.vercel.app')) {
      return callback(null, true);
    }
    // Deny other origins
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json()); // Parse JSON bodies

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tracks', trackRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tags', tagRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/search', searchRoutes);

app.get('/', (req, res) => res.send('Music Collab API'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));