import { createApiPool } from '@sterio/db-config';

/**
 * Database configuration for Lambda API
 * Uses shared configuration package with error handling and graceful shutdown
 */
const pool = createApiPool();

export default pool;