import path from 'node:path';
import { ENV_DIR, loadDevEnv } from '@sterio/dev-env';

/** Absolute path to the shared local env file. */
export const API_ENV_PATH = path.join(ENV_DIR, '.env.dev');

/**
 * Load the shared repo env (env/.env.dev + overlays) before any DB/R2 clients initialize.
 */
export function loadApiEnv() {
  const result = loadDevEnv();
  return result.files[0] || API_ENV_PATH;
}
