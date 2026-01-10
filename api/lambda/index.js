

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { handle } from "hono/aws-lambda";
import { auth } from './auth.js';
import { auth1 } from './auth1.js';
import { auth2 } from './auth2.js';
import { auth3 } from './auth3.js';
import { auth4 } from './auth4.js';
import { auth5 } from './auth5.js';

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

  // Try auth handlers in sequence and return first non-404 response
  const authHandlers = [auth, auth1, auth2, auth3, auth4, auth5];

  for (let i = 0; i < authHandlers.length; i++) {
    const handler = authHandlers[i];
    console.log(`[HONO HANDLER] Trying auth handler ${i}: ${c.req.method} ${c.req.path}`);

    try {
      const response = await handler.handler(c.req.raw);
      console.log(`[HONO HANDLER] Auth handler ${i} returned status: ${response.status}`);

      // If not a 404, return this response
      if (response.status !== 404) {
        console.log(`[HONO HANDLER] Returning response from auth handler ${i} (status: ${response.status})`);
        return response;
      }

      console.log(`[HONO HANDLER] Auth handler ${i} returned 404, trying next handler...`);
    } catch (error) {
      console.error(`[HONO HANDLER] Error in auth handler ${i}:`, error);
      // Continue to next handler if there's an error
    }
  }

  // If all handlers returned 404 or errored, return the last response (which would be a 404)
  console.log(`[HONO HANDLER] All auth handlers returned 404, returning last response`);
  return auth3.handler(c.req.raw);
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

export const handler = handle(app);
