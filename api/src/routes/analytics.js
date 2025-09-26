const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const pool = require('../config/db');
const AnalyticsAggregator = require('../utils/analyticsAggregator');
const { canUserAccessAnalytics, canUserAccessStreamsByUser } = require('../utils/subscriptionUtils');

/**
 * Analytics API Routes
 * Provides aggregated analytics data for dashboards and reporting
 * All endpoints require authentication and respect user privacy settings
 */

// Get track analytics for a specific track
router.get('/tracks/:trackId', authMiddleware, async (req, res) => {
  try {
    const { trackId } = req.params;
    const { period = 'day', start_date, end_date } = req.query;
    const userId = req.user.id;

    const userResult = await pool.query(
      'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check subscription access - analytics requires basic or premium
    if (!canUserAccessAnalytics(userResult.rows[0])) {
      return res.status(403).json({ 
        error: 'Analytics access denied', 
        message: 'Analytics requires a Basic or Premium subscription.',
        upgrade_required: true
      });
    }

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
    
    // Check ownership - users can only view analytics for their own tracks
    if (track.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied. You can only view analytics for your own tracks.' });
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

// Get streams by user for a specific track
router.get('/tracks/:trackId/streams', authMiddleware, async (req, res) => {
  try {
    const { trackId } = req.params;
    const { start_date, end_date } = req.query;
    const userId = req.user.id;

    const userResult = await pool.query(
      'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check subscription access - analytics requires basic or premium
    if (!canUserAccessAnalytics(userResult.rows[0])) {
      return res.status(403).json({ 
        error: 'Analytics access denied', 
        message: 'Analytics requires a Basic or Premium subscription.',
        upgrade_required: true
      });
    }

    // Verify track exists and user owns it
    const trackAccessQuery = `
      SELECT t.id, t.user_id, t.title
      FROM tracks t
      WHERE t.id = $1
    `;
    
    const trackResult = await pool.query(trackAccessQuery, [trackId]);
    
    if (trackResult.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const track = trackResult.rows[0];
    
    // Check ownership - users can only view streams for their own tracks
    if (track.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied. You can only view streams for your own tracks.' });
    }

    // Build date range - default to last 30 days if not provided
    let startDate, endDate;
    if (start_date && end_date) {
      startDate = new Date(start_date);
      endDate = new Date(end_date);
    } else {
      endDate = new Date();
      startDate = new Date();
      startDate.setDate(startDate.getDate() - 30); // Default to last 30 days
    }

    // Get top 15 users by play count for this track in the time window
    const streamsQuery = `
      SELECT 
        u.id,
        u.username,
        u.profile_pic_url,
        COUNT(tp.id) as play_count
      FROM track_plays tp
      INNER JOIN users u ON tp.user_id = u.id
      WHERE tp.track_id = $1 
        AND tp.user_id IS NOT NULL
        AND tp.created_at >= $2
        AND tp.created_at <= $3
      GROUP BY u.id, u.username, u.profile_pic_url
      ORDER BY play_count DESC
      LIMIT 15
    `;
    
    const streamsResult = await pool.query(streamsQuery, [
      trackId, startDate, endDate
    ]);

    let streamData = streamsResult.rows;

    // Check if user has access to detailed streams by user data
    const hasDetailedAccess = canUserAccessStreamsByUser(userResult.rows[0]);
    
    // Helper function to obfuscate username by randomly replacing alphabetic characters
    const obfuscateUsername = (username) => {
      const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
      return username.replace(/[a-zA-Z]/g, () => {
        return chars[Math.floor(Math.random() * chars.length)];
      });
    };
    
    // If user doesn't have detailed access, obfuscate usernames
    if (!hasDetailedAccess) {
      streamData = streamData.map((stream) => ({
        id: stream.id,
        username: obfuscateUsername(stream.username), // Obfuscated username with random characters
        profile_pic_url: stream.profile_pic_url,
        play_count: stream.play_count
      }));
    }

    res.json({
      track: {
        id: track.id,
        title: track.title
      },
      streams: streamData,
      period: {
        start_date: startDate,
        end_date: endDate
      },
      has_detailed_access: hasDetailedAccess,
      total_users: streamData.length
    });

  } catch (error) {
    console.error('Error fetching track streams:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user analytics for the authenticated user
router.get('/users/me', authMiddleware, async (req, res) => {
  try {
    const { period = 'day', start_date, end_date } = req.query;
    const userId = req.user.id;

    const userResult = await pool.query(
      'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check subscription access - analytics requires basic or premium
    if (!canUserAccessAnalytics(userResult.rows[0])) {
      return res.status(403).json({ 
        error: 'Analytics access denied', 
        message: 'Analytics requires a Basic or Premium subscription.',
        upgrade_required: true
      });
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

// Get user analytics for a specific user - requires authentication and users can only access their own analytics
router.get('/users/:username', authMiddleware, async (req, res) => {
  try {
    const { username } = req.params;
    const { period = 'day', start_date, end_date } = req.query;
    const requestingUserId = req.user.id;

    const userResult = await pool.query(
      'SELECT id, username, is_private, subscription_tier, subscription_expires_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check subscription access - analytics requires basic or premium
    if (!canUserAccessAnalytics(userResult.rows[0])) {
      return res.status(403).json({ 
        error: 'Analytics access denied', 
        message: 'Analytics requires a Basic or Premium subscription.',
        upgrade_required: true
      });
    }
    
    const user = userResult.rows[0];
    
    // Check ownership - users can only view their own analytics
    if (user.id !== requestingUserId) {
      return res.status(403).json({ error: 'Access denied. You can only view your own analytics.' });
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

    // Get user analytics data (same as /users/me endpoint since user can only access their own)
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
      user.id, period, startDate, endDate
    ]);

    // Get current follower count
    const followerQuery = `
      SELECT COUNT(*) as follower_count
      FROM follows 
      WHERE following_id = $1
    `;
    const followerResult = await pool.query(followerQuery, [user.id]);
    const currentFollowerCount = parseInt(followerResult.rows[0]?.follower_count) || 0;

    // Get track count
    const trackCountQuery = `
      SELECT COUNT(*) as track_count
      FROM tracks 
      WHERE user_id = $1
    `;
    const trackCountResult = await pool.query(trackCountQuery, [user.id]);
    const currentTrackCount = parseInt(trackCountResult.rows[0]?.track_count) || 0;

    res.json({
      user: {
        id: user.id,
        username: user.username,
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

// Get platform-wide analytics (admin only)
router.get('/platform', authMiddleware, async (req, res) => {
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
router.post('/aggregate', authMiddleware, async (req, res) => {
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