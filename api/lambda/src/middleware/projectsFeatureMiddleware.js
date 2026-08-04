import { isFeatureEnabled } from '../utils/featureFlags.js';

/**
 * Gate all /projects/* routes behind the projects feature flag.
 * Returns 404 when disabled (feature appears unavailable).
 */
export async function requireProjectsFeature(req, res, next) {
  const enabled = await isFeatureEnabled('projects', false);
  if (!enabled) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}
