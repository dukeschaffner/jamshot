import 'dotenv/config';
import { handler } from './dist/index.mjs';

// Load environment variables from .env file
const envPath = new URL('./.env', import.meta.url).pathname;
process.loadEnvFile(envPath);

console.log('🌍 Environment variables loaded from .env');
console.log('🔧 Handler imported from dist/index.mjs');

// Create a dummy Lambda context
const createDummyContext = () => ({
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id-' + Date.now(),
  logGroupName: '/aws/lambda/test-function',
  logStreamName: '2024/01/01/[$LATEST]abcd1234567890abcdef',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {}
});

// Helper function to create dummy events
const createDummyEvent = (options = {}) => {
  const {
    method = 'GET',
    path = '/api/test',
    body = null,
    headers = {},
    queryParams = {},
    isAuth = false
  } = options;

  const event = {
    httpMethod: method,
    path: path,
    rawPath: path,
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Test-Client/1.0',
      ...headers
    },
    queryStringParameters: queryParams,
    body: body ? JSON.stringify(body) : null,
    isBase64Encoded: false,
    requestContext: {
      http: {
        method: method,
        path: path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'Test-Client/1.0'
      },
      requestId: 'test-request-id-' + Date.now(),
      stage: '$default'
    }
  };

  return event;
};

// Test function
async function testHandler(event, description) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log('📨 Event:', JSON.stringify(event, null, 2));

  const context = createDummyContext();

  try {
    const startTime = Date.now();
    const result = await handler(event, context);
    const duration = Date.now() - startTime;

    console.log(`✅ Response (${duration}ms):`);
    if (result.body) {
      try {
        const body = JSON.parse(result.body);
        console.log(JSON.stringify(body, null, 2));
      } catch {
        console.log(result.body);
      }
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error('❌ Handler error:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Run tests
console.log('🚀 Starting handler tests...\n');

// Test 1: Regular API endpoint (should route to Express)
await testHandler(
  createDummyEvent({
    method: 'GET',
    path: '/api/tracks',
    queryParams: { limit: '10' }
  }),
  'Regular API - GET /api/tracks'
);

// Test 2: Auth endpoint (should route to Hono)
await testHandler(
  createDummyEvent({
    method: 'POST',
    path: '/api/auth/sign-in',
    body: {
      email: 'test@example.com',
      password: 'testpassword'
    },
    isAuth: true
  }),
  'Auth API - POST /api/auth/sign-in'
);

// Test 3: POST request with body
await testHandler(
  createDummyEvent({
    method: 'POST',
    path: '/api/users',
    body: {
      name: 'Test User',
      email: 'test@example.com'
    }
  }),
  'Regular API - POST /api/users'
);

// Test 4: PUT request
await testHandler(
  createDummyEvent({
    method: 'PUT',
    path: '/api/tracks/123',
    body: {
      title: 'Updated Track'
    }
  }),
  'Regular API - PUT /api/tracks/123'
);

console.log('\n🎉 All tests completed!');