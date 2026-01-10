

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auth } from './auth.js';

// Create Hono app
const app = new Hono();

// CORS configuration (matching the existing Express CORS setup)
app.use('/api/auth/*', cors({
  origin: function (origin) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return true;

    // Allow local development
    if (origin === 'http://localhost:3000' ||
        origin === 'http://localhost:8081' ||
        origin === 'http://localhost:5173' ||
        process.env.NODE_ENV === 'dev') {
      return true;
    }

    // Allow production domains
    if (origin === 'https://dev.d3cx888lrkmdbn.amplifyapp.com' ||
        origin === 'https://sterio.fm' ||
        origin === 'https://www.sterio.fm') {
      return true;
    }

    // Allow API Gateway domain (when deployed)
    if (process.env.API_GATEWAY_DOMAIN && origin.includes(process.env.API_GATEWAY_DOMAIN)) {
      return true;
    }

    // Deny other origins
    return false;
  },
  allowHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  credentials: true
}));

// Mount Better Auth routes
app.on(['POST', 'GET'], '/api/auth/*', (c) => {
  return auth.handler(c.req.raw);
});

// Health check endpoint
app.get('/', (c) => {
  console.log('Health check endpoint hit:', c.req.path, c.req.method);
  return c.json({
    status: 'ok',
    service: 'Sterio API',
    environment: process.env.NODE_ENV || 'development',
    framework: 'hono'
  });
});

// Lambda handler function
export const handler = async (event, context) => {
  // Convert Lambda event to Request object
  const url = new URL(event.rawPath || event.path, `https://${event.requestContext?.domainName || 'localhost'}`);

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

  try {
    // Process request through Hono
    const response = await app.fetch(request);

    // Convert Response to Lambda format
    const responseBody = await response.text();
    const responseHeaders = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      statusCode: response.status,
      headers: responseHeaders,
      body: responseBody,
      isBase64Encoded: false
    };
  } catch (error) {
    console.error('Lambda handler error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Internal server error' }),
      isBase64Encoded: false
    };
  }
};
