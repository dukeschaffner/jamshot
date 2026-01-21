import { Pool } from 'pg';
import 'dotenv/config';

const poolConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 5432,
  // Lambda-specific optimizations
  max: 1, // Limit connections per Lambda instance
  min: 0, // Allow closing all connections
  idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
  connectionTimeoutMillis: 5000, // Connection timeout
  keepAlive: true, // Keep connections alive
  keepAliveInitialDelayMillis: 0
};

// Enable SSL for production or when explicitly configured
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test' || process.env.DB_SSL === 'true') {
  poolConfig.ssl = {
    rejectUnauthorized: false, // Allows SSL without strict certificate validation
    sslmode: 'require'
  };
}

const pool = new Pool(poolConfig);

// Handle pool errors gracefully
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

// Handle Lambda container shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing database pool...');
  await pool.end();
  console.log('Database pool closed');
});

export default pool;