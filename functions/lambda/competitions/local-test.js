#!/usr/bin/env node

/**
 * Local Testing Script for Jamshot Competition Lambda
 * 
 * This script allows you to test the Lambda function locally before deploying.
 * It simulates the Lambda runtime environment and event structure.
 * 
 * Usage:
 *   node test/local-test.js [type] [competition_id]
 * 
 * Examples:
 *   node test/local-test.js competition_end 123
 *   node test/local-test.js curated_followup 123
 *   node test/local-test.js all
 */

import '@sterio/dev-env/config';

// Now import modules that depend on environment variables
// Using dynamic imports ensures env vars are loaded first
const { createLambdaPool } = await import('@sterio/db-config');
const { handler, competitionEndHandler, curatedFollowupHandler, manualHandler } = await import('./index.js');



// Create database pool using shared package
const pool = createLambdaPool();

// Mock Lambda context
const mockContext = {
  functionName: 'jamshot-competition-local-test',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:jamshot-competition-local-test',
  memoryLimitInMB: '1024',
  awsRequestId: 'test-request-id-' + Date.now(),
  logGroupName: '/aws/lambda/jamshot-competition-local-test',
  logStreamName: '2024/01/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 900000, // 15 minutes
  done: () => {},
  fail: () => {},
  succeed: () => {}
};

async function testHandler(handlerName, event) {
  console.log(`🧪 Testing ${handlerName}...`);
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('---');
  
  try {
    const startTime = Date.now();
    const result = await handler(event, mockContext);
    const endTime = Date.now();
    
    console.log('✅ Test completed successfully!');
    console.log(`⏱️  Execution time: ${endTime - startTime}ms`);
    console.log('Result:', JSON.stringify(result, null, 2));
    
    return result;
  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  }
}

async function checkDatabaseConnection() {
  console.log('🔌 Testing database connection...');
  
  try {
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

async function checkCompetitionData() {
  console.log('🏆 Checking competition data availability...');
  
  try {
    const client = await pool.connect();
    
    // Check for competitions
    const competitionsResult = await client.query('SELECT COUNT(*) as count FROM competitions');
    const competitionsCount = parseInt(competitionsResult.rows[0].count);
    
    // Check for tracks
    const tracksResult = await client.query('SELECT COUNT(*) as count FROM tracks');
    const tracksCount = parseInt(tracksResult.rows[0].count);
    
    // Check for users
    const usersResult = await client.query('SELECT COUNT(*) as count FROM users');
    const usersCount = parseInt(usersResult.rows[0].count);
    
    // Check for competition entries
    const entriesResult = await client.query('SELECT COUNT(*) as count FROM tracks WHERE is_competition_entry = true');
    const entriesCount = parseInt(entriesResult.rows[0].count);
    
    client.release();
    
    console.log(`📈 Competition data summary:`);
    console.log(`   - Competitions: ${competitionsCount}`);
    console.log(`   - Tracks: ${tracksCount}`);
    console.log(`   - Users: ${usersCount}`);
    console.log(`   - Competition entries: ${entriesCount}`);
    
    if (competitionsCount === 0) {
      console.log('⚠️  Warning: No competitions found for testing');
      console.log('   Consider creating test competitions or using existing ones');
    }
    
    return { competitionsCount, tracksCount, usersCount, entriesCount };
  } catch (error) {
    console.error('❌ Error checking competition data:', error.message);
    return null;
  }
}

async function testCompetitionEndHandler(competitionId) {
  console.log('🏁 Testing competition end handler...');
  
  const event = {
    type: 'competition_end',
    competition_id: competitionId
  };
  
  return await testHandler('competitionEndHandler', event);
}

async function testCuratedFollowupHandler(competitionId) {
  console.log('⏰ Testing curated follow-up handler...');
  
  const event = {
    type: 'curated_followup',
    competition_id: competitionId
  };
  
  return await testHandler('curatedFollowupHandler', event);
}

async function testManualHandler(type, competitionId) {
  console.log(`🔧 Testing manual handler with type: ${type}, competition_id: ${competitionId}`);
  
  const event = {
    type: type,
    competition_id: competitionId
  };
  
  return await testHandler('manualHandler', event);
}

async function testEventBridgeEvent(type, competitionId) {
  console.log(`☁️  Testing EventBridge event simulation...`);
  
  const event = {
    source: 'jamshot.competitions',
    'detail-type': type === 'competition_end' ? 'Competition Ended' : 'Competition Follow-up',
    detail: {
      competition_id: competitionId,
      type: type
    },
    time: new Date().toISOString(),
    region: 'us-east-1',
    resources: [`arn:aws:events:us-east-1:123456789012:rule/jamshot-competition-${type}`]
  };
  
  return await testHandler('handler', event);
}

async function runAllTests() {
  console.log('🚀 Running all Competition Lambda function tests...');
  console.log('===============================================');
  console.log('');
  
  try {
    // Get a test competition ID
    const client = await pool.connect();
    const result = await client.query('SELECT id FROM competitions LIMIT 1');
    client.release();
    
    if (result.rows.length === 0) {
      console.log('⚠️  No competitions found. Skipping tests that require competition_id.');
      console.log('   Create a test competition first or use manual testing with specific IDs.');
      return;
    }
    
    const testCompetitionId = result.rows[0].id;
    console.log(`🎯 Using test competition ID: ${testCompetitionId}`);
    console.log('');
    
    // Test 1: Competition end handler
    console.log('Test 1: Competition End Handler');
    console.log('==============================');
    await testCompetitionEndHandler(testCompetitionId);
    console.log('');
    
    // Test 2: Curated follow-up handler
    console.log('Test 2: Curated Follow-up Handler');
    console.log('=================================');
    await testCuratedFollowupHandler(testCompetitionId);
    console.log('');
    
    // Test 3: EventBridge event simulation
    console.log('Test 3: EventBridge Event Simulation');
    console.log('====================================');
    await testEventBridgeEvent('competition_end', testCompetitionId);
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
  const competitionId = args[1];
  
  // Check if .env file exists (already loaded above, but verify required vars)
  if (!process.env.DB_HOST) {
    console.error('❌ Database environment variables not found. Please ensure .env file exists and contains DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, DB_PORT');
    console.error('   Expected location: .env in current directory or parent directory');
    process.exit(1);
  }
  
  console.log('🏆 Jamshot Competition Lambda - Local Testing');
  console.log('============================================');
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
    
    // Check competition data availability
    const dataInfo = await checkCompetitionData();
    if (!dataInfo) {
      console.error('❌ Cannot check competition data availability');
      process.exit(1);
    }
    
    console.log('');
    
    if (testType === 'all') {
      await runAllTests();
    } else if (testType === 'competition_end') {
      if (!competitionId) {
        console.error('❌ competition_id is required for competition_end test');
        process.exit(1);
      }
      await testCompetitionEndHandler(competitionId);
    } else if (testType === 'curated_followup') {
      if (!competitionId) {
        console.error('❌ competition_id is required for curated_followup test');
        process.exit(1);
      }
      await testCuratedFollowupHandler(competitionId);
    } else if (testType && ['competition_end', 'curated_followup'].includes(testType)) {
      if (!competitionId) {
        console.error(`❌ competition_id is required for ${testType} test`);
        process.exit(1);
      }
      await testManualHandler(testType, competitionId);
    } else {
      console.log('Usage:');
      console.log('  node test/local-test.js [testType] [competition_id]');
      console.log('');
      console.log('Test Types:');
      console.log('  all                - Run all tests');
      console.log('  competition_end    - Test competition end processing');
      console.log('  curated_followup   - Test curated follow-up processing');
      console.log('');
      console.log('Examples:');
      console.log('  node test/local-test.js all');
      console.log('  node test/local-test.js competition_end 123');
      console.log('  node test/local-test.js curated_followup 123');
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

// Run the test if this is the main module
// In ESM, we check if the current file is being run directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('local-test.js')) {
  main();
}

export {
  testHandler,
  testCompetitionEndHandler,
  testCuratedFollowupHandler,
  testManualHandler,
  testEventBridgeEvent,
  runAllTests
};
