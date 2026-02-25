import express from 'express';

const router = express.Router();
import { getAllFeatureFlags } from '../utils/featureFlags.js';

/**
 * Feature Flags API Routes
 * Provides endpoints to retrieve feature flags
 */

// Get all feature flags (public endpoint, no auth required)
router.get('/', async (req, res, next) => {
  try {
    const flags = await getAllFeatureFlags();
    res.json(flags);
  } catch (err) {
    next(err);
  }
});

export default router;

