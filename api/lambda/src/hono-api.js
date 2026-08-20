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

/**
 * Better Auth matches routes against `new URL(baseURL).pathname`.
 * baseURL is built from API_URL (e.g. https://api.sterio.fm/api/auth → /api/auth).
 * API Gateway still prefixes production with /prod, so the Lambda path is
 * /prod/api/auth/... while baseURL pathname is /api/auth. Test already has
 * /test in API_URL, so its paths align. Strip the stage prefix only when it
 * is not already part of the configured auth base path.
 */
const getConfiguredAuthBasePath = () => {
  const baseUrl = process.env.NODE_ENV === 'dev'
    ? 'http://localhost:5002/api'
    : process.env.API_URL;
  try {
    return new URL(`${baseUrl}/auth`).pathname.replace(/\/$/, '') || '/api/auth';
  } catch {
    return '/api/auth';
  }
};

const requestForAuthHandler = (rawRequest) => {
  if (!stagePrefix) return rawRequest;

  const configuredAuthBasePath = getConfiguredAuthBasePath();
  if (configuredAuthBasePath.startsWith(stagePrefix)) {
    return rawRequest;
  }

  const url = new URL(rawRequest.url);
  if (!url.pathname.startsWith(`${stagePrefix}/`) && url.pathname !== stagePrefix) {
    return rawRequest;
  }

  url.pathname = url.pathname.slice(stagePrefix.length) || '/';
  return new Request(url.toString(), rawRequest);
};

// Create Hono app
const app = new Hono();

// Cloudflare secret header middleware
app.use('*', async (c, next) => {
  const env = process.env.NODE_ENV;

  // Allow preflight requests
  if (c.req.method === 'OPTIONS') {
    return next();
  }

  // Dev bypass (safer)
  if (env === 'development' || env === 'dev') {
    return next();
  }

  const cfSecret = c.req.header('x-internal-auth');
  const expectedSecret = process.env.CF_SECRET;

  if (!cfSecret || !expectedSecret || cfSecret !== expectedSecret) {
    console.warn('[CF AUTH] Blocked request', {
      path: c.req.path,
      method: c.req.method,
      hasHeader: !!cfSecret,
    });

    return c.json({ error: 'Unauthorized' }, 403);
  }

  await next();
});



app.use(
  '*',
  cors({
    origin: [
      'http://localhost:3000',
      'http://localhost:3002',
      'https://dev.d3cx888lrkmdbn.amplifyapp.com',
      'https://test.sterio.fm',
      'https://sterio.fm',
      'https://admin.sterio.fm',
      'https://admin.test.sterio.fm',
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
    const response = await auth.handler(requestForAuthHandler(c.req.raw));

    // If not a 404, return this response
    if (response.status !== 404) {
      return response;
    }

    console.log(`[HONO HANDLER] Auth handler returned 404, returning 404 response`, {
      path: c.req.path,
      configuredAuthBasePath: getConfiguredAuthBasePath(),
      stagePrefix: stagePrefix || '(none)',
    });

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