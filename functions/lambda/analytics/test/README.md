# Local Testing Guide

This directory contains testing utilities for the Jamshot Analytics Lambda function. You can test the function locally using your actual database data before deploying to AWS.

## Quick Start

### 1. Set up environment

```bash
cd functions/lambda/analytics
cp .env.example .env
# Edit .env with your database configuration
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run quick test

```bash
# Test with today's data (daily aggregation)
node test/quick-test.js

# Test with specific date
node test/quick-test.js day 2024-01-15

# Test different periods
node test/quick-test.js week
node test/quick-test.js month
```

## Test Scripts

### `quick-test.js` - Fast testing with real data
- **Purpose**: Quick validation using your actual database
- **Use case**: Verify the function works with your data
- **Time**: ~30 seconds

```bash
node test/quick-test.js [period] [date]
```

### `local-test.js` - Comprehensive testing
- **Purpose**: Full test suite with multiple scenarios
- **Use case**: Thorough testing before deployment
- **Time**: ~2-3 minutes

```bash
node test/local-test.js [testType] [period] [date]
```

## What the Tests Do

### Database Connection Test
- Verifies connection to your database
- Shows database version and current time
- Checks if all required tables exist

### Data Availability Check
- Counts tracks, track plays, and users
- Shows sample data from your database
- Warns if there's insufficient data for testing

### Analytics Aggregation Test
- Runs the actual analytics aggregation logic
- Uses your real data (tracks, plays, users)
- Shows what aggregated data was created
- Measures execution time

### Result Verification
- Checks what analytics records were created
- Shows counts by period type
- Verifies the aggregation worked correctly

## Expected Output

```
🚀 Quick Test - Jamshot Analytics Lambda
========================================
📅 Period: day
📅 Date: today

🔌 Testing database connection...
✅ Database connected!
📅 DB time: 2024-01-15 10:30:00.000000+00
🗄️  Database version: PostgreSQL 15.4

📊 Checking your data...
📈 Your data:
   - Tracks: 150
   - Track plays: 2,340
   - Users: 45

🔍 Sample data preview:
   Recent tracks:
     - My Awesome Track (ID: 123)
     - Another Great Song (ID: 124)
   Recent plays:
     - Track 123, 120.5s (2024-01-15 10:25:00)
     - Track 124, 95.2s (2024-01-15 10:20:00)

🧪 Running analytics aggregation...
===================================

✅ Test completed!
⏱️  Execution time: 1,250ms

Result:
{
  "statusCode": 200,
  "body": "{\"status\":\"success\",\"operation\":\"period_aggregation\",\"period\":\"day\",\"date\":\"2024-01-15\",\"message\":\"day aggregation completed successfully\"}"
}

🔍 Checking what was created...
   Analytics aggregates created:
     - day: 12 records
   User analytics aggregates created:
     - day: 8 records
```

## Troubleshooting

### Database Connection Issues
```
❌ Database connection failed: connection refused
```
**Solution**: Check your `.env` file and database credentials

### No Data Found
```
⚠️  No tracks found in database
```
**Solution**: Make sure you have data in your test database

### Permission Issues
```
❌ Error: permission denied for table tracks
```
**Solution**: Check database user permissions

### Memory Issues
```
❌ Test failed: JavaScript heap out of memory
```
**Solution**: Increase Node.js memory limit:
```bash
node --max-old-space-size=4096 test/quick-test.js
```

## Test Data Requirements

The tests work with your actual data, but for best results:

- **Minimum**: 1 track, 1 track play
- **Recommended**: 10+ tracks, 100+ track plays
- **Date range**: Data from the last 30 days works best

## Next Steps

After successful local testing:

1. **Deploy to AWS**: `npm run deploy`
2. **Test in AWS**: Use the manual trigger
3. **Monitor logs**: Check CloudWatch for execution logs
4. **Set up monitoring**: Configure alerts for failures

## Environment Variables

Make sure your `.env` file contains:

```bash
# Database Configuration
DB_HOST=your-database-host
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=your-database-name
DB_PORT=5432
DB_SSL=true
```

## Support

If you encounter issues:

1. Check the error messages carefully
2. Verify your database connection
3. Ensure you have sufficient data
4. Check the logs for detailed error information
