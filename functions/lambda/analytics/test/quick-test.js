#!/usr/bin/env node

/**
 * Quick Test Script for Jamshot Analytics Lambda
 * 
 * This script tests the Lambda function with your actual database data.
 * It's designed to be fast and show you what the function will do.
 * 
 * Usage:
 *   node test/quick-test.js [period] [date]
 * 
 * Examples:
 *   node test/quick-test.js                    # Test with today's data
 *   node test/quick-test.js day                # Test daily aggregation
 *   node test/quick-test.js day 2024-01-15    # Test with specific date
 */

// Load environment variables first
require('dotenv').config({ path: './.env' });

const { handler } = require('..');
const { pool } = require('../config/db');

async function quickTest(period = 'day', date = null) {
  console.log('🚀 Quick Test - Jamshot Analytics Lambda');
  console.log('========================================');
  console.log(`📅 Period: ${period}`);
  console.log(`📅 Date: ${date || 'today'}`);
  console.log('');
  
  try {
    // Test database connection
    console.log('🔌 Testing database connection...');
    const client = await pool.connect();
    const dbInfo = await client.query('SELECT NOW() as current_time, version() as db_version');
    client.release();
    
    console.log('✅ Database connected!');
    console.log(`📅 DB time: ${dbInfo.rows[0].current_time}`);
    console.log('');
    
    // Check data availability
    console.log('📊 Checking your data...');
    const dataClient = await pool.connect();
    
    const tracksResult = await dataClient.query('SELECT COUNT(*) as count FROM tracks');
    const playsResult = await dataClient.query('SELECT COUNT(*) as count FROM track_plays');
    const usersResult = await dataClient.query('SELECT COUNT(*) as count FROM users');
    
    dataClient.release();
    
    console.log(`📈 Your data:`);
    console.log(`   - Tracks: ${tracksResult.rows[0].count}`);
    console.log(`   - Track plays: ${playsResult.rows[0].count}`);
    console.log(`   - Users: ${usersResult.rows[0].count}`);
    console.log('');
    
    if (parseInt(tracksResult.rows[0].count) === 0) {
      console.log('⚠️  No tracks found in database');
      console.log('   The analytics function needs tracks to aggregate data from');
      return;
    }
    
    if (parseInt(playsResult.rows[0].count) === 0) {
      console.log('⚠️  No track plays found in database');
      console.log('   The analytics function needs track plays to aggregate');
      return;
    }
    
    // Show sample data
    console.log('🔍 Sample data preview:');
    const sampleClient = await pool.connect();
    
    const sampleTracks = await sampleClient.query(`
      SELECT id, title, user_id, created_at 
      FROM tracks 
      ORDER BY created_at DESC 
      LIMIT 3
    `);
    
    const samplePlays = await sampleClient.query(`
      SELECT track_id, user_id, listen_duration, created_at 
      FROM track_plays 
      ORDER BY created_at DESC 
      LIMIT 3
    `);
    
    // Check for null user_ids
    const nullUserTracks = await sampleClient.query(`
      SELECT COUNT(*) as count 
      FROM tracks 
      WHERE user_id IS NULL
    `);
    
    const nullUserPlays = await sampleClient.query(`
      SELECT COUNT(*) as count 
      FROM track_plays 
      WHERE user_id IS NULL
    `);
    
    sampleClient.release();
    
    console.log('   Recent tracks:');
    sampleTracks.rows.forEach(track => {
      console.log(`     - ${track.title} (ID: ${track.id})`);
    });
    
    console.log('   Recent plays:');
    samplePlays.rows.forEach(play => {
      console.log(`     - Track ${play.track_id}, ${play.listen_duration}s (${play.created_at})`);
    });
    
    console.log(`   Null user_id checks:`);
    console.log(`     - Tracks with null user_id: ${nullUserTracks.rows[0].count}`);
    console.log(`     - Plays with null user_id: ${nullUserPlays.rows[0].count}`);
    
    console.log('');
    
    // Run the Lambda function
    console.log('🧪 Running analytics aggregation...');
    console.log('===================================');
    
    const event = {
      period: period,
      date: date
    };
    
    const mockContext = {
      functionName: 'jamshot-analytics-quick-test',
      getRemainingTimeInMillis: () => 900000
    };
    
    const startTime = Date.now();
    const result = await handler(event, mockContext);
    const endTime = Date.now();
    
    console.log('');
    console.log('✅ Test completed!');
    console.log(`⏱️  Execution time: ${endTime - startTime}ms`);
    console.log('');
    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));
    
    // Show what was created
    if (result.statusCode === 200) {
      console.log('');
      console.log('🔍 Checking what was created...');
      
      const checkClient = await pool.connect();
      
      const aggregatesResult = await checkClient.query(`
        SELECT COUNT(*) as count, period_type 
        FROM analytics_aggregates 
        WHERE period_start >= NOW() - INTERVAL '1 day'
        GROUP BY period_type
      `);
      
      const userAggregatesResult = await checkClient.query(`
        SELECT COUNT(*) as count, period_type 
        FROM user_analytics_aggregates 
        WHERE period_start >= NOW() - INTERVAL '1 day'
        GROUP BY period_type
      `);
      
      checkClient.release();
      
      console.log('   Analytics aggregates created:');
      aggregatesResult.rows.forEach(row => {
        console.log(`     - ${row.period_type}: ${row.count} records`);
      });
      
      console.log('   User analytics aggregates created:');
      userAggregatesResult.rows.forEach(row => {
        console.log(`     - ${row.period_type}: ${row.count} records`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    console.error('Stack trace:', error.stack);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const period = args[0] || 'day';
  const date = args[1] || null;
  
  await quickTest(period, date);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

if (require.main === module) {
  main();
}
