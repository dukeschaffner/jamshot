import express from 'express';
import { requireProjectsFeature } from '../middleware/projectsFeatureMiddleware.js';

const router = express.Router();

router.use(requireProjectsFeature);

// Stub list endpoint — expanded in Step 6
router.get('/', async (req, res, next) => {
  try {
    res.json({ projects: [] });
  } catch (err) {
    next(err);
  }
});

export default router;
