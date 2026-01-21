import express from 'express';

const router = express.Router();
import { getAllFeatureFlags } from '../utils/featureFlags.js';

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

export default router;

