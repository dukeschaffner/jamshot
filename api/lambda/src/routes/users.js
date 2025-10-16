const express = require('express');
const router = express.Router();
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const pool = require('../config/db');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const {
  interactionLimiter,
  uploadLimiter,
  contentCreationLimiter
} = require('../middleware/rateLimiting');
const multer = require('multer');
const sharp = require('sharp');
const { getBaseTrackSelectQuery, processTrack, deleteTrack } = require('../utils/trackUtils');
const bcrypt = require('bcryptjs');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const s3Client = new S3Client({
  region: 'auto', // R2 uses 'auto' region
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.R2_ENDPOINT,
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
      'SELECT id, username, name, email, verified, email_verified, profile_pic_url, bio, is_private, terms_accepted, privacy_policy_accepted, policy_accepted_at, policy_version, subscription_tier, subscription_expires_at FROM users WHERE id = $1',
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
      'SELECT id, username, name, bio, verified, profile_pic_url, is_private FROM users WHERE id = $1',
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

    let baseQuery;
    let queryParams;
    if (currentUserId) {
      baseQuery = getBaseTrackSelectQuery(true, 2);
      queryParams = [userId, currentUserId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false);
      queryParams = [userId];
    }

    const result = await pool.query(`
      SELECT 
        ${baseQuery}
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE t.user_id = $1
      AND t.processing_status = 'completed'
      ORDER BY t.created_at DESC
    `, queryParams);

    // Use the processTrack utility function to process all tracks
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, currentUserId)));

    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Follow a user
router.post('/follow/:userId', interactionLimiter, authMiddleware, async (req, res) => {
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
  const currentUserId = req.user?.id;
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
    let hasRequestedToFollow = false;
    if (!isFollowing.rows[0].is_following) {
      const requestCheckResult = await pool.query(
        'SELECT EXISTS(SELECT 1 FROM follow_requests WHERE requester_id = $1 AND target_id = $2) as has_requested',
        [currentUserId, userId]
      );
      hasRequestedToFollow = requestCheckResult.rows[0].has_requested;
    }
    res.json({
      followers: parseInt(followers.rows[0].followers, 10),
      following: parseInt(following.rows[0].following, 10),
      isFollowing: isFollowing.rows[0].is_following,
      hasRequestedToFollow: hasRequestedToFollow
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's followers with pagination
router.get('/:userId/followers', optionalAuthMiddleware, async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user?.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
  try {
    // Check if the user exists
    const userResult = await pool.query(
      'SELECT is_private FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isPrivate = userResult.rows[0].is_private;
    
    // If account is private and current user is not the owner or a follower, return empty array
    if (isPrivate && currentUserId !== parseInt(userId)) {
      // Check if the current user is following this user
      const isFollowing = currentUserId ? await pool.query(
        'SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2) as is_following',
        [currentUserId, userId]
      ) : { rows: [{ is_following: false }] };
      
      if (!isFollowing.rows[0].is_following) {
        return res.json({ users: [], hasMore: false });
      }
    }
    
    // Get followers with pagination
    const followersQuery = `
      SELECT u.id, u.username, u.name, u.profile_pic_url, u.verified,
             EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following
      FROM follows f
      JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = $2
      ORDER BY f.created_at DESC
      LIMIT $3 OFFSET $4
    `;
    
    const countQuery = `
      SELECT COUNT(*) FROM follows WHERE following_id = $1
    `;
    
    const [followersResult, countResult] = await Promise.all([
      pool.query(followersQuery, [currentUserId || null, userId, limit, offset]),
      pool.query(countQuery, [userId])
    ]);
    
    const totalCount = parseInt(countResult.rows[0].count);
    const hasMore = totalCount > offset + limit;
    
    res.json({
      users: followersResult.rows,
      hasMore
    });
    
  } catch (err) {
    console.error('Get followers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get users the specified user is following with pagination
router.get('/:userId/following', optionalAuthMiddleware, async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user?.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
  try {
    // Check if the user exists
    const userResult = await pool.query(
      'SELECT is_private FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isPrivate = userResult.rows[0].is_private;
    
    // If account is private and current user is not the owner or a follower, return empty array
    if (isPrivate && currentUserId !== parseInt(userId)) {
      // Check if the current user is following this user
      const isFollowing = currentUserId ? await pool.query(
        'SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2) as is_following',
        [currentUserId, userId]
      ) : { rows: [{ is_following: false }] };
      
      if (!isFollowing.rows[0].is_following) {
        return res.json({ users: [], hasMore: false });
      }
    }
    
    // Get following with pagination
    const followingQuery = `
      SELECT u.id, u.username, u.name, u.profile_pic_url, u.verified,
             EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = u.id) as is_following
      FROM follows f
      JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = $2
      ORDER BY f.created_at DESC
      LIMIT $3 OFFSET $4
    `;
    
    const countQuery = `
      SELECT COUNT(*) FROM follows WHERE follower_id = $1
    `;
    
    const [followingResult, countResult] = await Promise.all([
      pool.query(followingQuery, [currentUserId || null, userId, limit, offset]),
      pool.query(countQuery, [userId])
    ]);
    
    const totalCount = parseInt(countResult.rows[0].count);
    const hasMore = totalCount > offset + limit;
    
    res.json({
      users: followingResult.rows,
      hasMore
    });
    
  } catch (err) {
    console.error('Get following error:', err);
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
    
    let baseQuery;
    let queryParams;
    if (currentUserId) {
      baseQuery = getBaseTrackSelectQuery(true, 2);
      queryParams = [userId, currentUserId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false);
      queryParams = [userId];
    }

    const result = await pool.query(`
      SELECT 
        ${baseQuery},
        r.created_at as reposted_at,
        TRUE AS is_repost
      FROM reposts r
      JOIN tracks t ON r.track_id = t.id
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `, queryParams);

    // Use the processTrack utility function to process all tracks
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, currentUserId)));

    res.json(tracks);
  } catch (err) {
    console.error('Get reposts error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update user profile
router.put('/me', authMiddleware, async (req, res) => {
  try {
    let { username, name, bio, is_private } = req.body;
    
    // Validate name is provided
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Full name is required' });
    }
    
    // Name length validation: max 40 characters
    if (name.length > 40) {
      return res.status(400).json({ error: 'Name must be 40 characters or less.' });
    }
    
    // Username validation: only allow letters, numbers, and underscores
    if (username && !/^\w+$/.test(username)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
    }

    // Username length validation: max 20 characters
    if (username && username.length > 20) {
      return res.status(400).json({ error: 'Username must be 20 characters or less.' });
    }

    //username to lowercase
    if (username) {
      username = username.toLowerCase();
    }

    // Prevent using "me" as username
    if (username === 'me') {
      return res.status(400).json({ error: 'Username "me" is not allowed' });
    }

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
           name = $2,
           bio = COALESCE($3, bio),
           is_private = COALESCE($4, is_private)
       WHERE id = $5
       RETURNING id, username, name, email, bio, profile_pic_url, verified, email_verified, is_private`,
      [username, name, bio, is_private, req.user.id]
    );
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload and update profile image
router.post('/me/profile-image', uploadLimiter, authMiddleware, upload.single('image'), async (req, res) => {
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
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: oldKey
        }));
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

    // Upload to R2
    await s3Client.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: filename,
      Body: processedImageBuffer,
      ContentType: 'image/jpeg'
    }));

    // Get the S3 URL for the uploaded image
    const s3Url = `${process.env.R2_PUBLIC_URL}/${filename}`;

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
             u.id as user_id, u.username, u.name, u.profile_pic_url, u.verified
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
router.post('/follow-requests/:requestId/accept', interactionLimiter, authMiddleware, async (req, res) => {
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
router.post('/follow-requests/:requestId/reject', interactionLimiter, authMiddleware, async (req, res) => {
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

// Get user profile by username
router.get('/by-username/:username', async (req, res) => {
  const { username } = req.params;
  try {
    const result = await pool.query(
      'SELECT id, username, name, bio, verified, profile_pic_url, is_private FROM users WHERE username = $1',
      [username]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's tracks by username
router.get('/by-username/:username/tracks', async (req, res) => {
  const { username } = req.params;
  const currentUserId = req.user?.id;
  
  try {
    // First get the user ID from username
    const userResult = await pool.query(
      'SELECT id, is_private FROM users WHERE username = $1',
      [username]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    const isPrivate = userResult.rows[0].is_private;
    
    // If account is private, check if the current user is following them
    if (isPrivate && currentUserId !== userId) {
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
    
    // Get tracks with additional info
    const tracksQuery = `
      SELECT t.*, 
             u.username, 
             u.verified,
             u.profile_pic_url,
             COALESCE(l.like_count, 0) as like_count,
             COALESCE(p.play_count, 0) as play_count,
             COALESCE(c.collab_count, 0) as collab_count,
             ot.title as original_title,
             CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END as is_liked,
             CASE WHEN ur.user_id IS NOT NULL THEN true ELSE false END as is_reposted
      FROM tracks t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN (SELECT track_id, COUNT(*) as like_count FROM likes GROUP BY track_id) l ON t.id = l.track_id
      LEFT JOIN (SELECT track_id, COUNT(*) as play_count FROM plays GROUP BY track_id) p ON t.id = p.track_id
      LEFT JOIN (SELECT parent_track_id, COUNT(*) as collab_count FROM tracks WHERE parent_track_id IS NOT NULL GROUP BY parent_track_id) c ON t.id = c.parent_track_id
      LEFT JOIN tracks ot ON t.parent_track_id = ot.id
      LEFT JOIN likes ul ON t.id = ul.track_id AND ul.user_id = $2
      LEFT JOIN reposts ur ON t.id = ur.track_id AND ur.user_id = $2
      WHERE t.user_id = $1
      AND t.processing_status = 'completed'
      ORDER BY t.created_at DESC
    `;
    
    const tracksResult = await pool.query(tracksQuery, [userId, currentUserId || null]);
    res.json(tracksResult.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's reposts by username
router.get('/by-username/:username/reposts', async (req, res) => {
  const { username } = req.params;
  const currentUserId = req.user?.id;
  
  try {
    // First get the user ID from username
    const userResult = await pool.query(
      'SELECT id, is_private FROM users WHERE username = $1',
      [username]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    const isPrivate = userResult.rows[0].is_private;
    
    // If account is private, check if the current user is following them
    if (isPrivate && currentUserId !== userId) {
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
    
    // Get reposts with additional info
    const repostsQuery = `
      SELECT t.*, 
             u.username, 
             u.verified,
             u.profile_pic_url,
             r.created_at as repost_date,
             ru.username as reposted_by_username,
             COALESCE(l.like_count, 0) as like_count,
             COALESCE(p.play_count, 0) as play_count,
             COALESCE(c.collab_count, 0) as collab_count,
             ot.title as original_title,
             CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END as is_liked,
             true as is_reposted
      FROM reposts r
      JOIN tracks t ON r.track_id = t.id
      JOIN users u ON t.user_id = u.id
      JOIN users ru ON r.user_id = ru.id
      LEFT JOIN (SELECT track_id, COUNT(*) as like_count FROM likes GROUP BY track_id) l ON t.id = l.track_id
      LEFT JOIN (SELECT track_id, COUNT(*) as play_count FROM plays GROUP BY track_id) p ON t.id = p.track_id
      LEFT JOIN (SELECT parent_track_id, COUNT(*) as collab_count FROM tracks WHERE parent_track_id IS NOT NULL GROUP BY parent_track_id) c ON t.id = c.parent_track_id
      LEFT JOIN tracks ot ON t.parent_track_id = ot.id
      LEFT JOIN likes ul ON t.id = ul.track_id AND ul.user_id = $2
      WHERE r.user_id = $1
      ORDER BY r.created_at DESC
    `;
    
    const repostsResult = await pool.query(repostsQuery, [userId, currentUserId || null]);
    res.json(repostsResult.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Follow a user by username
router.post('/follow/username/:username', interactionLimiter, authMiddleware, async (req, res) => {
  const { username } = req.params;
  const followerId = req.user.id;
  
  try {
    // Get the user ID from username
    const userResult = await pool.query(
      'SELECT id, is_private FROM users WHERE username = $1',
      [username]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const followingId = userResult.rows[0].id;
    const isPrivate = userResult.rows[0].is_private;
    
    // Prevent following yourself
    if (followerId === followingId) {
      return res.status(400).json({ error: 'You cannot follow yourself' });
    }
    
    // Check if already following
    const existingFollow = await pool.query(
      'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    
    if (existingFollow.rows.length > 0) {
      return res.status(400).json({ error: 'Already following this user' });
    }
    
    // If the account is private, create a follow request instead of direct follow
    if (isPrivate) {
      // Check if there's already a pending request
      const existingRequest = await pool.query(
        'SELECT * FROM follow_requests WHERE requester_id = $1 AND target_id = $2',
        [followerId, followingId]
      );
      
      if (existingRequest.rows.length > 0) {
        return res.status(400).json({ error: 'Follow request already sent' });
      }
      
      // Create follow request
      await pool.query(
        'INSERT INTO follow_requests (requester_id, target_id) VALUES ($1, $2)',
        [followerId, followingId]
      );
      
      // Create notification for the target user
      await pool.query(
        `INSERT INTO notifications (user_id, type, related_user_id) 
         VALUES ($1, 'follow_request', $2)`,
        [followingId, followerId]
      );
      
      return res.status(200).json({ message: 'Follow request sent' });
    } else {
      // For public accounts, create direct follow
      await pool.query(
        'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
        [followerId, followingId]
      );
      
      return res.status(200).json({ message: 'Now following user' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Unfollow a user by username
router.delete('/follow/username/:username', authMiddleware, async (req, res) => {
  const { username } = req.params;
  const followerId = req.user.id;
  
  try {
    // Get the user ID from username
    const userResult = await pool.query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const followingId = userResult.rows[0].id;
    
    // Delete the follow relationship
    await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    
    // Also delete any pending follow requests
    await pool.query(
      'DELETE FROM follow_requests WHERE requester_id = $1 AND target_id = $2',
      [followerId, followingId]
    );
    
    res.status(200).json({ message: 'Unfollowed user' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get user's liked tracks by username
router.get('/:username/liked', async (req, res) => {
  const { username } = req.params;
  const currentUserId = req.user?.id;
  
  try {
    // First get the user ID from username
    const userResult = await pool.query(
      'SELECT id, is_private FROM users WHERE username = $1',
      [username]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    const isPrivate = userResult.rows[0].is_private;
    
    // If account is private, check if the current user is following them
    if (isPrivate && currentUserId !== userId) {
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
    
    let baseQuery;
    let queryParams;
    if (currentUserId) {
      baseQuery = getBaseTrackSelectQuery(true, 2);
      queryParams = [userId, currentUserId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false);
      queryParams = [userId];
    }

    const result = await pool.query(`
      SELECT 
        ${baseQuery},
        l.created_at as liked_at,
        TRUE AS is_liked_by_user
      FROM likes l
      JOIN tracks t ON l.track_id = t.id
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE l.user_id = $1
      ORDER BY l.created_at DESC
    `, queryParams);

    // Use the processTrack utility function to process all tracks
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, currentUserId)));

    res.json(tracks);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete user account
router.delete('/me', contentCreationLimiter, authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { password } = req.body;
  
  try {
    // Verify password
    const userResult = await pool.query(
      'SELECT password_hash, stripe_customer_id, stripe_subscription_id, profile_pic_url FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }
    
    // Get all user's tracks
    const tracksResult = await pool.query(
      'SELECT id FROM tracks WHERE user_id = $1',
      [userId]
    );
    
    // Delete all user's tracks (respect soft/hard delete logic)
    const trackDeletionResults = [];
    for (const track of tracksResult.rows) {
      const result = await deleteTrack(track.id, userId, {
        skipOwnershipCheck: true, // Skip ownership check since we know user owns these tracks
        returnResult: true
      });
      trackDeletionResults.push(result);
    }
    
    // Handle Stripe subscription cancellation
    if (user.stripe_subscription_id) {
      try {
        await stripe.subscriptions.cancel(user.stripe_subscription_id);
        console.log(`Stripe subscription ${user.stripe_subscription_id} canceled for user ${userId}`);
      } catch (stripeError) {
        console.error('Error canceling Stripe subscription:', stripeError);
        // Continue with deletion even if Stripe cancellation fails
      }
    }
    
    // Delete profile picture from S3
    if (user.profile_pic_url && user.profile_pic_url.includes('images/profile/')) {
      try {
        const profilePicKey = user.profile_pic_url.split('.com/')[1]; // Extract S3 key
        await s3Client.send(new DeleteObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: profilePicKey
        }));
        console.log(`Profile picture deleted from S3 for user ${userId}`);
      } catch (s3Error) {
        console.error('Error deleting profile picture from S3:', s3Error);
        // Continue with deletion even if S3 cleanup fails
      }
    }
    
    // Delete user record (cascades will handle most related data)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    res.json({ 
      message: 'Account deleted successfully',
      tracks_deleted: trackDeletionResults.length
    });
    
  } catch (err) {
    console.error('Error deleting account:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;