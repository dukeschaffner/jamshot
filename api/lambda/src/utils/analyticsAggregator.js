const { pool } = require('../config/db');

/**
 * Analytics Aggregator Utility
 * Handles aggregation of analytics data for performance and reporting
 */

class AnalyticsAggregator {
  constructor() {
    this.timePeriods = ['day', 'week', 'month', 'year'];
  }

  /**
   * Calculate period start and end dates for a given period type
   */
  calculatePeriodDates(periodType, date = new Date()) {
    const startDate = new Date(date);
    
    switch (periodType) {
      case 'day':
        startDate.setHours(0, 0, 0, 0);
        return {
          start: startDate,
          end: new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1)
        };
      case 'week':
        const dayOfWeek = startDate.getDay();
        const daysToSubtract = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate.setDate(startDate.getDate() - daysToSubtract);
        startDate.setHours(0, 0, 0, 0);
        return {
          start: startDate,
          end: new Date(startDate.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)
        };
      case 'month':
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
        const nextMonth = new Date(startDate);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        return {
          start: startDate,
          end: new Date(nextMonth.getTime() - 1)
        };
      case 'year':
        startDate.setMonth(0, 1);
        startDate.setHours(0, 0, 0, 0);
        const nextYear = new Date(startDate);
        nextYear.setFullYear(nextYear.getFullYear() + 1);
        return {
          start: startDate,
          end: new Date(nextYear.getTime() - 1)
        };
      default:
        throw new Error(`Invalid period type: ${periodType}`);
    }
  }

  /**
   * Aggregate track analytics for a specific period
   */
  async aggregateTrackAnalytics(periodType, startDate, endDate) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get all tracks with plays in the period (exclude tracks with null user_id)
      const tracksQuery = `
        SELECT DISTINCT t.id, t.user_id, t.title
        FROM tracks t
        INNER JOIN track_plays tp ON t.id = tp.track_id
        WHERE tp.created_at >= $1 AND tp.created_at <= $2
          AND t.user_id IS NOT NULL
      `;
      
      const tracksResult = await client.query(tracksQuery, [startDate, endDate]);
      
      for (const track of tracksResult.rows) {
        await this.aggregateSingleTrack(client, track.id, periodType, startDate, endDate);
      }

      await client.query('COMMIT');
      console.log(`✅ Aggregated track analytics for ${periodType} period: ${startDate} to ${endDate}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error aggregating track analytics:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Aggregate analytics for a single track
   */
  async aggregateSingleTrack(client, trackId, periodType, startDate, endDate) {
    // Get track info and check if user_id is null
    const trackInfo = await client.query('SELECT user_id FROM tracks WHERE id = $1', [trackId]);
    
    if (!trackInfo.rows.length || !trackInfo.rows[0].user_id) {
      console.log(`⚠️ Skipping track ${trackId} - user_id is null or track not found`);
      return;
    }
    // Get play data
    const playDataQuery = `
      SELECT 
        COUNT(*) as play_count,
        COUNT(DISTINCT user_id) as listener_count,
        SUM(COALESCE(listen_duration, 0)) as total_listen_duration,
        AVG(COALESCE(listen_duration, 0)) as avg_listen_duration,
        COUNT(CASE WHEN is_complete_play THEN 1 END) as complete_plays,
        COUNT(CASE WHEN skip_time IS NOT NULL THEN 1 END) as skipped_plays
      FROM track_plays 
      WHERE track_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
    `;
    
    const playData = await client.query(playDataQuery, [trackId, startDate, endDate]);
    const playStats = playData.rows[0];

    // Get engagement data
    const engagementQuery = `
      SELECT 
        COUNT(l.id) as like_count,
        COUNT(c.id) as comment_count,
        COUNT(r.id) as repost_count,
        COUNT(f.id) as share_count
      FROM tracks t
      LEFT JOIN likes l ON t.id = l.track_id AND l.created_at >= $2 AND l.created_at <= $3
      LEFT JOIN comments c ON t.id = c.track_id AND c.created_at >= $2 AND c.created_at <= $3
      LEFT JOIN reposts r ON t.id = r.track_id AND r.created_at >= $2 AND r.created_at <= $3
      LEFT JOIN follows f ON t.id = f.following_id AND f.created_at >= $2 AND f.created_at <= $3
      WHERE t.id = $1
    `;
    
    const engagementData = await client.query(engagementQuery, [trackId, startDate, endDate]);
    const engagementStats = engagementData.rows[0];

    // Get geographic data
    const geoQuery = `
      SELECT 
        country_code,
        region,
        city,
        COUNT(*) as count
      FROM track_plays 
      WHERE track_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
        AND country_code IS NOT NULL
      GROUP BY country_code, region, city
      ORDER BY count DESC
    `;
    
    const geoData = await client.query(geoQuery, [trackId, startDate, endDate]);
    const geographicData = geoData.rows.reduce((acc, row) => {
      const key = `${row.country_code}-${row.region}-${row.city}`;
      acc[key] = {
        country_code: row.country_code,
        region: row.region,
        city: row.city,
        count: parseInt(row.count)
      };
      return acc;
    }, {});

    // Get discovery methods
    const discoveryQuery = `
      SELECT 
        discovery_method,
        COUNT(*) as count
      FROM track_plays 
      WHERE track_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
      GROUP BY discovery_method
    `;
    
    const discoveryData = await client.query(discoveryQuery, [trackId, startDate, endDate]);
    const discoveryMethods = discoveryData.rows.reduce((acc, row) => {
      acc[row.discovery_method] = parseInt(row.count);
      return acc;
    }, {});

    // Get age ranges (only for users who have consented)
    const ageQuery = `
      SELECT 
        get_age_range(calculate_age(u.date_of_birth)) as age_range,
        COUNT(*) as count
      FROM track_plays tp
      INNER JOIN users u ON tp.user_id = u.id
      WHERE tp.track_id = $1 
        AND tp.created_at >= $2 
        AND tp.created_at <= $3
        AND u.privacy_policy_accepted = true
        AND u.date_of_birth IS NOT NULL
      GROUP BY get_age_range(calculate_age(u.date_of_birth))
    `;
    
    const ageData = await client.query(ageQuery, [trackId, startDate, endDate]);
    const ageRanges = ageData.rows.reduce((acc, row) => {
      acc[row.age_range] = parseInt(row.count);
      return acc;
    }, {});

    // Insert or update aggregate record
    const upsertQuery = `
      INSERT INTO analytics_aggregates (
        track_id, user_id, period_type, period_start, period_end,
        play_count, listener_count, total_listen_duration, avg_listen_duration,
        like_count, comment_count, repost_count, share_count,
        discovery_methods, geographic_data, age_ranges,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW(), NOW()
      )
      ON CONFLICT (track_id, user_id, period_type, period_start)
      DO UPDATE SET
        play_count = EXCLUDED.play_count,
        listener_count = EXCLUDED.listener_count,
        total_listen_duration = EXCLUDED.total_listen_duration,
        avg_listen_duration = EXCLUDED.avg_listen_duration,
        like_count = EXCLUDED.like_count,
        comment_count = EXCLUDED.comment_count,
        repost_count = EXCLUDED.repost_count,
        share_count = EXCLUDED.share_count,
        discovery_methods = EXCLUDED.discovery_methods,
        geographic_data = EXCLUDED.geographic_data,
        age_ranges = EXCLUDED.age_ranges,
        updated_at = NOW()
    `;

    const userId = trackInfo.rows[0].user_id;

    await client.query(upsertQuery, [
      trackId, userId, periodType, startDate, endDate,
      parseInt(playStats.play_count) || 0,
      parseInt(playStats.listener_count) || 0,
      parseFloat(playStats.total_listen_duration) || 0,
      parseFloat(playStats.avg_listen_duration) || 0,
      parseInt(engagementStats.like_count) || 0,
      parseInt(engagementStats.comment_count) || 0,
      parseInt(engagementStats.repost_count) || 0,
      parseInt(engagementStats.share_count) || 0,
      JSON.stringify(discoveryMethods),
      JSON.stringify(geographicData),
      JSON.stringify(ageRanges)
    ]);
  }

  /**
   * Aggregate user analytics for a specific period
   */
  async aggregateUserAnalytics(periodType, startDate, endDate) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get all users with activity in the period (exclude users with null id)
      const usersQuery = `
        SELECT DISTINCT u.id, u.username
        FROM users u
        INNER JOIN tracks t ON u.id = t.user_id
        INNER JOIN track_plays tp ON t.id = tp.track_id
        WHERE tp.created_at >= $1 AND tp.created_at <= $2
          AND u.id IS NOT NULL
        UNION
        SELECT DISTINCT u.id, u.username
        FROM users u
        INNER JOIN track_plays tp ON u.id = tp.user_id
        WHERE tp.created_at >= $1 AND tp.created_at <= $2
          AND u.id IS NOT NULL
      `;
      
      const usersResult = await client.query(usersQuery, [startDate, endDate]);
      
      for (const user of usersResult.rows) {
        await this.aggregateSingleUser(client, user.id, periodType, startDate, endDate);
      }

      await client.query('COMMIT');
      console.log(`✅ Aggregated user analytics for ${periodType} period: ${startDate} to ${endDate}`);
      
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Error aggregating user analytics:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Aggregate analytics for a single user
   */
  async aggregateSingleUser(client, userId, periodType, startDate, endDate) {
    // Check if user_id is null
    if (!userId) {
      console.log(`⚠️ Skipping user analytics - user_id is null`);
      return;
    }
    // Get plays received (plays on user's tracks)
    const playsReceivedQuery = `
      SELECT 
        COUNT(tp.id) as total_plays_received,
        COUNT(DISTINCT tp.user_id) as total_listeners_received,
        SUM(COALESCE(tp.listen_duration, 0)) as total_listen_duration_received,
        AVG(COALESCE(tp.listen_duration, 0)) as avg_listen_duration_received
      FROM track_plays tp
      INNER JOIN tracks t ON tp.track_id = t.id
      WHERE t.user_id = $1 
        AND tp.created_at >= $2 
        AND tp.created_at <= $3
    `;
    
    const playsData = await client.query(playsReceivedQuery, [userId, startDate, endDate]);
    const playsStats = playsData.rows[0];

    // Get engagement received
    const engagementReceivedQuery = `
      SELECT 
        COUNT(l.id) as total_likes_received,
        COUNT(c.id) as total_comments_received,
        COUNT(r.id) as total_reposts_received,
        COUNT(f.id) as total_followers_received
      FROM tracks t
      LEFT JOIN likes l ON t.id = l.track_id AND l.created_at >= $2 AND l.created_at <= $3
      LEFT JOIN comments c ON t.id = c.track_id AND c.created_at >= $2 AND c.created_at <= $3
      LEFT JOIN reposts r ON t.id = r.track_id AND r.created_at >= $2 AND r.created_at <= $3
      LEFT JOIN follows f ON t.id = f.following_id AND f.created_at >= $2 AND f.created_at <= $3
      WHERE t.user_id = $1
    `;
    
    const engagementData = await client.query(engagementReceivedQuery, [userId, startDate, endDate]);
    const engagementStats = engagementData.rows[0];

    // Get tracks uploaded in period
    const tracksUploadedQuery = `
      SELECT COUNT(*) as tracks_uploaded
      FROM tracks 
      WHERE user_id = $1 
        AND created_at >= $2 
        AND created_at <= $3
    `;
    
    const tracksData = await client.query(tracksUploadedQuery, [userId, startDate, endDate]);
    const tracksStats = tracksData.rows[0];

    // Get follower count at end of period
    const followerQuery = `
      SELECT COUNT(*) as follower_count
      FROM follows 
      WHERE following_id = $1 
        AND created_at <= $3
    `;
    
    const followerData = await client.query(followerQuery, [userId, startDate, endDate]);
    const followerStats = followerData.rows[0];

    // Get listener geographic data
    const listenerGeoQuery = `
      SELECT 
        tp.country_code,
        tp.region,
        tp.city,
        COUNT(*) as count
      FROM track_plays tp
      INNER JOIN tracks t ON tp.track_id = t.id
      WHERE t.user_id = $1 
        AND tp.created_at >= $2 
        AND tp.created_at <= $3
        AND tp.country_code IS NOT NULL
      GROUP BY tp.country_code, tp.region, tp.city
      ORDER BY count DESC
    `;
    
    const listenerGeoData = await client.query(listenerGeoQuery, [userId, startDate, endDate]);
    const listenerGeographicData = listenerGeoData.rows.reduce((acc, row) => {
      const key = `${row.country_code}-${row.region}-${row.city}`;
      acc[key] = {
        country_code: row.country_code,
        region: row.region,
        city: row.city,
        count: parseInt(row.count)
      };
      return acc;
    }, {});

    // Get listener age ranges
    const listenerAgeQuery = `
      SELECT 
        get_age_range(calculate_age(u.date_of_birth)) as age_range,
        COUNT(*) as count
      FROM track_plays tp
      INNER JOIN tracks t ON tp.track_id = t.id
      INNER JOIN users u ON tp.user_id = u.id
      WHERE t.user_id = $1 
        AND tp.created_at >= $2 
        AND tp.created_at <= $3
        AND u.privacy_policy_accepted = true
        AND u.date_of_birth IS NOT NULL
      GROUP BY get_age_range(calculate_age(u.date_of_birth))
    `;
    
    const listenerAgeData = await client.query(listenerAgeQuery, [userId, startDate, endDate]);
    const listenerAgeRanges = listenerAgeData.rows.reduce((acc, row) => {
      acc[row.age_range] = parseInt(row.count);
      return acc;
    }, {});

    // Get discovery methods for user's tracks
    const discoveryQuery = `
      SELECT 
        tp.discovery_method,
        COUNT(*) as count
      FROM track_plays tp
      INNER JOIN tracks t ON tp.track_id = t.id
      WHERE t.user_id = $1 
        AND tp.created_at >= $2 
        AND tp.created_at <= $3
      GROUP BY tp.discovery_method
    `;
    
    const discoveryData = await client.query(discoveryQuery, [userId, startDate, endDate]);
    const discoveryMethods = discoveryData.rows.reduce((acc, row) => {
      acc[row.discovery_method] = parseInt(row.count);
      return acc;
    }, {});

    // Insert or update user aggregate record
    const upsertQuery = `
      INSERT INTO user_analytics_aggregates (
        user_id, period_type, period_start, period_end,
        total_plays_received, total_listeners_received, 
        total_listen_duration_received, avg_listen_duration_received,
        total_likes_received, total_comments_received, 
        total_reposts_received, total_shares_received,
        follower_count, tracks_uploaded,
        listener_geographic_data, listener_age_ranges, discovery_methods,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW()
      )
      ON CONFLICT (user_id, period_type, period_start)
      DO UPDATE SET
        total_plays_received = EXCLUDED.total_plays_received,
        total_listeners_received = EXCLUDED.total_listeners_received,
        total_listen_duration_received = EXCLUDED.total_listen_duration_received,
        avg_listen_duration_received = EXCLUDED.avg_listen_duration_received,
        total_likes_received = EXCLUDED.total_likes_received,
        total_comments_received = EXCLUDED.total_comments_received,
        total_reposts_received = EXCLUDED.total_reposts_received,
        total_shares_received = EXCLUDED.total_shares_received,
        follower_count = EXCLUDED.follower_count,
        tracks_uploaded = EXCLUDED.tracks_uploaded,
        listener_geographic_data = EXCLUDED.listener_geographic_data,
        listener_age_ranges = EXCLUDED.listener_age_ranges,
        discovery_methods = EXCLUDED.discovery_methods,
        updated_at = NOW()
    `;

    await client.query(upsertQuery, [
      userId, periodType, startDate, endDate,
      parseInt(playsStats.total_plays_received) || 0,
      parseInt(playsStats.total_listeners_received) || 0,
      parseFloat(playsStats.total_listen_duration_received) || 0,
      parseFloat(playsStats.avg_listen_duration_received) || 0,
      parseInt(engagementStats.total_likes_received) || 0,
      parseInt(engagementStats.total_comments_received) || 0,
      parseInt(engagementStats.total_reposts_received) || 0,
      parseInt(engagementStats.total_followers_received) || 0,
      parseInt(followerStats.follower_count) || 0,
      parseInt(tracksStats.tracks_uploaded) || 0,
      JSON.stringify(listenerGeographicData),
      JSON.stringify(listenerAgeRanges),
      JSON.stringify(discoveryMethods)
    ]);
  }

  /**
   * Run aggregation for all periods
   */
  async runFullAggregation(date = new Date()) {
    console.log('🚀 Starting full analytics aggregation...');
    
    for (const periodType of this.timePeriods) {
      const { start, end } = this.calculatePeriodDates(periodType, date);
      
      console.log(`📊 Aggregating ${periodType} data for ${start.toISOString()} to ${end.toISOString()}`);
      
      try {
        await this.aggregateTrackAnalytics(periodType, start, end);
        await this.aggregateUserAnalytics(periodType, start, end);
      } catch (error) {
        console.error(`❌ Error aggregating ${periodType} data:`, error);
        throw error;
      }
    }
    
    console.log('✅ Full analytics aggregation completed!');
  }

  /**
   * Run aggregation for a specific period
   */
  async runPeriodAggregation(periodType, date = new Date()) {
    const { start, end } = this.calculatePeriodDates(periodType, date);
    
    console.log(`📊 Aggregating ${periodType} data for ${start.toISOString()} to ${end.toISOString()}`);
    
    try {
      await this.aggregateTrackAnalytics(periodType, start, end);
      await this.aggregateUserAnalytics(periodType, start, end);
      console.log(`✅ ${periodType} aggregation completed!`);
    } catch (error) {
      console.error(`❌ Error aggregating ${periodType} data:`, error);
      throw error;
    }
  }

  /**
   * Clean up old analytics data (keep last 2 years)
   */
  async cleanupOldData() {
    const client = await pool.connect();
    
    try {
      const cutoffDate = new Date();
      cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);
      
      console.log(`🧹 Cleaning up analytics data older than ${cutoffDate.toISOString()}`);
      
      // Clean up old track analytics
      const trackCleanup = await client.query(
        'DELETE FROM analytics_aggregates WHERE period_start < $1',
        [cutoffDate]
      );
      
      // Clean up old user analytics
      const userCleanup = await client.query(
        'DELETE FROM user_analytics_aggregates WHERE period_start < $1',
        [cutoffDate]
      );
      
      console.log(`✅ Cleaned up ${trackCleanup.rowCount} track analytics records`);
      console.log(`✅ Cleaned up ${userCleanup.rowCount} user analytics records`);
      
    } catch (error) {
      console.error('❌ Error cleaning up old data:', error);
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = AnalyticsAggregator; 