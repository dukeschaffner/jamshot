

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth.js';

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
app.on(['POST', 'GET'], `${stagePrefix}/api/auth/*`, (c) => {
  console.log(`[HONO HANDLER] Better Auth route hit: ${c.req.method} ${c.req.path}`);
  console.log(`[HONO HANDLER] Headers:`, Object.fromEntries(c.req.raw.headers.entries()));
  console.log(`[HONO HANDLER] Query:`, c.req.query());
  return auth.handler(c.req.raw);
});

// Health check endpoint
app.get(`${stagePrefix}/`, (c) => {
  console.log(`[HONO HANDLER] Health check endpoint hit: ${c.req.method} ${c.req.path}`);
  return c.json({
    status: 'ok',
    service: 'Sterio API',
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
    service: 'Sterio API',
    environment: process.env.NODE_ENV || 'development',
    framework: 'hono',
    stagePrefix: stagePrefix || '(none)'
  });
});

// Lambda handler function
export const handler = async (event, context) => {
  const startTime = Date.now();

  console.log(`[HONO HANDLER] === LAMBDA REQUEST START ===`);
  console.log(`[HONO HANDLER] Method: ${event.httpMethod || event.method}`);
  console.log(`[HONO HANDLER] Path: ${event.rawPath || event.path}`);
  console.log(`[HONO HANDLER] Query: ${event.rawQueryString || ''}`);
  console.log(`[HONO HANDLER] Headers:`, JSON.stringify(event.headers, null, 2));
  console.log(`[HONO HANDLER] Body present: ${!!event.body}`);
  console.log(`[HONO HANDLER] Is base64: ${event.isBase64Encoded}`);
  console.log(`[HONO HANDLER] Request context:`, JSON.stringify(event.requestContext, null, 2));

  // Convert Lambda event to Request object
  const url = new URL(event.rawPath || event.path, `https://${event.requestContext?.domainName || 'localhost'}`);
  console.log(`[HONO HANDLER] Constructed URL: ${url.toString()}`);

  // Add query parameters
  if (event.rawQueryString) {
    url.search = event.rawQueryString;
  }

  // Convert headers
  const headers = new Headers();
  Object.entries(event.headers || {}).forEach(([key, value]) => {
    if (value) headers.set(key, value);
  });

  // Create Request object
  const request = new Request(url.toString(), {
    method: event.httpMethod || event.method,
    headers,
    body: event.body ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : event.body) : undefined,
  });

  console.log(`[HONO HANDLER] Created Request object with method: ${request.method}, url: ${request.url}`);

  try {
    console.log(`[HONO HANDLER] Processing request through Hono app...`);
    // Process request through Hono
    const response = await app.fetch(request);
    console.log(`[HONO HANDLER] Hono response status: ${response.status}`);

    // Convert Response to Lambda format
    const responseBody = await response.text();
    console.log(`[HONO HANDLER] Response body length: ${responseBody.length} characters`);
    console.log(`[HONO HANDLER] Response body preview: ${responseBody.substring(0, 500)}${responseBody.length > 500 ? '...' : ''}`);

    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    console.log(`[HONO HANDLER] Response headers:`, JSON.stringify(responseHeaders, null, 2));

    const result = {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBody,
      isBase64Encoded: false
    };

    const duration = Date.now() - startTime;
    console.log(`[HONO HANDLER] === LAMBDA REQUEST END (Duration: ${duration}ms) ===`);

    return result;
  } catch (error) {
    console.error('[HONO HANDLER] Lambda handler error:', error);
    console.error('[HONO HANDLER] Error stack:', error.stack);

    const result = {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Internal server error',
        message: error.message,
        stagePrefix: stagePrefix || '(none)'
      }),
      isBase64Encoded: false
    };

    const duration = Date.now() - startTime;
    console.log(`[HONO HANDLER] === LAMBDA REQUEST ERROR (Duration: ${duration}ms) ===`);

    return result;
  }
};
