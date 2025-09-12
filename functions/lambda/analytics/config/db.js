const { Pool } = require('pg');

// Load environment variables if not already loaded
if (!process.env.DB_HOST) {
  require('dotenv').config();
}

/**
 * Database configuration for Lambda function
 * Uses environment variables for connection
 */
const poolConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  ssl: process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false,
    sslmode: 'require'
  } : false,
  // Lambda-specific optimizations
  max: 1, // Limit connections for Lambda
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
};

const pool = new Pool(poolConfig);

module.exports = { pool };