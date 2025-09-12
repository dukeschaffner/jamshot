# Jamshot Analytics Lambda Function

This Lambda function handles automated analytics aggregation for the Jamshot application. It processes track and user analytics data and stores aggregated results for fast querying.

## Features

- **Timer-based aggregation**: Runs daily at 2 AM UTC for daily analytics
- **Weekly full aggregation**: Runs every Sunday at 3 AM UTC for comprehensive data processing
- **Monthly cleanup**: Automatically removes analytics data older than 2 years
- **Manual triggers**: Can be invoked manually via API Gateway or AWS CLI
- **Multiple period support**: Daily, weekly, monthly, and yearly aggregation

## Architecture

```
EventBridge (Timer) → Lambda Function → PostgreSQL Database
     ↓
Analytics Aggregation → Aggregated Tables
```

## Functions

### 1. `analyticsAggregator` (Timer-based)
- **Trigger**: EventBridge cron schedule
- **Schedule**: Daily at 2 AM UTC, Weekly on Sundays at 3 AM UTC
- **Purpose**: Automated analytics aggregation

### 2. `analyticsManual` (Manual)
- **Trigger**: API Gateway HTTP POST
- **Endpoint**: `/analytics/aggregate`
- **Purpose**: Manual aggregation triggers

### 3. `analyticsCleanup` (Cleanup)
- **Trigger**: EventBridge cron schedule
- **Schedule**: Monthly on the 1st at 4 AM UTC
- **Purpose**: Remove old analytics data

## Configuration

### Environment Variables

```bash
# Database Configuration
DB_HOST=your-database-host
DB_USER=your-database-user
DB_PASSWORD=your-database-password
DB_NAME=your-database-name
DB_PORT=5432
DB_SSL=true

# VPC Configuration (for database access)
DB_SECURITY_GROUP_ID=sg-xxxxxxxxx
DB_SUBNET_ID_1=subnet-xxxxxxxxx
DB_SUBNET_ID_2=subnet-yyyyyyyyy
```

### Manual Invocation

```bash
# Run full aggregation for today
aws lambda invoke \
  --function-name jamshot-analytics-dev-analyticsManual \
  --payload '{"period":"all"}' \
  response.json

# Run daily aggregation for specific date
aws lambda invoke \
  --function-name jamshot-analytics-dev-analyticsManual \
  --payload '{"period":"day","date":"2024-01-15"}' \
  response.json

# Run cleanup
aws lambda invoke \
  --function-name jamshot-analytics-dev-analyticsCleanup \
  --payload '{}' \
  response.json
```

## Deployment

### Prerequisites

1. Install Serverless Framework:
```bash
npm install -g serverless
```

2. Configure AWS credentials:
```bash
aws configure
```

3. Install dependencies:
```bash
cd functions/lambda/analytics
npm install
```

### Deploy

```bash
# Deploy to development
serverless deploy --stage dev

# Deploy to production
serverless deploy --stage prod
```

### Remove

```bash
serverless remove --stage dev
```

## Monitoring

### CloudWatch Logs

- **Log Group**: `/aws/lambda/jamshot-analytics-{stage}-{functionName}`
- **Retention**: 14 days (configurable)

### Metrics

- **Duration**: Function execution time
- **Errors**: Number of failed invocations
- **Invocations**: Total number of invocations
- **Throttles**: Number of throttled invocations

## Database Schema

The function works with these tables:

### Raw Data Tables
- `track_plays` - Individual play events
- `users` - User information
- `tracks` - Track information
- `likes`, `comments`, `reposts`, `follows` - Engagement data

### Aggregated Tables
- `analytics_aggregates` - Track-level aggregated analytics
- `user_analytics_aggregates` - User-level aggregated analytics

## Error Handling

- **Database connection errors**: Retries with exponential backoff
- **Query timeouts**: 15-minute Lambda timeout
- **Memory issues**: 1GB memory allocation
- **VPC connectivity**: Proper security group and subnet configuration

## Cost Optimization

- **Cold starts**: Minimized with provisioned concurrency (if needed)
- **Memory usage**: Optimized for 1GB allocation
- **Timeout**: Set to 15 minutes (maximum)
- **VPC**: Only when database access requires it

## Troubleshooting

### Common Issues

1. **Database connection timeout**
   - Check VPC configuration
   - Verify security group rules
   - Ensure subnets have internet access

2. **Memory issues**
   - Increase memory allocation in serverless.yml
   - Optimize database queries

3. **Timeout errors**
   - Check CloudWatch logs for specific errors
   - Consider breaking down large aggregations

### Debug Mode

Enable debug logging by setting the log level:

```bash
export SLS_DEBUG=*
serverless deploy
```

## Development

### Local Testing

```bash
# Install serverless-offline
npm install serverless-offline

# Start local development server
serverless offline start
```

### Testing

```bash
# Test manual aggregation
curl -X POST http://localhost:3001/analytics/aggregate \
  -H "Content-Type: application/json" \
  -d '{"period":"day"}'
```
