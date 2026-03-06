import express from 'express';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import multer from 'multer';
import sharp from 'sharp';
import bcrypt from 'bcryptjs';
import stripeLib from 'stripe';
import { betterAuthMiddleware, optionalBetterAuthMiddleware } from '../middleware/betterAuthMiddleware.js';

import pool from '../config/db.js';
import {
  interactionLimiter,
  uploadLimiter,
  contentCreationLimiter
} from '../middleware/rateLimiting.js';
import { getBaseTrackSelectQuery, processTrack, deleteTrack } from '../utils/trackUtils.js';

const router = express.Router();
const stripe = stripeLib(process.env.STRIPE_SECRET_KEY);

const s3Client = new S3Client({
  region: 'auto', // R2 uses 'auto' region
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
  endpoint: process.env.R2_ENDPOINT,
});

// Helper function to check if a URL is from R2 and extract the key
const isR2Url = (url) => {
  if (!url || typeof url !== 'string') return { isR2: false, key: null };
  
  const r2PublicUrl = process.env.R2_PUBLIC_URL;
  if (!r2PublicUrl) return { isR2: false, key: null };
  
  // Check if URL starts with R2_PUBLIC_URL
  if (url.startsWith(r2PublicUrl)) {
    // Extract the key (everything after the base URL and slash)
    const key = url.replace(r2PublicUrl, '').replace(/^\//, '');
    return { isR2: true, key };
  }
  
  return { isR2: false, key: null };
};

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
router.use(optionalBetterAuthMiddleware);

// Get current user details
router.get('/me', betterAuthMiddleware, async (req, res, next) => {
  try {
    const userResult = await pool.query(
      'SELECT id, username, name, email, verified, email_verified, profile_pic_url, bio, is_private, terms_accepted, privacy_policy_accepted, policy_accepted_at, policy_version, subscription_tier, subscription_expires_at, date_of_birth FROM users WHERE id = $1',
      [req.user.id]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Fetch camps the user belongs to
    const campsResult = await pool.query(
      `SELECT c.id, c.name, c.camp_code, uc.role
       FROM camps c
       JOIN user_camps uc ON c.id = uc.camp_id
       WHERE uc.user_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    
    // Fetch active teams the user belongs to (not expired)
    const teamsResult = await pool.query(
      `SELECT t.id, t.name, t.team_code, tm.role
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE tm.user_id = $1 
         AND (t.subscription_status = 'active' OR t.subscription_status = 'trialing')
         AND (t.subscription_expires_at IS NULL OR t.subscription_expires_at > NOW())
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    
    // Add camps and teams to user object
    user.camps = campsResult.rows;
    user.teams = teamsResult.rows;
    
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// Get user's tracks
router.get('/:userId/tracks', async (req, res, next) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user?.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;

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
    if (isPrivate && currentUserId !== userId) {
      // Check if the current user is following this user
      const isFollowing = currentUserId ? await pool.query(
        'SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2) as is_following',
        [currentUserId, userId]
      ) : { rows: [{ is_following: false }] };
      
      // If not following, return empty array with pagination info
      if (!isFollowing.rows[0].is_following) {
        return res.json({
          tracks: [],
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false
          }
        });
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

    // Count total tracks
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tracks t
      WHERE t.user_id = $1
      AND t.processing_status = 'completed'
      AND t.team_id IS NULL
      AND t.camp_id IS NULL
      AND (t.is_private = FALSE OR t.user_id = $${queryParams.length})
    `;

    const resultQuery = `
      SELECT
        ${baseQuery}
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE t.user_id = $1
      AND t.processing_status = 'completed'
      AND t.team_id IS NULL
      AND t.camp_id IS NULL
      AND (t.is_private = FALSE OR t.user_id = $${queryParams.length})
      ORDER BY t.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const [countResult, result] = await Promise.all([
      pool.query(countQuery, queryParams),
      pool.query(resultQuery, [...queryParams, limit, offset])
    ]);

    // Use the processTrack utility function to process all tracks
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, currentUserId)));

    const totalCount = parseInt(countResult.rows[0].total);
    const hasMore = totalCount > offset + limit;

    res.json({
      tracks,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore
      }
    });
  } catch (err) {
    next(err);
  }
});


// Follow a user
router.post('/follow/:userId', interactionLimiter, betterAuthMiddleware, async (req, res, next) => {
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
    next(err);
  }
});

// Unfollow a user
router.delete('/follow/:userId', betterAuthMiddleware, async (req, res, next) => {
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
    next(err);
  }
});

// Get follow stats
router.get('/:userId/stats', async (req, res, next) => {
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
    next(err);
  }
});

// Get user's followers with pagination
router.get('/:userId/followers', optionalBetterAuthMiddleware, async (req, res, next) => {
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
    if (isPrivate && currentUserId !== userId) {
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
    next(err);
  }
});

// Get users the specified user is following with pagination
router.get('/:userId/following', optionalBetterAuthMiddleware, async (req, res, next) => {
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
    if (isPrivate && currentUserId !== userId) {
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
    next(err);
  }
});

// Get user's reposted tracks
router.get('/:userId/reposts', async (req, res, next) => {
  const { userId } = req.params;
  const currentUserId = req.user?.id; // Optional chaining in case user is not authenticated
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
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
    if (isPrivate && currentUserId !== userId) {
      // Check if the current user is following this user
      const isFollowing = currentUserId ? await pool.query(
        'SELECT EXISTS(SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2) as is_following',
        [currentUserId, userId]
      ) : { rows: [{ is_following: false }] };
      
      // If not following, return empty array with pagination info
      if (!isFollowing.rows[0].is_following) {
        return res.json({
          tracks: [],
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false
          }
        });
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

    // Count total reposts
    const countQuery = `
      SELECT COUNT(*) as total
      FROM reposts r
      JOIN tracks t ON r.track_id = t.id
      WHERE r.user_id = $1
      AND t.is_private = FALSE
    `;

    const resultQuery = `
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
      AND t.is_private = FALSE
      AND t.team_id IS NULL
      AND t.camp_id IS NULL
      ORDER BY r.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const [countResult, result] = await Promise.all([
      pool.query(countQuery, [userId]),
      pool.query(resultQuery, [...queryParams, limit, offset])
    ]);

    // Use the processTrack utility function to process all tracks
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, currentUserId)));

    const totalCount = parseInt(countResult.rows[0].total);
    const hasMore = totalCount > offset + limit;

    res.json({
      tracks,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore
      }
    });
  } catch (err) {
    next(err);
  }
});

// Update user profile
router.put('/me', betterAuthMiddleware, async (req, res, next) => {
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
    next(err);
  }
});

// Complete profile - update date of birth and terms/privacy acceptance (for OAuth signups)
router.put('/me/complete-profile', betterAuthMiddleware, async (req, res, next) => {
  try {
    const { dateOfBirth, acceptTerms } = req.body;
    const { validateDateOfBirth } = await import('@sterio/validation-utils');
    
    // Validate date of birth
    if (!dateOfBirth) {
      return res.status(400).json({ error: 'Date of birth is required' });
    }
    
    const dobValidation = validateDateOfBirth(dateOfBirth);
    if (!dobValidation.valid) {
      return res.status(400).json({ error: dobValidation.error });
    }
    
    // Validate terms acceptance
    if (!acceptTerms) {
      return res.status(400).json({ error: 'You must accept the Terms of Service and Privacy Policy to continue.' });
    }
    
    // Get client IP address for policy acceptance tracking
    const clientIp = req.headers['x-forwarded-for'] || 
                    req.headers['x-real-ip'] || 
                    req.connection.remoteAddress || 
                    req.socket.remoteAddress ||
                    (req.connection.socket ? req.connection.socket.remoteAddress : null);
    
    const currentTimestamp = new Date();
    const policyVersion = '1.0';
    
    // Update user with date of birth and terms/privacy acceptance
    const result = await pool.query(
      `UPDATE users 
       SET date_of_birth = $1,
           terms_accepted = $2,
           privacy_policy_accepted = $2,
           policy_accepted_at = $3,
           policy_accepted_ip = $4,
           policy_version = $5
       WHERE id = $6
       RETURNING id, username, name, email, date_of_birth, terms_accepted, privacy_policy_accepted, policy_accepted_at`,
      [dateOfBirth, true, currentTimestamp, clientIp, policyVersion, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ 
      message: 'Profile completed successfully',
      user: result.rows[0]
    });
  } catch (err) {
    next(err);
  }
});

// Upload and update profile image
router.post('/me/profile-image', uploadLimiter, betterAuthMiddleware, upload.single('image'), async (req, res, next) => {
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

    // If user has an existing profile image from R2, delete it from R2
    if (currentUser.rows[0]?.profile_pic_url) {
      const { isR2, key } = isR2Url(currentUser.rows[0].profile_pic_url);
      if (isR2 && key) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key
          }));
        } catch (err) {
          console.warn('Failed to delete old profile image from R2:', err);
          // Continue with upload even if delete fails
        }
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
    next(err);
  }
});

// Toggle account privacy
router.put('/me/privacy', betterAuthMiddleware, async (req, res, next) => {
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
    next(err);
  }
});

// Get pending follow requests for current user
router.get('/me/follow-requests', betterAuthMiddleware, async (req, res, next) => {
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
    next(err);
  }
});

// Accept a follow request
router.post('/follow-requests/:requestId/accept', interactionLimiter, betterAuthMiddleware, async (req, res, next) => {
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
    next(err);
  }
});

// Reject a follow request
router.post('/follow-requests/:requestId/reject', interactionLimiter, betterAuthMiddleware, async (req, res, next) => {
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
    next(err);
  }
});

// Get user profile by username
router.get('/by-username/:username', async (req, res, next) => {
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
    next(err);
  }
});

// Get user's tracks by username
router.get('/by-username/:username/tracks', async (req, res, next) => {
  const { username } = req.params;
  const currentUserId = req.user?.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
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
      
      // If not following, return empty array with pagination info
      if (!isFollowing.rows[0].is_following) {
        return res.json({
          tracks: [],
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false
          }
        });
      }
    }
    
    // Count total tracks
    const countQuery = `
      SELECT COUNT(*) as total
      FROM tracks t
      WHERE t.user_id = $1
      AND t.processing_status = 'completed'
      AND t.team_id IS NULL
      AND t.camp_id IS NULL
      AND (t.is_private = FALSE OR t.user_id = $2)
    `;
    
    // Get tracks with additional info using standardized query
    let baseQuery;
    let queryParams;
    let tracksQuery;
    
    if (currentUserId) {
      baseQuery = getBaseTrackSelectQuery(true, 2, true, true);
      queryParams = [userId, currentUserId, limit, offset];
      tracksQuery = `
        SELECT
          ${baseQuery}
        FROM tracks t
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN users u2 ON t2.user_id = u2.id
        WHERE t.user_id = $1
        AND t.processing_status = 'completed'
        AND t.team_id IS NULL
        AND t.camp_id IS NULL
        AND (t.is_private = FALSE OR t.user_id = $2)
        ORDER BY t.created_at DESC
        LIMIT $3 OFFSET $4
      `;
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, true, true);
      queryParams = [userId, limit, offset];
      tracksQuery = `
        SELECT
          ${baseQuery}
        FROM tracks t
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN users u2 ON t2.user_id = u2.id
        WHERE t.user_id = $1
        AND t.processing_status = 'completed'
        AND t.team_id IS NULL
        AND t.camp_id IS NULL
        AND t.is_private = FALSE
        ORDER BY t.created_at DESC
        LIMIT $2 OFFSET $3
      `;
    }
    
    const [countResult, tracksResult] = await Promise.all([
      pool.query(countQuery, [userId, currentUserId || null]),
      pool.query(tracksQuery, queryParams)
    ]);
    
    const totalCount = parseInt(countResult.rows[0].total);
    const hasMore = totalCount > offset + limit;
    
    res.json({
      tracks: tracksResult.rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get user's reposts by username
router.get('/by-username/:username/reposts', async (req, res, next) => {
  const { username } = req.params;
  const currentUserId = req.user?.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
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
      
      // If not following, return empty array with pagination info
      if (!isFollowing.rows[0].is_following) {
        return res.json({
          tracks: [],
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false
          }
        });
      }
    }
    
    // Count total reposts
    const countQuery = `
      SELECT COUNT(*) as total
      FROM reposts r
      JOIN tracks t ON r.track_id = t.id
      WHERE r.user_id = $1
      AND t.is_private = FALSE
      AND t.team_id IS NULL
      AND t.camp_id IS NULL
    `;
    
    // Get reposts with additional info using standardized query
    let baseQuery;
    let queryParams;
    let repostsQuery;
    
    if (currentUserId) {
      baseQuery = getBaseTrackSelectQuery(true, 2, true, true);
      queryParams = [userId, currentUserId, limit, offset];
      repostsQuery = `
        SELECT
          ${baseQuery},
          r.created_at as reposted_at,
          ru.username as reposted_by_username,
          TRUE AS is_repost
        FROM reposts r
        JOIN tracks t ON r.track_id = t.id
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN users u2 ON t2.user_id = u2.id
        LEFT JOIN users ru ON r.user_id = ru.id
        WHERE r.user_id = $1
        AND t.is_private = FALSE
        AND t.team_id IS NULL
        AND t.camp_id IS NULL
        ORDER BY r.created_at DESC
        LIMIT $3 OFFSET $4
      `;
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, true, true);
      queryParams = [userId, limit, offset];
      repostsQuery = `
        SELECT
          ${baseQuery},
          r.created_at as reposted_at,
          ru.username as reposted_by_username,
          TRUE AS is_repost
        FROM reposts r
        JOIN tracks t ON r.track_id = t.id
        LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN users u2 ON t2.user_id = u2.id
        LEFT JOIN users ru ON r.user_id = ru.id
        WHERE r.user_id = $1
        AND t.is_private = FALSE
        AND t.team_id IS NULL
        AND t.camp_id IS NULL
        ORDER BY r.created_at DESC
        LIMIT $2 OFFSET $3
      `;
    }
    
    const [countResult, repostsResult] = await Promise.all([
      pool.query(countQuery, [userId]),
      pool.query(repostsQuery, queryParams)
    ]);
    
    const totalCount = parseInt(countResult.rows[0].total);
    const hasMore = totalCount > offset + limit;
    
    res.json({
      tracks: repostsResult.rows,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore
      }
    });
  } catch (err) {
    next(err);
  }
});

// Follow a user by username
router.post('/follow/username/:username', interactionLimiter, betterAuthMiddleware, async (req, res, next) => {
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

      // Create notification for the target user
      await pool.query(
        `INSERT INTO notifications (user_id, type, related_user_id)
         VALUES ($1, 'follow', $2)`,
        [followingId, followerId]
      );

      return res.status(200).json({ message: 'Now following user' });
    }
  } catch (err) {
    next(err);
  }
});

// Unfollow a user by username
router.delete('/follow/username/:username', betterAuthMiddleware, async (req, res, next) => {
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
    next(err);
  }
});

// Get user's liked tracks by username
router.get('/:username/liked', async (req, res, next) => {
  const { username } = req.params;
  const currentUserId = req.user?.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const offset = (page - 1) * limit;
  
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
      
      // If not following, return empty array with pagination info
      if (!isFollowing.rows[0].is_following) {
        return res.json({
          tracks: [],
          pagination: {
            page,
            limit,
            total: 0,
            hasMore: false
          }
        });
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

    // Count total liked tracks
    const countQuery = `
      SELECT COUNT(*) as total
      FROM likes l
      JOIN tracks t ON l.track_id = t.id
      WHERE l.user_id = $1
      AND t.is_private = FALSE
      AND t.team_id IS NULL
      AND t.camp_id IS NULL
    `;

    const resultQuery = `
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
      AND t.is_private = FALSE
      AND t.team_id IS NULL
      AND t.camp_id IS NULL
      ORDER BY l.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;

    const [countResult, result] = await Promise.all([
      pool.query(countQuery, [userId]),
      pool.query(resultQuery, [...queryParams, limit, offset])
    ]);

    // Use the processTrack utility function to process all tracks
    const tracks = await Promise.all(result.rows.map(track => processTrack(track, currentUserId)));

    const totalCount = parseInt(countResult.rows[0].total);
    const hasMore = totalCount > offset + limit;

    res.json({
      tracks,
      pagination: {
        page,
        limit,
        total: totalCount,
        hasMore
      }
    });
  } catch (err) {
    next(err);
  }
});

// Delete user account
router.delete('/me', contentCreationLimiter, betterAuthMiddleware, async (req, res, next) => {
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
    if (!user.password_hash) {
      return res.status(400).json({ error: 'No password set for this account' });
    }
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
    
    // Delete profile picture from R2 if it's stored in R2
    if (user.profile_pic_url) {
      const { isR2, key } = isR2Url(user.profile_pic_url);
      if (isR2 && key) {
        try {
          await s3Client.send(new DeleteObjectCommand({
            Bucket: process.env.R2_BUCKET,
            Key: key
          }));
          console.log(`Profile picture deleted from R2 for user ${userId}`);
        } catch (s3Error) {
          console.error('Error deleting profile picture from R2:', s3Error);
          // Continue with deletion even if R2 cleanup fails
        }
      }
    }
    
    // Delete user record (cascades will handle most related data)
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    
    res.json({ 
      message: 'Account deleted successfully',
      tracks_deleted: trackDeletionResults.length
    });
    
  } catch (err) {
    next(err);
  }
});

export default router;

