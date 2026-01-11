import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from '../auth.js';

// Helper function to get stage prefix based on environment (matching Express setup)
const getStagePrefix = () => {
  const env = process.env.NODE_ENV;
  console.log(`[HONO HANDLER] Environment: ${env}`);
  if (env === 'test') {
    console.log(`[HONO HANDLER] Using stage prefix: /test`);
    return '/test';
  }
  if (env === 'prod') {
    console.log(`[HONO HANDLER] Using stage prefix: /prod`);
    return '/prod';
  }
  console.log(`[HONO HANDLER] Using stage prefix: (none)`);
  return ''; // No prefix for dev/staging/other environments
};

const stagePrefix = getStagePrefix();

console.log(`[HONO HANDLER] Initializing Hono handler with stage prefix: "${stagePrefix}"`);

// Create Hono app
const app = new Hono();

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'https://dev.d3cx888lrkmdbn.amplifyapp.com',
      process.env.FRONTEND_URL,
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
    credentials: true // Allow cookies to be sent
  })
)

// Mount Better Auth routes
console.log(`[HONO HANDLER] Mounting Better Auth routes at: ${stagePrefix}/api/auth/*`);
app.on(['POST', 'GET'], `${stagePrefix}/api/auth/*`, async (c) => {
  console.log(`[HONO HANDLER] Better Auth route hit: ${c.req.method} ${c.req.path}`);
  console.log(`[HONO HANDLER] Headers:`, Object.fromEntries(c.req.raw.headers.entries()));
  console.log(`[HONO HANDLER] Query:`, c.req.query());

  try {
    const response = await auth.handler(c.req.raw);
    console.log(`[HONO HANDLER] Auth handler returned status: ${response.status}`);

    // If not a 404, return this response
    if (response.status !== 404) {
      console.log(`[HONO HANDLER] Returning response from auth handler (status: ${response.status})`);
      return response;
    }

    console.log(`[HONO HANDLER] Auth handler returned 404, trying next handler...`);
  } catch (error) {
    console.error(`[HONO HANDLER] Error in auth handler:`, error);
  }
});

// Health check endpoint
app.get(`${stagePrefix}/`, (c) => {
  console.log(`[HONO HANDLER] Health check endpoint hit: ${c.req.method} ${c.req.path}`);
  return c.json({
    status: 'ok',
    service: 'Sterio API 1',
    environment: process.env.NODE_ENV || 'development',
    framework: 'hono',
    stagePrefix: stagePrefix || '(none)'
  });
});

// Also add a root health check for backwards compatibility
app.get('/', (c) => {
  console.log(`[HONO HANDLER] Root health check endpoint hit: ${c.req.method} ${c.req.path}`);
  return c.json({
    status: 'ok',
    service: 'Sterio API 2',
    environment: process.env.NODE_ENV || 'development',
    framework: 'hono',
    stagePrefix: stagePrefix || '(none)'
  });
});

export default app;