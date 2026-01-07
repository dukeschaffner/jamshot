const express = require('express');
const router = express.Router();
const { getAllFeatureFlags } = require('../utils/featureFlags.cjs');

/**
 * Feature Flags API Routes
 * Provides endpoints to retrieve feature flags
 */

// Get all feature flags (public endpoint, no auth required)
router.get('/', async (req, res) => {
  try {
    const flags = await getAllFeatureFlags();
    res.json(flags);
  } catch (err) {
    console.error('Error fetching feature flags:', err);
    res.status(500).json({ error: 'Failed to fetch feature flags' });
  }
});

module.exports = router;

