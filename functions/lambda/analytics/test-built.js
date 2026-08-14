import '@sterio/dev-env/config';
import { handler, timerHandler, cleanupHandler } from './dist/index.mjs';

console.log('🌍 Environment variables loaded from env/.env.dev');

console.log('🔧 Handler imported from dist/index.mjs');

// Create a dummy Lambda context
const createDummyContext = () => ({
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'analytics-test-function',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-2:123456789012:function:analytics-test',
  memoryLimitInMB: '1024',
  awsRequestId: 'test-request-id-' + Date.now(),
  logGroupName: '/aws/lambda/analytics-test',
  logStreamName: '2024/01/01/[$LATEST]abcd1234567890abcdef',
  getRemainingTimeInMillis: () => 900000,
  done: () => {},
  fail: () => {},
  succeed: () => {}
});

// Helper function to create dummy event
const createDummyEvent = (period = 'day', date = null) => ({
  period: period,
  date: date
});

// Test function
async function testHandler(handlerFn, event, description) {
  console.log(`\n🧪 Testing: ${description}`);
  console.log('📨 Event:', JSON.stringify(event, null, 2));

  const context = createDummyContext();

  try {
    const startTime = Date.now();
    const result = await handlerFn(event, context);
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
console.log('🚀 Starting analytics handler tests...\n');

// Test 1: Basic day aggregation
await testHandler(
  handler,
  createDummyEvent('day'),
  'Day Aggregation'
);

// Test 2: Timer handler
await testHandler(
  timerHandler,
  {
    source: 'aws.events',
    'detail-type': 'Scheduled Event',
    time: new Date().toISOString(),
    detail: {}
  },
  'Timer Handler (Daily Aggregation)'
);

// Test 3: Cleanup handler
await testHandler(
  cleanupHandler,
  {},
  'Cleanup Handler'
);

console.log('\n🎉 All tests completed!');

