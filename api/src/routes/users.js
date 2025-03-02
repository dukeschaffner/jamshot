const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');
const pool = require('../config/db');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');

AWS.config.update({ signatureVersion: 'v4' });
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Apply optional auth middleware to all routes
router.use(optionalAuthMiddleware);

// Get user's tracks
router.get('/:userId/tracks', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(`
      SELECT 
        t.id, 
        t.user_id, 
        t.title, 
        t.audio_url, 
        t.combined_audio_url, 
        t.duration, 
        t.layer, 
        t.parent_track_id, 
        t2.title AS original_title,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
    `, [userId]);

    const tracks = await Promise.all(result.rows.map(async track => {
      let audioUrl = track.audio_url;
      let combinedAudioUrl = track.combined_audio_url || track.audio_url;
      if (process.env.NODE_ENV !== 'production') {
        audioUrl = `http://localhost:5000${audioUrl}`;
        combinedAudioUrl = `http://localhost:5000${combinedAudioUrl}`;
      } else {
        if (audioUrl.startsWith('tracks/')) {
          audioUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET,
            Key: track.audio_url,
            Expires: 3600,
          });
        }
        if (combinedAudioUrl.startsWith('tracks/')) {
          combinedAudioUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET,
            Key: track.combined_audio_url || track.audio_url,
            Expires: 3600,
          });
        }
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
        audio_url: audioUrl, 
        combined_audio_url: combinedAudioUrl,
        genres: genresResult.rows,
        instruments: instrumentsResult.rows
      };
    }));

    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Follow a user
router.post('/follow/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const followerId = req.user.id;
  try {
    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [followerId, userId]
    );
    res.status(200).json({ message: 'Followed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unfollow a user
router.delete('/follow/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const followerId = req.user.id;
  try {
    const result = await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not following this user' });
    }
    res.status(200).json({ message: 'Unfollowed successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get follow stats
router.get('/:userId/stats', async (req, res) => {
  const { userId } = req.params;
  try {
    const followers = await pool.query(
      'SELECT COUNT(*) as followers FROM follows WHERE following_id = $1',
      [userId]
    );
    const following = await pool.query(
      'SELECT COUNT(*) as following FROM follows WHERE follower_id = $1',
      [userId]
    );
    const isFollowing = req.user
      ? await pool.query(
          'SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2) as is_following',
          [req.user.id, userId]
        )
      : { rows: [{ is_following: false }] };
    res.json({
      followers: parseInt(followers.rows[0].followers, 10),
      following: parseInt(following.rows[0].following, 10),
      isFollowing: isFollowing.rows[0].is_following,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's reposted tracks
router.get('/:userId/reposts', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user?.id; // Optional chaining in case user is not authenticated
  
  try {
    const result = await pool.query(`
      SELECT 
        t.id, 
        t.user_id, 
        t.title, 
        t.audio_url, 
        t.combined_audio_url, 
        t.duration, 
        t.layer, 
        t.parent_track_id,
        r.created_at AS reposted_at,
        u.username, 
        u.verified,
        t2.title AS original_title,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
        EXISTS(SELECT 1 FROM likes WHERE user_id = $1 AND track_id = t.id) AS is_liked,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
        EXISTS(SELECT 1 FROM reposts WHERE user_id = $1 AND track_id = t.id) AS is_reposted
      FROM reposts r
      JOIN tracks t ON r.track_id = t.id
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE r.user_id = $2
      ORDER BY r.created_at DESC
    `, [currentUserId || null, userId]);

    const tracks = await Promise.all(result.rows.map(async track => {
      let audioUrl = track.audio_url;
      let combinedAudioUrl = track.combined_audio_url || track.audio_url;
      if (process.env.NODE_ENV !== 'production') {
        audioUrl = `http://localhost:5000${audioUrl}`;
        combinedAudioUrl = `http://localhost:5000${combinedAudioUrl}`;
      } else {
        if (audioUrl.startsWith('tracks/')) {
          audioUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET,
            Key: track.audio_url,
            Expires: 3600,
          });
        }
        if (combinedAudioUrl.startsWith('tracks/')) {
          combinedAudioUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.S3_BUCKET,
            Key: track.combined_audio_url || track.audio_url,
            Expires: 3600,
          });
        }
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
        audio_url: audioUrl, 
        combined_audio_url: combinedAudioUrl,
        genres: genresResult.rows,
        instruments: instrumentsResult.rows,
        is_repost: true
      };
    }));

    res.json(tracks);
  } catch (err) {
    console.error('Get reposts error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;