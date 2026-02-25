import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from '../auth.js';

// Helper function to get stage prefix based on environment (matching Express setup)
const getStagePrefix = () => {
  const env = process.env.NODE_ENV;
  if (env === 'test') {
    return '/test';
  }
  if (env === 'production') {
    return '/prod';
  }
  return ''; // No prefix for dev/staging/other environments
};

const stagePrefix = getStagePrefix();

// Create Hono app
const app = new Hono();

app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'https://dev.d3cx888lrkmdbn.amplifyapp.com',
      'https://test.sterio.fm',
      'https://sterio.fm',
      process.env.FRONTEND_URL,
    ],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
    credentials: true // Allow cookies to be sent
  })
)

// Mount Better Auth routes
app.on(['POST', 'GET'], `${stagePrefix}/api/auth/*`, async (c) => {

  try {
    const response = await auth.handler(c.req.raw);

    // If not a 404, return this response
    if (response.status !== 404) {
      return response;
    }

    console.log(`[HONO HANDLER] Auth handler returned 404, returning 404 response`);

    // Return a proper 404 response when Better Auth doesn't handle the route
    return c.json({ error: 'Not found', message: 'Auth endpoint not found' }, 404);
  } catch (error) {
    console.error(`[HONO HANDLER] Error in auth handler:`, error);
    return c.json({ error: 'Internal server error', message: error.message }, 500);
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