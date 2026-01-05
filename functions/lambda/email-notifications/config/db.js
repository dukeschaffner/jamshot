const { Pool } = require('pg');
const path = require('path');

// Load environment variables if not already loaded
if (!process.env.DB_HOST) {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

console.log('process.env.DB_HOST:', process.env.DB_HOST);
console.log('process.env.DB_PORT:', process.env.DB_PORT);
console.log('process.env.DB_NAME:', process.env.DB_NAME);
console.log('process.env.DB_USER:', process.env.DB_USER);
console.log('process.env.DB_PASSWORD:', process.env.DB_PASSWORD);
console.log('process.env.NODE_ENV:', process.env.NODE_ENV);

// Database configuration
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false, sslmode: 'require' } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Database connection error:', err);
});

module.exports = { pool };
