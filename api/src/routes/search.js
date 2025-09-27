const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { optionalAuthMiddleware } = require('../middleware/auth');
const { searchLimiter } = require('../middleware/rateLimiting');
const AWS = require('aws-sdk');

const s3 = new AWS.S3({
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  region: 'auto', // R2 uses 'auto' region
  endpoint: process.env.R2_ENDPOINT,
  signatureVersion: 'v4',
});

// Apply optional auth middleware to all routes
router.use(optionalAuthMiddleware);

// Apply search rate limiting to all search routes
router.use(searchLimiter);

// Search for tracks and users
router.get('/', async (req, res) => {
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
      const tracksQuery = `
        SELECT DISTINCT
          t.id, t.user_id, t.title, t.audio_url, t.combined_audio_url, t.duration, 
          t.layer, t.parent_track_id, t.play_count, t.metronome_bpm, t.created_at,
          u.username, u.verified, u.profile_pic_url,
          t2.title AS original_title,
          (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
          EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
          (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
          EXISTS(SELECT 1 FROM reposts WHERE user_id = $1 AND track_id = t.id) AS is_reposted,
          CASE WHEN t.title ILIKE $3 THEN 0 ELSE 1 END AS title_match_order
        FROM tracks t
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        WHERE 
          t.title ILIKE $2 OR
          u.username ILIKE $2
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
          u.id, u.username, u.profile_pic_url, u.verified, u.bio,
          (SELECT COUNT(*) FROM follows WHERE following_id = u.id) AS follower_count,
          (SELECT COUNT(*) FROM tracks WHERE user_id = u.id) AS track_count,
          EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) AS is_following,
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
    console.error('Search error:', err);
    res.status(500).json({ error: 'An error occurred while searching' });
  }
});

module.exports = router; 