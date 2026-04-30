import express from 'express';
import { optionalBetterAuthMiddleware as optionalAuthMiddleware } from '../middleware/betterAuthMiddleware.js';

const router = express.Router();
import pool from '../config/db.js';
import { searchLimiter } from '../middleware/rateLimiting.js';
import { getTrackPrivacyClause } from '../utils/trackUtils.js';

// Apply optional auth middleware to all routes
router.use(optionalAuthMiddleware);

// Apply search rate limiting to all search routes
router.use(searchLimiter);

// Search for tracks and users
router.get('/', async (req, res, next) => {
  const { query, type } = req.query;
  const userId = req.user?.id;
  
  if (!query) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  
  try {
    let tracks = [];
    let users = [];
    
    // If type is not specified or is 'tracks', search for tracks
    if (!type || type === 'all' || type === 'tracks') {
      const privacyClause = getTrackPrivacyClause(!!userId, 1);

      const tracksQuery = `
        SELECT DISTINCT
          t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration,
          t.layer, t.parent_track_id, t.play_count, t.metronome_bpm, t.created_at,
          u.username, u.verified, u.profile_pic_url, u.is_supporter,
          t2.title AS original_title,
          t.collab_count,
          EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
          t.like_count,
          EXISTS(SELECT 1 FROM reposts WHERE user_id = $1 AND track_id = t.id) AS is_reposted,
          CASE WHEN t.title ILIKE $3 THEN 0 ELSE 1 END AS title_match_order
        FROM tracks t
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        WHERE
          (
            t.title ILIKE $2 OR
            u.username ILIKE $2
          )
        AND t.processing_status = 'completed'
        AND t.team_id IS NULL
        AND t.camp_id IS NULL
        AND ${privacyClause}
        ORDER BY
          title_match_order,
          t.created_at DESC
        LIMIT 20
      `;
      
      const tracksResult = await pool.query(tracksQuery, [
        userId || null, 
        `%${query}%`,
        `${query}%` // Exact start match gets higher priority
      ]);
      
      tracks = await Promise.all(tracksResult.rows.map(async track => {
        let combinedAudioUrl = track.combined_audio_url || track.audio_url;
        if (combinedAudioUrl.startsWith('tracks/')) {
          // Use public R2 URL instead of signed URL
          combinedAudioUrl = `${process.env.R2_PUBLIC_URL}/${track.combined_audio_url || track.audio_url}`;
        }
        
        // Get genres for this track
        const genresResult = await pool.query(
          `SELECT g.* FROM genres g
           JOIN track_genres tg ON g.id = tg.genre_id
           WHERE tg.track_id = $1
           ORDER BY g.name`,
          [track.id]
        );
        
        // Get instruments for this track
        const instrumentsResult = await pool.query(
          `SELECT i.* FROM instruments i
           JOIN track_instruments ti ON i.id = ti.instrument_id
           WHERE ti.track_id = $1
           ORDER BY i.name`,
          [track.id]
        );
        
        return { 
          ...track, 
          combined_audio_url: combinedAudioUrl,
          genres: genresResult.rows,
          instruments: instrumentsResult.rows
        };
      }));
    }
    
    // If type is not specified or is 'users', search for users
    if (!type || type === 'all' || type === 'users') {
      const usersQuery = `
        SELECT
          u.id, u.username, u.name, u.profile_pic_url, u.verified, u.bio, u.is_private, u.is_supporter,
          (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS follower_count,
          (SELECT COUNT(*) FROM tracks WHERE user_id = u.id AND processing_status = 'completed') AS track_count,
          EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) AS is_following,
          CASE WHEN EXISTS(SELECT 1 FROM follow_requests WHERE requester_id = $1 AND target_id = u.id) THEN true ELSE false END AS has_requested_to_follow,
          CASE WHEN u.username ILIKE $3 THEN 0 ELSE 1 END AS username_match_order
        FROM users u
        WHERE 
          u.username ILIKE $2 OR
          u.bio ILIKE $2
        ORDER BY 
          username_match_order,
          follower_count DESC
        LIMIT 20
      `;
      
      const usersResult = await pool.query(usersQuery, [
        userId || null,
        `%${query}%`,
        `${query}%` // Exact start match gets higher priority
      ]);
      
      users = usersResult.rows;
    }
    
    res.json({
      tracks,
      users,
      query
    });
  } catch (err) {
    next(err);
  }
});

export default router; 