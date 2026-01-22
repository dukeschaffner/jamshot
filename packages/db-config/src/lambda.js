import { Pool } from 'pg';

/**
 * Creates a PostgreSQL pool optimized for Lambda functions
 * Environment variables must be loaded by the calling code
 * @returns {Pool} Configured PostgreSQL pool
 */
export const createLambdaPool = () => {
  // Validate required environment variables
  if (!process.env.DB_HOST) {
    throw new Error('DB_HOST environment variable is required but not set');
  }

  const poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 5432,
    ssl: process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' || process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false,
      sslmode: 'require'
    } : false,
    // Lambda-specific optimizations
    max: 1, // Limit connections for Lambda
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  };

  return new Pool(poolConfig);
};
