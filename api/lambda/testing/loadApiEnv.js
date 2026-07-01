import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Absolute path to api/lambda/.env */
export const API_ENV_PATH = path.resolve(__dirname, '../.env');

/**
 * Load api/lambda/.env before any DB/R2 clients initialize.
 */
export function loadApiEnv() {
  if (!fs.existsSync(API_ENV_PATH)) {
    throw new Error(`API .env not found at ${API_ENV_PATH}`);
  }

  const result = dotenv.config({ path: API_ENV_PATH });
  if (result.error) {
    throw new Error(`Failed to load ${API_ENV_PATH}: ${result.error.message}`);
  }

  return API_ENV_PATH;
}
