const { Pool } = require('pg');
require('dotenv').config();

// Use connection string if provided, otherwise fall back to individual parameters
const poolConfig = { connectionString: process.env.DB_CONNECTION_STRING };

// Enable SSL for production or when explicitly configured
if (process.env.NODE_ENV === 'production' || process.env.DB_SSL === 'true') {
  poolConfig.ssl = {
    rejectUnauthorized: true, // Allows SSL without strict certificate validation
    sslmode: 'require'
  };
}

const pool = new Pool(poolConfig);

module.exports = pool;