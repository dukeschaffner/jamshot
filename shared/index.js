/**
 * Shared utilities for Jamshot
 * Exports all shared functionality for web and mobile platforms
 * * Gets manually copied/synced between the web and mobile apps by a python script
 */

// API utilities
export { createApiClient, createApiMethods } from './api/index.js';

// Types and constants
export * from './types/index.js';

// Formatting utilities
export * from './utils/formatting.js';