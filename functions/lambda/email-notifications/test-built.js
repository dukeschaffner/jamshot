import 'dotenv/config';
import { handler } from './dist/index.mjs';

// Load environment variables from .env file if it exists
try {
  const envPath = new URL('./.env', import.meta.url).pathname;
  process.loadEnvFile(envPath);
  console.log('🌍 Environment variables loaded from .env');
} catch (error) {
  console.log('⚠️  No .env file found, using environment defaults');
}

console.log('🔧 Handler imported from dist/index.mjs');

// Create a dummy Lambda context
const createDummyContext = () => ({
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'email-notifications-test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-2:123456789012:function:email-notifications-test',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id-' + Date.now(),
  logGroupName: '/aws/lambda/email-notifications-test',
  logStreamName: '2024/01/01/[$LATEST]abcd1234567890abcdef',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {}
});

// Helper function to create dummy event (email-notifications lambda doesn't use specific event data)
const createDummyEvent = () => ({
  // Email notifications lambda is typically triggered by CloudWatch Events or scheduled triggers
  // It doesn't use specific event parameters, so we provide a minimal event structure
  source: 'aws.events',
  'detail-type': 'Scheduled Event',
  time: new Date().toISOString(),
  detail: {}
});

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
    console.log('Status Code:', result.statusCode);

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

    return result;
  } catch (error) {
    console.error('❌ Handler error:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  }
}

// Run tests
console.log('🚀 Starting email-notifications handler tests...\n');

// Test 1: Basic email notifications processing
await testHandler(
  createDummyEvent(),
  'Email Notifications Processing - Scheduled Run'
);

console.log('\n🎉 All tests completed!');
