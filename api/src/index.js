const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const trackRoutes = require('./routes/tracks');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
    origin: 'http://localhost:3000', // Allow only this origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed methods
    allowedHeaders: ['Content-Type', 'Authorization'], // Allowed headers
  }));

app.use(express.json()); // Parse JSON bodies

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tracks', trackRoutes);

app.get('/', (req, res) => res.send('Music Collab API'));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));