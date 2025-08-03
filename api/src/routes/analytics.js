const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { pool } = require('../config/db');
const AnalyticsAggregator = require('../utils/analyticsAggregator');

/**
 * Analytics API Routes
 * Provides aggregated analytics data for dashboards and reporting
 * All endpoints require authentication and respect user privacy settings
 */

// Get track analytics for a specific track
router.get('/tracks/:trackId', authenticateToken, async (req, res) => {
  try {
    const { trackId } = req.params;
    const { period = 'day', start_date, end_date } = req.query;
    const userId = req.user.id;

    // Verify user has access to this track (owner or public track)
    const trackAccessQuery = `
      SELECT t.id, t.user_id, t.is_private, u.username
      FROM tracks t
      INNER JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `;
    
    const trackResult = await pool.query(trackAccessQuery, [trackId]);
    
    if (trackResult.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const track = trackResult.rows[0];
    
    // Check access permissions
    if (track.is_private && track.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Build date range
    let startDate, endDate;
    if (start_date && end_date) {
      startDate = new Date(start_date);
      endDate = new Date(end_date);
    } else {
      const aggregator = new AnalyticsAggregator();
      const { start, end } = aggregator.calculatePeriodDates(period);
      startDate = start;
      endDate = end;
    }

    // Get aggregated analytics data
    const analyticsQuery = `
      SELECT 
        aa.*,
        t.title,
        u.username as artist_username
      FROM analytics_aggregates aa
      INNER JOIN tracks t ON aa.track_id = t.id
      INNER JOIN users u ON aa.user_id = u.id
      WHERE aa.track_id = $1 
        AND aa.period_type = $2
        AND aa.period_start >= $3
        AND aa.period_end <= $4
      ORDER BY aa.period_start DESC
    `;
    
    const analyticsResult = await pool.query(analyticsQuery, [
      trackId, period, startDate, endDate
    ]);

    // Get real-time play count for comparison
    const playCountQuery = `
      SELECT play_count FROM tracks WHERE id = $1
    `;
    const playCountResult = await pool.query(playCountQuery, [trackId]);
    const currentPlayCount = playCountResult.rows[0]?.play_count || 0;

    res.json({
      track: {
        id: track.id,
        title: track.title,
        artist_username: track.username,
        current_play_count: currentPlayCount
      },
      analytics: analyticsResult.rows,
      period: {
        type: period,
        start_date: startDate,
        end_date: endDate
      }
    });

  } catch (error) {
    console.error('Error fetching track analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user analytics for the authenticated user
router.get('/users/me', authenticateToken, async (req, res) => {
  try {
    const { period = 'day', start_date, end_date } = req.query;
    const userId = req.user.id;

    // Build date range
    let startDate, endDate;
    if (start_date && end_date) {
      startDate = new Date(start_date);
      endDate = new Date(end_date);
    } else {
      const aggregator = new AnalyticsAggregator();
      const { start, end } = aggregator.calculatePeriodDates(period);
      startDate = start;
      endDate = end;
    }

    // Get user analytics data
    const analyticsQuery = `
      SELECT 
        uaa.*,
        u.username
      FROM user_analytics_aggregates uaa
      INNER JOIN users u ON uaa.user_id = u.id
      WHERE uaa.user_id = $1 
        AND uaa.period_type = $2
        AND uaa.period_start >= $3
        AND uaa.period_end <= $4
      ORDER BY uaa.period_start DESC
    `;
    
    const analyticsResult = await pool.query(analyticsQuery, [
      userId, period, startDate, endDate
    ]);

    // Get current follower count
    const followerQuery = `
      SELECT COUNT(*) as follower_count
      FROM follows 
      WHERE following_id = $1
    `;
    const followerResult = await pool.query(followerQuery, [userId]);
    const currentFollowerCount = parseInt(followerResult.rows[0]?.follower_count) || 0;

    // Get track count
    const trackCountQuery = `
      SELECT COUNT(*) as track_count
      FROM tracks 
      WHERE user_id = $1
    `;
    const trackCountResult = await pool.query(trackCountQuery, [userId]);
    const currentTrackCount = parseInt(trackCountResult.rows[0]?.track_count) || 0;

    res.json({
      user: {
        id: userId,
        username: req.user.username,
        current_follower_count: currentFollowerCount,
        current_track_count: currentTrackCount
      },
      analytics: analyticsResult.rows,
      period: {
        type: period,
        start_date: startDate,
        end_date: endDate
      }
    });

  } catch (error) {
    console.error('Error fetching user analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user analytics for a specific user (public data only)
router.get('/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { period = 'day', start_date, end_date } = req.query;

    // Get user info
    const userQuery = `
      SELECT id, username, is_private
      FROM users 
      WHERE username = $1
    `;
    const userResult = await pool.query(userQuery, [username]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Check if user is private
    if (user.is_private) {
      return res.status(403).json({ error: 'User profile is private' });
    }

    // Build date range
    let startDate, endDate;
    if (start_date && end_date) {
      startDate = new Date(start_date);
      endDate = new Date(end_date);
    } else {
      const aggregator = new AnalyticsAggregator();
      const { start, end } = aggregator.calculatePeriodDates(period);
      startDate = start;
      endDate = end;
    }

    // Get public analytics data (limited to what's publicly available)
    const analyticsQuery = `
      SELECT 
        uaa.period_start,
        uaa.period_end,
        uaa.total_plays_received,
        uaa.total_listeners_received,
        uaa.total_likes_received,
        uaa.total_comments_received,
        uaa.total_reposts_received,
        uaa.follower_count,
        uaa.tracks_uploaded
      FROM user_analytics_aggregates uaa
      WHERE uaa.user_id = $1 
        AND uaa.period_type = $2
        AND uaa.period_start >= $3
        AND uaa.period_end <= $4
      ORDER BY uaa.period_start DESC
    `;
    
    const analyticsResult = await pool.query(analyticsQuery, [
      user.id, period, startDate, endDate
    ]);

    // Get current public stats
    const publicStatsQuery = `
      SELECT 
        COUNT(DISTINCT t.id) as track_count,
        SUM(t.play_count) as total_plays,
        COUNT(DISTINCT f.follower_id) as follower_count
      FROM users u
      LEFT JOIN tracks t ON u.id = t.user_id AND t.is_private = false
      LEFT JOIN follows f ON u.id = f.following_id
      WHERE u.id = $1
    `;
    const publicStatsResult = await pool.query(publicStatsQuery, [user.id]);
    const publicStats = publicStatsResult.rows[0];

    res.json({
      user: {
        id: user.id,
        username: user.username,
        current_track_count: parseInt(publicStats.track_count) || 0,
        current_total_plays: parseInt(publicStats.total_plays) || 0,
        current_follower_count: parseInt(publicStats.follower_count) || 0
      },
      analytics: analyticsResult.rows,
      period: {
        type: period,
        start_date: startDate,
        end_date: endDate
      }
    });

  } catch (error) {
    console.error('Error fetching public user analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get platform-wide analytics (admin only)
router.get('/platform', authenticateToken, async (req, res) => {
  try {
    const { period = 'day', start_date, end_date } = req.query;
    const userId = req.user.id;

    // Check if user is admin (you can implement your own admin check)
    const adminQuery = `
      SELECT subscription_tier, verified
      FROM users 
      WHERE id = $1
    `;
    const adminResult = await pool.query(adminQuery, [userId]);
    const user = adminResult.rows[0];
    
    // For now, only allow verified users or supporters to access platform analytics
    if (!user.verified && user.subscription_tier === 'free') {
      return res.status(403).json({ error: 'Access denied. Platform analytics require verification or premium subscription.' });
    }

    // Build date range
    let startDate, endDate;
    if (start_date && end_date) {
      startDate = new Date(start_date);
      endDate = new Date(end_date);
    } else {
      const aggregator = new AnalyticsAggregator();
      const { start, end } = aggregator.calculatePeriodDates(period);
      startDate = start;
      endDate = end;
    }

    // Get platform-wide statistics
    const platformQuery = `
      SELECT 
        COUNT(DISTINCT tp.id) as total_plays,
        COUNT(DISTINCT tp.user_id) as unique_listeners,
        COUNT(DISTINCT t.id) as tracks_played,
        COUNT(DISTINCT t.user_id) as artists_played,
        AVG(COALESCE(tp.listen_duration, 0)) as avg_listen_duration,
        COUNT(CASE WHEN tp.is_complete_play THEN 1 END) as complete_plays
      FROM track_plays tp
      INNER JOIN tracks t ON tp.track_id = t.id
      WHERE tp.created_at >= $1 AND tp.created_at <= $2
    `;
    
    const platformResult = await pool.query(platformQuery, [startDate, endDate]);
    const platformStats = platformResult.rows[0];

    // Get engagement stats
    const engagementQuery = `
      SELECT 
        COUNT(l.id) as total_likes,
        COUNT(c.id) as total_comments,
        COUNT(r.id) as total_reposts,
        COUNT(f.id) as total_follows
      FROM track_plays tp
      INNER JOIN tracks t ON tp.track_id = t.id
      LEFT JOIN likes l ON t.id = l.track_id AND l.created_at >= $1 AND l.created_at <= $2
      LEFT JOIN comments c ON t.id = c.track_id AND c.created_at >= $1 AND c.created_at <= $2
      LEFT JOIN reposts r ON t.id = r.track_id AND r.created_at >= $1 AND r.created_at <= $2
      LEFT JOIN follows f ON t.id = f.following_id AND f.created_at >= $1 AND f.created_at <= $2
      WHERE tp.created_at >= $1 AND tp.created_at <= $2
    `;
    
    const engagementResult = await pool.query(engagementQuery, [startDate, endDate]);
    const engagementStats = engagementResult.rows[0];

    res.json({
      platform_stats: {
        total_plays: parseInt(platformStats.total_plays) || 0,
        unique_listeners: parseInt(platformStats.unique_listeners) || 0,
        tracks_played: parseInt(platformStats.tracks_played) || 0,
        artists_played: parseInt(platformStats.artists_played) || 0,
        avg_listen_duration: parseFloat(platformStats.avg_listen_duration) || 0,
        complete_plays: parseInt(platformStats.complete_plays) || 0,
        total_likes: parseInt(engagementStats.total_likes) || 0,
        total_comments: parseInt(engagementStats.total_comments) || 0,
        total_reposts: parseInt(engagementStats.total_reposts) || 0,
        total_follows: parseInt(engagementStats.total_follows) || 0
      },
      period: {
        type: period,
        start_date: startDate,
        end_date: endDate
      }
    });

  } catch (error) {
    console.error('Error fetching platform analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Manual trigger for analytics aggregation (admin only)
router.post('/aggregate', authenticateToken, async (req, res) => {
  try {
    const { period, date } = req.body;
    const userId = req.user.id;

    // Check if user is admin
    const adminQuery = `
      SELECT subscription_tier, verified
      FROM users 
      WHERE id = $1
    `;
    const adminResult = await pool.query(adminQuery, [userId]);
    const user = adminResult.rows[0];
    
    if (!user.verified && user.subscription_tier === 'free') {
      return res.status(403).json({ error: 'Access denied. Analytics aggregation requires verification or premium subscription.' });
    }

    const aggregator = new AnalyticsAggregator();
    
    if (period) {
      await aggregator.runPeriodAggregation(period, date ? new Date(date) : new Date());
    } else {
      await aggregator.runFullAggregation(date ? new Date(date) : new Date());
    }

    res.json({ 
      message: 'Analytics aggregation completed successfully',
      period: period || 'all',
      date: date || new Date().toISOString()
    });

  } catch (error) {
    console.error('Error triggering analytics aggregation:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 