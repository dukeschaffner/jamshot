# Analytics Aggregation System Documentation

## Overview

The Jamshot Analytics Aggregation System provides comprehensive analytics data for tracks, users, and platform-wide metrics. The system aggregates raw analytics data into pre-calculated tables for fast querying and reporting.

## Architecture

### Core Components

1. **AnalyticsAggregator** (`api/src/utils/analyticsAggregator.js`)
   - Main aggregation engine
   - Handles daily, weekly, monthly, and yearly aggregation
   - Processes track and user analytics separately
   - Respects user privacy settings

2. **Aggregation Script** (`api/src/scripts/aggregateAnalytics.js`)
   - Command-line tool for manual aggregation
   - Can be scheduled via cron
   - Supports specific periods and dates

3. **Analytics API** (`api/src/routes/analytics.js`)
   - REST endpoints for accessing aggregated data
   - Authentication and authorization controls
   - Privacy-compliant data access

### Database Tables

#### Raw Data Tables
- `track_plays` - Individual play events with detailed metadata
- `user_engagement` - User interaction events (likes, comments, etc.)

#### Aggregated Tables
- `analytics_aggregates` - Track-level aggregated analytics
- `user_analytics_aggregates` - User-level aggregated analytics
- `geo_cache` - Cached geolocation data

## Data Flow

```
Raw Events → Real-time Trigger → Daily Aggregates → Scheduled Aggregation → Multi-period Aggregates
```

1. **Real-time Events**: Track plays, likes, comments, etc. are recorded immediately
2. **Daily Trigger**: Basic daily aggregation happens automatically via database trigger
3. **Scheduled Aggregation**: Comprehensive aggregation runs via scheduled script
4. **Multi-period**: Weekly, monthly, yearly aggregates are calculated

## Privacy & Compliance

### Data Collection
- Only tracks users who have accepted the privacy policy
- Age data is only collected for users who provide date of birth
- Geographic data is anonymized at the city level
- All data respects user privacy settings

### Data Access
- Users can only access their own analytics
- Public user analytics are limited to non-sensitive data
- Platform analytics require admin privileges

## Usage

### Running Aggregation

#### Manual Aggregation
```bash
# Full aggregation for today
node api/src/scripts/aggregateAnalytics.js

# Specific period aggregation
node api/src/scripts/aggregateAnalytics.js day
node api/src/scripts/aggregateAnalytics.js week
node api/src/scripts/aggregateAnalytics.js month
node api/src/scripts/aggregateAnalytics.js year

# Specific date
node api/src/scripts/aggregateAnalytics.js day 2024-01-15

# Clean up old data
node api/src/scripts/aggregateAnalytics.js cleanup
```

#### Scheduled Aggregation
Add to crontab for daily aggregation:
```bash
# Daily aggregation at 2 AM
0 2 * * * cd /path/to/jamshot && node api/src/scripts/aggregateAnalytics.js day

# Weekly aggregation on Sundays at 3 AM
0 3 * * 0 cd /path/to/jamshot && node api/src/scripts/aggregateAnalytics.js week

# Monthly aggregation on 1st of month at 4 AM
0 4 1 * * cd /path/to/jamshot && node api/src/scripts/aggregateAnalytics.js month

# Yearly aggregation on January 1st at 5 AM
0 5 1 1 * cd /path/to/jamshot && node api/src/scripts/aggregateAnalytics.js year

# Cleanup old data monthly
0 6 1 * * cd /path/to/jamshot && node api/src/scripts/aggregateAnalytics.js cleanup
```

### API Endpoints

#### Track Analytics
```javascript
// Get track analytics (requires authentication)
GET /api/analytics/tracks/:trackId?period=day&start_date=2024-01-01&end_date=2024-01-31

// Response includes:
{
  track: { id, title, artist_username, current_play_count },
  analytics: [/* aggregated data */],
  period: { type, start_date, end_date }
}
```

#### User Analytics
```javascript
// Get own analytics (requires authentication)
GET /api/analytics/users/me?period=week

// Get public user analytics (no auth required)
GET /api/analytics/users/:username?period=month

// Response includes:
{
  user: { id, username, current_follower_count, current_track_count },
  analytics: [/* aggregated data */],
  period: { type, start_date, end_date }
}
```

#### Platform Analytics
```javascript
// Get platform-wide analytics (admin only)
GET /api/analytics/platform?period=day

// Response includes:
{
  platform_stats: {
    total_plays, unique_listeners, tracks_played, artists_played,
    avg_listen_duration, complete_plays, total_likes, total_comments,
    total_reposts, total_follows
  },
  period: { type, start_date, end_date }
}
```

#### Manual Aggregation Trigger
```javascript
// Trigger aggregation manually (admin only)
POST /api/analytics/aggregate
{
  "period": "day",  // optional
  "date": "2024-01-15"  // optional
}
```

## Analytics Metrics

### Track Analytics
- **Play Count**: Total number of plays
- **Listener Count**: Unique listeners
- **Listen Duration**: Total and average listen duration
- **Engagement**: Likes, comments, reposts, shares
- **Geographic Data**: Plays by country/region/city
- **Age Ranges**: Listener demographics (privacy-compliant)
- **Discovery Methods**: How users found the track

### User Analytics
- **Plays Received**: Total plays on user's tracks
- **Listeners Received**: Unique listeners of user's tracks
- **Engagement Received**: Likes, comments, reposts received
- **Follower Count**: Current follower count
- **Tracks Uploaded**: Number of tracks uploaded in period
- **Listener Demographics**: Geographic and age data of listeners
- **Discovery Methods**: How users found the artist's tracks

### Platform Analytics
- **Total Plays**: Platform-wide play count
- **Unique Listeners**: Total unique users
- **Tracks Played**: Number of unique tracks played
- **Artists Played**: Number of unique artists
- **Engagement**: Total likes, comments, reposts, follows
- **Listen Duration**: Average listen duration across platform

## Performance Considerations

### Database Optimization
- Aggregated tables use efficient indexes
- JSONB columns for flexible metadata storage
- Partitioning by date for large datasets
- Automatic cleanup of old data (2-year retention)

### Query Performance
- Pre-calculated aggregates for fast dashboard queries
- Real-time triggers for immediate daily updates
- Scheduled aggregation for comprehensive multi-period data
- Cached geolocation data to reduce API calls

### Scalability
- Batch processing for large datasets
- Transaction-based aggregation for data consistency
- Error handling and retry logic
- Graceful degradation for high-load scenarios

## Monitoring & Maintenance

### Health Checks
- Monitor aggregation script execution
- Check for failed aggregation jobs
- Verify data consistency between raw and aggregated tables
- Monitor database performance during aggregation

### Data Quality
- Validate aggregated data against raw data
- Check for missing or duplicate records
- Monitor privacy compliance
- Regular data cleanup and maintenance

### Troubleshooting

#### Common Issues
1. **Aggregation Fails**: Check database connectivity and permissions
2. **Missing Data**: Verify raw data exists before aggregation
3. **Performance Issues**: Check database indexes and query optimization
4. **Privacy Violations**: Ensure proper consent checking

#### Debug Commands
```bash
# Check aggregation status
node api/src/scripts/aggregateAnalytics.js day

# Verify data consistency
SELECT COUNT(*) FROM track_plays WHERE created_at >= CURRENT_DATE;
SELECT COUNT(*) FROM analytics_aggregates WHERE period_start = CURRENT_DATE;

# Check for errors
SELECT * FROM analytics_aggregates WHERE updated_at < NOW() - INTERVAL '1 hour';
```

## Future Enhancements

### Planned Features
- Real-time analytics dashboard
- Email reports for users
- Advanced filtering and segmentation
- Machine learning insights
- A/B testing analytics
- Mobile app analytics

### Performance Improvements
- Parallel aggregation processing
- Incremental aggregation updates
- Advanced caching strategies
- Database partitioning optimization

## Security Considerations

### Data Protection
- All analytics data is encrypted at rest
- API endpoints require proper authentication
- Privacy settings are strictly enforced
- Data retention policies are automatically applied

### Access Control
- Role-based access to analytics data
- Audit logging for all analytics access
- Rate limiting on analytics endpoints
- Input validation and sanitization

## Support

For issues with the analytics system:
1. Check the application logs for error messages
2. Verify database connectivity and permissions
3. Test aggregation manually using the script
4. Review privacy settings and consent data
5. Contact the development team for complex issues 