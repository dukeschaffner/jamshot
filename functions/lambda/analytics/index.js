const AnalyticsAggregator = require('./utils/analyticsAggregator');

/**
 * AWS Lambda handler for analytics aggregation
 * 
 * This function can be triggered by:
 * 1. EventBridge (CloudWatch Events) - Timer-based (recommended)
 * 2. Manual invocation via AWS Console or CLI
 * 3. API Gateway (for manual triggers)
 * 
 * Event structure for manual invocation:
 * {
 *   "period": "day|week|month|year|all|cleanup",
 *   "date": "2024-01-15" (optional, defaults to current date)
 * }
 */

//0 2 * * ? *

exports.handler = async (event, context) => {
  console.log('🎵 Jamshot Analytics Lambda Started');
  console.log('Event:', JSON.stringify(event, null, 2));
  console.log('Context:', JSON.stringify(context, null, 2));
  
  const aggregator = new AnalyticsAggregator();
  
  try {
    // Parse event parameters
    const period = event.period || 'all';
    const dateArg = event.date;
    
    // Parse date argument if provided, default to previous day for analytics
    let targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1); // Default to previous day
    if (dateArg) {
      targetDate = new Date(dateArg);
      if (isNaN(targetDate.getTime())) {
        throw new Error(`Invalid date format: ${dateArg}. Use YYYY-MM-DD format.`);
      }
    }
    
    console.log(`📅 Target date: ${targetDate.toISOString().split('T')[0]}`);
    console.log(`📊 Period: ${period}`);
    
    let result;
    
    if (period === 'cleanup') {
      console.log('🧹 Running data cleanup...');
      await aggregator.cleanupOldData();
      result = {
        status: 'success',
        operation: 'cleanup',
        message: 'Data cleanup completed successfully'
      };
    } else if (period === 'all') {
      console.log('🚀 Running full analytics aggregation...');
      await aggregator.runFullAggregation(targetDate);
      result = {
        status: 'success',
        operation: 'full_aggregation',
        period: 'all',
        date: targetDate.toISOString().split('T')[0],
        message: 'Full analytics aggregation completed successfully'
      };
    } else if (['day', 'week', 'month', 'year'].includes(period)) {
      console.log(`📊 Running ${period} aggregation...`);
      await aggregator.runPeriodAggregation(period, targetDate);
      result = {
        status: 'success',
        operation: 'period_aggregation',
        period: period,
        date: targetDate.toISOString().split('T')[0],
        message: `${period} aggregation completed successfully`
      };
    } else {
      throw new Error(`Invalid period specified: ${period}. Valid options: day, week, month, year, all, cleanup`);
    }
    
    console.log('✅ Analytics aggregation completed successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    
    return {
      statusCode: 200,
      body: JSON.stringify(result)
    };
    
  } catch (error) {
    console.error('❌ Error during analytics aggregation:', error);
    
    const errorResult = {
      status: 'error',
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    
    return {
      statusCode: 500,
      body: JSON.stringify(errorResult)
    };
  }
};

/**
 * Handler for EventBridge timer events
 * This is the main entry point for scheduled analytics aggregation
 */
exports.timerHandler = async (event, context) => {
  console.log('⏰ Timer-based analytics aggregation triggered');
  
  // For timer events, we typically want to run daily aggregation
  // but we can also run full aggregation on specific days
  const now = new Date();
  const previousDay = new Date(now);
  previousDay.setDate(previousDay.getDate() - 1); // Process previous day's data
  const dayOfWeek = previousDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Run full aggregation on Sundays (day 0)
  // Run daily aggregation on other days
  //const period = dayOfWeek === 0 ? 'all' : 'day';
  const period = 'day';
  
  console.log(`📅 Processing data for: ${previousDay.toISOString().split('T')[0]} (day ${dayOfWeek}), Running: ${period} aggregation`);
  
  // Create a modified event for the main handler
  const modifiedEvent = {
    period: period,
    date: previousDay.toISOString().split('T')[0]
  };
  
  return exports.handler(modifiedEvent, context);
};

/**
 * Handler for manual cleanup operations
 * Can be triggered via AWS Console or CLI
 */
exports.cleanupHandler = async (event, context) => {
  console.log('🧹 Manual cleanup triggered');
  
  const modifiedEvent = {
    period: 'cleanup'
  };
  
  return exports.handler(modifiedEvent, context);
};
