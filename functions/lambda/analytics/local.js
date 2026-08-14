/**
 * Local execution support
 */
import '@sterio/dev-env/config';
import { handler, timerHandler, cleanupHandler } from './index.js';
import { createLambdaPool } from '@sterio/db-config';

// Mock Lambda context
const mockContext = {
  functionName: 'jamshot-analytics-local-test',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:jamshot-analytics-local-test',
  memoryLimitInMB: '1024',
  awsRequestId: 'test-request-id-' + Date.now(),
  logGroupName: '/aws/lambda/jamshot-analytics-local-test',
  logStreamName: '2024/01/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 900000, // 15 minutes
  done: () => {},
  fail: () => {},
  succeed: () => {}
};

async function checkDatabaseConnection() {
  console.log('🔌 Testing database connection...');
  
  try {
    const pool = createLambdaPool();
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    client.release();
    
    console.log('✅ Database connection successful!');
    console.log(`📅 Database time: ${result.rows[0].current_time}`);
    console.log(`🗄️  Database version: ${result.rows[0].db_version}`);
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return false;
  }
}

async function checkDataAvailability() {
  console.log('📊 Checking data availability...');
  
  try {
    const pool = createLambdaPool();
    const client = await pool.connect();
    
    // Check for tracks
    const tracksResult = await client.query('SELECT COUNT(*) as count FROM tracks');
    const tracksCount = parseInt(tracksResult.rows[0].count);
    
    // Check for track plays
    const playsResult = await client.query('SELECT COUNT(*) as count FROM track_plays');
    const playsCount = parseInt(playsResult.rows[0].count);
    
    // Check for users
    const usersResult = await client.query('SELECT COUNT(*) as count FROM users');
    const usersCount = parseInt(usersResult.rows[0].count);
    
    client.release();
    
    console.log(`📈 Data summary:`);
    console.log(`   - Tracks: ${tracksCount}`);
    console.log(`   - Track plays: ${playsCount}`);
    console.log(`   - Users: ${usersCount}`);
    
    if (tracksCount === 0 || playsCount === 0) {
      console.log('⚠️  Warning: Limited data available for testing');
      console.log('   Consider running with a smaller date range or generating test data');
    }
    
    return { tracksCount, playsCount, usersCount };
  } catch (error) {
    console.error('❌ Error checking data availability:', error.message);
    return null;
  }
}

async function testTimerHandler() {
  console.log('⏰ Testing timer handler (simulates EventBridge trigger)...');
  
  const event = {
    source: 'aws.events',
    'detail-type': 'Scheduled Event',
    detail: {},
    time: new Date().toISOString(),
    region: 'us-east-1',
    resources: ['arn:aws:events:us-east-1:123456789012:rule/jamshot-analytics-timer']
  };
  
  return await handler(event, mockContext);
}

async function testCleanupHandler() {
  console.log('🧹 Testing cleanup handler...');
  
  const event = {
    period: 'cleanup'
  };
  
  return await handler(event, mockContext);
}

async function testManualHandler(period, date) {
  console.log(`🔧 Testing manual handler with period: ${period}, date: ${date || 'today'}`);
  
  const event = {
    period: period,
    date: date
  };
  
  return await handler(event, mockContext);
}

async function runAllTests() {
  console.log('🚀 Running all Lambda function tests...');
  console.log('=====================================');
  console.log('');
  
  try {
    // Test 1: Timer handler (daily aggregation)
    console.log('Test 1: Timer Handler (Daily Aggregation)');
    console.log('==========================================');
    await testTimerHandler();
    console.log('');
    
    // Test 2: Manual handler - day aggregation
    console.log('Test 2: Manual Handler - Day Aggregation');
    console.log('========================================');
    await testManualHandler('day');
    console.log('');
    
    // Test 3: Manual handler - week aggregation
    console.log('Test 3: Manual Handler - Week Aggregation');
    console.log('==========================================');
    await testManualHandler('week');
    console.log('');
    
    // Test 4: Cleanup handler
    console.log('Test 4: Cleanup Handler');
    console.log('======================');
    await testCleanupHandler();
    console.log('');
    
    console.log('🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const testType = args[0];
  const period = args[1];
  const date = args[2];
  
  console.log('🎵 Jamshot Analytics Lambda - Local Testing');
  console.log('==========================================');
  console.log(`📅 Test time: ${new Date().toISOString()}`);
  console.log(`🗄️  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
  console.log('');
  
  try {
    // Test database connection first
    const dbConnected = await checkDatabaseConnection();
    if (!dbConnected) {
      console.error('❌ Cannot proceed without database connection');
      process.exit(1);
    }
    
    console.log('');
    
    // Check data availability
    const dataInfo = await checkDataAvailability();
    if (!dataInfo) {
      console.error('❌ Cannot check data availability');
      process.exit(1);
    }
    
    console.log('');
    
    if (testType === 'all') {
      await runAllTests();
    } else if (testType === 'timer') {
      await testTimerHandler();
    } else if (testType === 'cleanup') {
      await testCleanupHandler();
    } else if (testType && ['day', 'week', 'month', 'year', 'all'].includes(testType)) {
      await testManualHandler(testType, date);
    } else {
      console.log('Usage:');
      console.log('  node local.js [testType] [period] [date]');
      console.log('');
      console.log('Test Types:');
      console.log('  all      - Run all tests');
      console.log('  timer    - Test timer handler');
      console.log('  cleanup  - Test cleanup handler');
      console.log('  day      - Test daily aggregation');
      console.log('  week     - Test weekly aggregation');
      console.log('  month    - Test monthly aggregation');
      console.log('  year     - Test yearly aggregation');
      console.log('');
      console.log('Examples:');
      console.log('  node local.js all');
      console.log('  node local.js day');
      console.log('  node local.js day 2024-01-15');
      console.log('  node local.js timer');
      console.log('  node local.js cleanup');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Test execution failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run the test
main();

