#!/usr/bin/env node

/**
 * Analytics Aggregation Script
 * 
 * This script can be run manually or scheduled via cron to aggregate analytics data.
 * 
 * Usage:
 *   node aggregateAnalytics.js [period] [date]
 * 
 * Examples:
 *   node aggregateAnalytics.js                    # Run full aggregation for today
 *   node aggregateAnalytics.js day                # Aggregate daily data for today
 *   node aggregateAnalytics.js week               # Aggregate weekly data for this week
 *   node aggregateAnalytics.js month              # Aggregate monthly data for this month
 *   node aggregateAnalytics.js year               # Aggregate yearly data for this year
 *   node aggregateAnalytics.js day 2024-01-15    # Aggregate daily data for specific date
 *   node aggregateAnalytics.js cleanup            # Clean up old analytics data
 */

const AnalyticsAggregator = require('../utils/analyticsAggregator');

async function main() {
  const args = process.argv.slice(2);
  const period = args[0];
  const dateArg = args[1];
  
  const aggregator = new AnalyticsAggregator();
  
  try {
    // Parse date argument if provided
    let targetDate = new Date();
    if (dateArg) {
      targetDate = new Date(dateArg);
      if (isNaN(targetDate.getTime())) {
        throw new Error(`Invalid date format: ${dateArg}. Use YYYY-MM-DD format.`);
      }
    }
    
    console.log('🎵 Jamshot Analytics Aggregation');
    console.log('================================');
    console.log(`📅 Target date: ${targetDate.toISOString().split('T')[0]}`);
    console.log('');
    
    if (period === 'cleanup') {
      console.log('🧹 Running data cleanup...');
      await aggregator.cleanupOldData();
      console.log('✅ Cleanup completed!');
      return;
    }
    
    if (!period) {
      // Run full aggregation for all periods
      console.log('🚀 Running full analytics aggregation...');
      await aggregator.runFullAggregation(targetDate);
    } else if (['day', 'week', 'month', 'year'].includes(period)) {
      // Run aggregation for specific period
      console.log(`📊 Running ${period} aggregation...`);
      await aggregator.runPeriodAggregation(period, targetDate);
    } else {
      console.error('❌ Invalid period specified. Valid options: day, week, month, year, cleanup');
      console.log('');
      console.log('Usage:');
      console.log('  node aggregateAnalytics.js [period] [date]');
      console.log('');
      console.log('Examples:');
      console.log('  node aggregateAnalytics.js                    # Full aggregation for today');
      console.log('  node aggregateAnalytics.js day                # Daily aggregation for today');
      console.log('  node aggregateAnalytics.js week               # Weekly aggregation for this week');
      console.log('  node aggregateAnalytics.js month              # Monthly aggregation for this month');
      console.log('  node aggregateAnalytics.js year               # Yearly aggregation for this year');
      console.log('  node aggregateAnalytics.js day 2024-01-15    # Daily aggregation for specific date');
      console.log('  node aggregateAnalytics.js cleanup            # Clean up old data');
      process.exit(1);
    }
    
    console.log('');
    console.log('✅ Analytics aggregation completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during analytics aggregation:', error);
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

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main }; 