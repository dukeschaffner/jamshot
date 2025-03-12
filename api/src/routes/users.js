const express = require('express');
const router = express.Router();
const AWS = require('aws-sdk');
const pool = require('../config/db');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const multer = require('multer');
const sharp = require('sharp');

AWS.config.update({ signatureVersion: 'v4' });
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Not an image! Please upload an image.'), false);
    }
  },
});

// Apply optional auth middleware to all routes
router.use(optionalAuthMiddleware);

// Get current user details
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, verified, email_verified, profile_pic_url, is_private FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user profile
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, username, bio, verified, profile_pic_url, is_private FROM users WHERE id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's tracks
router.get('/:userId/tracks', async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user?.id;
  
  try {
    // Check if the user account is private
    const userResult = await pool.query(
      'SELECT is_private FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isPrivate = userResult.rows[0].is_private;
    
    // If account is private, check if the current user is following them
    if (isPrivate && currentUserId !== parseInt(userId)) {
      // Check if the current user is following this user
      const isFollowing = currentUserId ? await pool.query(
        'SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2) as is_following',
        [currentUserId, userId]
      ) : { rows: [{ is_following: false }] };
      
      // If not following, return empty array
      if (!isFollowing.rows[0].is_following) {
        return res.json([]);
      }
    }
    
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
        u.username,
        u.verified,
        u.profile_pic_url,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.user_id = $1
      ORDER BY t.created_at DESC
    `, [userId]);

    const tracks = await Promise.all(result.rows.map(async track => {
      let audioUrl = track.audio_url;
      let combinedAudioUrl = track.combined_audio_url || track.audio_url;

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
  
  // Don't allow following yourself
  if (userId == followerId) {
    return res.status(400).json({ error: 'Cannot follow yourself' });
  }
  
  try {
    // Check if the user is private
    const userResult = await pool.query(
      'SELECT is_private FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isPrivate = userResult.rows[0].is_private;
    
    // If the account is private, create a follow request instead of directly following
    if (isPrivate) {
      // Check if a request already exists
      const existingRequest = await pool.query(
        'SELECT id FROM follow_requests WHERE requester_id = $1 AND target_id = $2',
        [followerId, userId]
      );
      
      if (existingRequest.rows.length > 0) {
        return res.status(400).json({ error: 'Follow request already sent' });
      }
      
      // Check if already following
      const existingFollow = await pool.query(
        'SELECT id FROM follows WHERE follower_id = $1 AND following_id = $2',
        [followerId, userId]
      );
      
      if (existingFollow.rows.length > 0) {
        return res.status(400).json({ error: 'Already following this user' });
      }
      
      // Create follow request
      await pool.query(
        'INSERT INTO follow_requests (requester_id, target_id) VALUES ($1, $2)',
        [followerId, userId]
      );
      
      // Create notification for the target user
      await pool.query(
        `INSERT INTO notifications (user_id, type, related_user_id) 
         VALUES ($1, 'follow_request', $2)`,
        [userId, followerId]
      );
      
      return res.status(200).json({ message: 'Follow request sent' });
    }
    
    // For public accounts, follow directly
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
    // Check if the user account is private
    const userResult = await pool.query(
      'SELECT is_private FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isPrivate = userResult.rows[0].is_private;
    
    // If account is private, check if the current user is following them
    if (isPrivate && currentUserId !== parseInt(userId)) {
      // Check if the current user is following this user
      const isFollowing = currentUserId ? await pool.query(
        'SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2) as is_following',
        [currentUserId, userId]
      ) : { rows: [{ is_following: false }] };
      
      // If not following, return empty array
      if (!isFollowing.rows[0].is_following) {
        return res.json([]);
      }
    }
    
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
        u.username,
        u.verified,
        u.profile_pic_url,
        r.created_at as reposted_at,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count
      FROM reposts r
      JOIN tracks t ON r.track_id = t.id
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `, [userId]);

    const tracks = await Promise.all(result.rows.map(async track => {
      let audioUrl = track.audio_url;
      let combinedAudioUrl = track.combined_audio_url || track.audio_url;
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

// Update user profile
router.put('/me', authMiddleware, async (req, res) => {
  try {
    const { username, bio, is_private } = req.body;
    
    // Check if username is taken (if username is being updated)
    if (username) {
      const existingUser = await pool.query(
        'SELECT id FROM users WHERE username = $1 AND id != $2',
        [username, req.user.id]
      );
      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'Username is already taken' });
      }
    }
    
    // Update user profile
    const result = await pool.query(
      `UPDATE users 
       SET username = COALESCE($1, username),
           bio = COALESCE($2, bio),
           is_private = COALESCE($3, is_private)
       WHERE id = $4
       RETURNING id, username, email, bio, profile_pic_url, verified, email_verified, is_private`,
      [username, bio, is_private, req.user.id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload and update profile image
router.post('/me/profile-image', authMiddleware, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Parse position if provided, default to center if not
    let gravity = 'center'; // Sharp uses 'center' not 'centre'
    if (req.body.position) {
      try {
        const posData = JSON.parse(req.body.position);
        // Convert x,y coordinates to gravity values
        if (posData.y < 0.4) {
          if (posData.x < 0.4) gravity = 'northwest';
          else if (posData.x > 0.6) gravity = 'northeast';
          else gravity = 'north';
        } else if (posData.y > 0.6) {
          if (posData.x < 0.4) gravity = 'southwest';
          else if (posData.x > 0.6) gravity = 'southeast';
          else gravity = 'south';
        } else {
          if (posData.x < 0.4) gravity = 'west';
          else if (posData.x > 0.6) gravity = 'east';
        }
      } catch (e) {
        console.warn('Invalid position data:', e);
      }
    }

    // Get user's current profile image URL
    const currentUser = await pool.query(
      'SELECT profile_pic_url FROM users WHERE id = $1',
      [req.user.id]
    );

    // If user has an existing profile image, delete it from S3
    if (currentUser.rows[0]?.profile_pic_url) {
      const oldKey = currentUser.rows[0].profile_pic_url;
      try {
        await s3.deleteObject({
          Bucket: process.env.S3_BUCKET,
          Key: oldKey
        }).promise();
      } catch (err) {
        console.warn('Failed to delete old profile image:', err);
        // Continue with upload even if delete fails
      }
    }

    // Process image with sharp
    const processedImageBuffer = await sharp(req.file.buffer)
      .resize(400, 400, {
        fit: sharp.fit.cover,
        position: gravity
      })
      .toFormat('jpeg')
      .jpeg({ quality: 90 })
      .toBuffer();

    // Generate unique filename
    const filename = `images/profile/${req.user.id}-${Date.now()}.jpg`;

    // Upload to S3
    await s3.putObject({
      Bucket: process.env.S3_BUCKET,
      Key: filename,
      Body: processedImageBuffer,
      ContentType: 'image/jpeg'
    }).promise();

    // Get the S3 URL for the uploaded image
    const s3Url = `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${filename}`;

    // Update user's profile_image_url in database with the S3 URL
    const result = await pool.query(
      'UPDATE users SET profile_pic_url = $1 WHERE id = $2 RETURNING id, username, email, bio, profile_pic_url, verified',
      [s3Url, req.user.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Profile image upload error:', err);
    res.status(500).json({ error: 'Failed to upload profile image' });
  }
});

// Toggle account privacy
router.put('/me/privacy', authMiddleware, async (req, res) => {
  try {
    const { is_private } = req.body;
    
    if (typeof is_private !== 'boolean') {
      return res.status(400).json({ error: 'is_private must be a boolean value' });
    }
    
    const result = await pool.query(
      'UPDATE users SET is_private = $1 WHERE id = $2 RETURNING id, username, is_private',
      [is_private, req.user.id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending follow requests for current user
router.get('/me/follow-requests', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT fr.id, fr.created_at, 
             u.id as user_id, u.username, u.profile_pic_url, u.verified
      FROM follow_requests fr
      JOIN users u ON fr.requester_id = u.id
      WHERE fr.target_id = $1
      ORDER BY fr.created_at DESC
    `, [req.user.id]);
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Accept a follow request
router.post('/follow-requests/:requestId/accept', authMiddleware, async (req, res) => {
  const { requestId } = req.params;
  
  try {
    // Start a transaction
    await pool.query('BEGIN');
    
    // Get the follow request
    const requestResult = await pool.query(
      'SELECT * FROM follow_requests WHERE id = $1 AND target_id = $2',
      [requestId, req.user.id]
    );
    
    if (requestResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Follow request not found' });
    }
    
    const request = requestResult.rows[0];
    
    // Create the follow relationship
    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [request.requester_id, req.user.id]
    );
    
    // Delete the follow request
    await pool.query(
      'DELETE FROM follow_requests WHERE id = $1',
      [requestId]
    );
    
    // Delete the notification
    await pool.query(
      `DELETE FROM notifications 
       WHERE user_id = $1 AND type = 'follow_request' AND related_user_id = $2`,
      [req.user.id, request.requester_id]
    );
    
    await pool.query('COMMIT');
    
    res.json({ message: 'Follow request accepted' });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

// Reject a follow request
router.post('/follow-requests/:requestId/reject', authMiddleware, async (req, res) => {
  const { requestId } = req.params;
  
  try {
    // Start a transaction
    await pool.query('BEGIN');
    
    // Get the follow request
    const requestResult = await pool.query(
      'SELECT * FROM follow_requests WHERE id = $1 AND target_id = $2',
      [requestId, req.user.id]
    );
    
    if (requestResult.rows.length === 0) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ error: 'Follow request not found' });
    }
    
    const request = requestResult.rows[0];
    
    // Delete the follow request
    await pool.query(
      'DELETE FROM follow_requests WHERE id = $1',
      [requestId]
    );
    
    // Delete the notification
    await pool.query(
      `DELETE FROM notifications 
       WHERE user_id = $1 AND type = 'follow_request' AND related_user_id = $2`,
      [req.user.id, request.requester_id]
    );
    
    await pool.query('COMMIT');
    
    res.json({ message: 'Follow request rejected' });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;