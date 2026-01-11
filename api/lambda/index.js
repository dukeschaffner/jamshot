
import { handle } from "hono/aws-lambda";
import honoApp from './src/hono-api.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const serverlessExpress = require('@codegenie/serverless-express');
import expressApp from './src/express-api.js';

// Import database pool for cleanup
const pool = require('./src/config/db.cjs');

// Create serverless express instance
const serverlessExpressInstance = serverlessExpress({
  app: expressApp,
  shouldParseBody: false,
});

// Cleanup function for database connections
const cleanup = async () => {
  try {
    console.log('🧹 Cleaning up database connections...');
    await pool.end();
    console.log('✅ Database connections closed');
  } catch (error) {
    console.error('❌ Error closing database connections:', error);
  }
};

// Handle Lambda container shutdown
process.on('SIGTERM', async () => {
  console.log('📤 Received SIGTERM, cleaning up...');
  await cleanup();
});

// Global error handlers for Lambda environment
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

// Main routing handler
export const handler = async (event, context) => {
  // Set callbackWaitsForEmptyEventLoop to false
  context.callbackWaitsForEmptyEventLoop = false;

  // Determine if this is an auth request
  const isAuthRequest = event.rawPath && event.rawPath.includes('/api/auth');

  // Enhanced logging
  const logLevel = isAuthRequest ? '🔐 AUTH REQUEST' : '📡 API REQUEST';
  console.log(`${logLevel}:`);
  console.log(`  - Method: ${event.requestContext?.http?.method || 'UNKNOWN'}`);
  console.log(`  - Path: ${event.rawPath || 'UNKNOWN'}`);
  console.log(`  - Query: ${event.rawQueryString || '(none)'}`);
  console.log(`  - User-Agent: ${event.headers?.['user-agent'] || 'UNKNOWN'}`);
  console.log(`  - Origin: ${event.headers?.origin || 'UNKNOWN'}`);

  if (isAuthRequest) {
    console.log(`  - Headers:`, JSON.stringify(event.headers, null, 2));
    if (event.body) {
      console.log(`  - Has body: ${!!event.body} (${typeof event.body})`);
    }
  }

  // Decode base64 body if needed
  if (event.body && event.isBase64Encoded) {
    event.body = Buffer.from(event.body, 'base64');
  }

  try {
    if (isAuthRequest) {
      // Route auth requests to Hono handler
      console.log('🔀 Routing to Hono auth handler');
      return await handle(honoApp)(event, context);
    } else {
      // Route all other requests to serverless express handler
      console.log('🔀 Routing to Express API handler');
      return await serverlessExpressInstance(event, context);
    }
  } catch (error) {
    console.error('❌ Lambda handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: 'An unexpected error occurred'
      })
    };
  }
};
