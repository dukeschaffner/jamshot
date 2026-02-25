import express from 'express';
import { betterAuthMiddleware as authMiddleware } from '../middleware/betterAuthMiddleware.js';

const router = express.Router();
import pool from '../config/db.js';
import { contentCreationLimiter, apiEndpointLimiter } from '../middleware/rateLimiting.js';
import { validateCampAccess, validateRoomAccess, getCampDetails, checkCampUserLimit, checkCampOwner, checkCampAdminOrOwner } from '../utils/campUtils.js';
import { getBaseTrackSelectQuery, processTrack } from '../utils/trackUtils.js';
import crypto from 'crypto';
import stripe from '../config/stripe.js';

// Apply auth middleware to all routes
router.use(authMiddleware);

// Generate unique camp code for invite links
function generateCampCode() {
  return crypto.randomBytes(16).toString('hex');
}

// Create camp checkout session (camp will be created in webhook after successful payment)
router.post('/', contentCreationLimiter, async (req, res, next) => {
  try {
    const { name, start_date, product_version } = req.body;

    // Validate required fields
    if (!name || !product_version) {
      return res.status(400).json({ error: 'Camp name and product version are required' });
    }

    // Validate product version
    const validVersions = ['5_users', '10_users', '25_users', '50_users', '100_users'];
    if (!validVersions.includes(product_version)) {
      return res.status(400).json({ error: 'Invalid product version' });
    }

    // Set pricing based on product version
    const pricing = {
      '5_users': { amount: 2900, name: 'Songwriting Camp (Up to 5 users)' },
      '10_users': { amount: 4900, name: 'Songwriting Camp (Up to 10 users)' },
      '25_users': { amount: 9900, name: 'Songwriting Camp (Up to 25 users)' },
      '50_users': { amount: 19900, name: 'Songwriting Camp (Up to 50 users)' },
      '100_users': { amount: 29900, name: 'Songwriting Camp (Up to 100 users)' }
    };

    const productInfo = pricing[product_version];
    if (!productInfo) {
      return res.status(400).json({ error: 'Invalid product version' });
    }


    // Set start date to now if not provided
    const startDate = start_date ? new Date(start_date) : new Date();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7); // 7 day camp

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: productInfo.name,
              description: `7-day collaborative songwriting camp starting ${startDate.toDateString()}`,
            },
            unit_amount: productInfo.amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/camp/created?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/camps`,
      metadata: {
        userId: req.user.id,
        type: 'camp_creation',
        campName: name,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        productVersion: product_version,
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    next(error);
  }
});

// Get camp creation success details
router.get('/created', apiEndpointLimiter, async (req, res, next) => {
  try {
    const { session_id } = req.query;

    if (!session_id) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Get session details from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.metadata.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Find the camp created for this session
    const campResult = await pool.query(
      'SELECT id, name, start_date, end_date, product_version, camp_code FROM camps WHERE stripe_payment_id = $1',
      [session.id]
    );

    if (campResult.rows.length === 0) {
      return res.status(404).json({ error: 'Camp not found. It may still be processing.' });
    }

    res.json(campResult.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get camp details with rooms and members
router.get('/:id', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);

    const campDetails = await getCampDetails(campId, req.user.id);

    if (!campDetails.valid) {
      return res.status(campDetails.error === 'You are not a member of this camp' ? 403 : 404)
                 .json({ error: campDetails.error });
    }

    res.json(campDetails.camp);
  } catch (error) {
    next(error);
  }
});

// Update camp settings (admin/owner only)
router.put('/:id', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const { name } = req.body;

    // Check if user is admin or owner
    const isAdminOrOwner = await checkCampAdminOrOwner(campId, req.user.id);

    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    const result = await pool.query(
      'UPDATE camps SET name = $1 WHERE id = $2 RETURNING *',
      [name, campId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Camp not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Create a room in the camp (admin/owner only)
router.post('/:id/rooms', contentCreationLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Room name is required' });
    }

    // Check if user is admin or owner
    const isAdminOrOwner = await checkCampAdminOrOwner(campId, req.user.id);

    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    // Check if room name already exists in this camp
    const existingRoom = await pool.query(
      'SELECT id FROM rooms WHERE camp_id = $1 AND name = $2',
      [campId, name]
    );

    if (existingRoom.rows.length > 0) {
      return res.status(400).json({ error: 'Room name already exists in this camp' });
    }

    const result = await pool.query(
      `INSERT INTO rooms (camp_id, name, created_by)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [campId, name, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete room (admin/owner only)
router.delete('/:id/rooms/:roomId', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const roomId = parseInt(req.params.roomId);

    // Check if user is admin or owner
    const isAdminOrOwner = await checkCampAdminOrOwner(campId, req.user.id);

    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    // Verify room belongs to camp
    const roomCheck = await pool.query(
      'SELECT id FROM rooms WHERE id = $1 AND camp_id = $2',
      [roomId, campId]
    );

    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Delete room (this will cascade delete user_rooms entries)
    await pool.query(
      'DELETE FROM rooms WHERE id = $1 AND camp_id = $2',
      [roomId, campId]
    );

    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Invite user to camp
router.post('/:id/invite', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }

    // Check if user is admin or owner
    const isAdminOrOwner = await checkCampAdminOrOwner(campId, req.user.id);

    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    // Find user by username
    const userResult = await pool.query(
      'SELECT id, username, name FROM users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const invitedUser = userResult.rows[0];

    // Check if user is already in camp
    const existingMember = await pool.query(
      'SELECT id FROM user_camps WHERE user_id = $1 AND camp_id = $2',
      [invitedUser.id, campId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this camp' });
    }

    // Check if camp has reached user limit
    const userLimitCheck = await checkCampUserLimit(campId);
    if (!userLimitCheck.valid) {
      return res.status(400).json({ error: userLimitCheck.error });
    }

    // Add user to camp
    await pool.query(
      'INSERT INTO user_camps (user_id, camp_id, role) VALUES ($1, $2, $3)',
      [invitedUser.id, campId, 'contributor']
    );

    res.json({
      message: 'User invited successfully',
      user: invitedUser
    });
  } catch (error) {
    next(error);
  }
});

// Update member role (owner/admin can change roles, but admins cannot demote admins)
router.patch('/:id/members/:userId/role', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const userId = req.params.userId;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    // Validate role
    if (!['admin', 'contributor'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin or contributor' });
    }

    // Check if user is owner or admin
    const isOwner = await checkCampOwner(campId, req.user.id);
    const isAdminOrOwner = await checkCampAdminOrOwner(campId, req.user.id);
    
    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Owner or admin access required' });
    }

    // Prevent changing your own role
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Check if user is a member of the camp
    const memberCheck = await pool.query(
      'SELECT role FROM user_camps WHERE user_id = $1 AND camp_id = $2',
      [userId, campId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User is not a member of this camp' });
    }

    const currentRole = memberCheck.rows[0].role;

    // Prevent promoting to owner (owner role is set only at camp creation)
    if (role === 'owner') {
      return res.status(400).json({ error: 'Cannot assign owner role' });
    }

    // Prevent changing owner role
    if (currentRole === 'owner') {
      return res.status(400).json({ error: 'Cannot change owner role' });
    }

    // Admins cannot demote other admins
    if (!isOwner && currentRole === 'admin' && role !== 'admin') {
      return res.status(403).json({ error: 'Admins cannot demote other admins' });
    }

    // Update role
    await pool.query(
      'UPDATE user_camps SET role = $1 WHERE user_id = $2 AND camp_id = $3',
      [role, userId, campId]
    );

    res.json({ message: 'Member role updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Remove member from camp (admin/owner only)
router.delete('/:id/members/:userId', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const userId = req.params.userId;

    // Check if user is admin or owner
    const isAdminOrOwner = await checkCampAdminOrOwner(campId, req.user.id);
    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    // Prevent removing yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself from the camp' });
    }

    // Check if user is a member of the camp and get their role
    const memberCheck = await pool.query(
      'SELECT id, role FROM user_camps WHERE user_id = $1 AND camp_id = $2',
      [userId, campId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User is not a member of this camp' });
    }

    const targetMemberRole = memberCheck.rows[0].role;

    // Prevent removing the owner
    if (targetMemberRole === 'owner') {
      return res.status(403).json({ error: 'Cannot remove the camp owner' });
    }

    // Prevent admins (non-owners) from removing other admins
    const isCurrentUserOwner = await checkCampOwner(campId, req.user.id);
    if (!isCurrentUserOwner && targetMemberRole === 'admin') {
      return res.status(403).json({ error: 'Admins cannot remove other admins from the camp' });
    }

    // Remove user from camp (this will cascade delete from user_rooms)
    await pool.query(
      'DELETE FROM user_camps WHERE user_id = $1 AND camp_id = $2',
      [userId, campId]
    );

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    next(error);
  }
});

// Add/remove user from room (admin/owner only)
router.put('/:id/rooms/:roomId/users', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const roomId = parseInt(req.params.roomId);
    const { user_id, action } = req.body; // action: 'add' or 'remove'

    if (!user_id || !action || !['add', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'Valid user_id and action (add/remove) are required' });
    }

    // Check if user is admin or owner
    const isAdminOrOwner = await checkCampAdminOrOwner(campId, req.user.id);

    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    // Verify room belongs to camp
    const roomCheck = await pool.query(
      'SELECT id FROM rooms WHERE id = $1 AND camp_id = $2',
      [roomId, campId]
    );

    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found in this camp' });
    }

    if (action === 'add') {
      // Check if user is already in another room in this camp
      const existingRoomCheck = await pool.query(
        `SELECT ur.room_id, r.name
         FROM user_rooms ur
         JOIN rooms r ON ur.room_id = r.id
         WHERE ur.user_id = $1 AND r.camp_id = $2`,
        [user_id, campId]
      );

      if (existingRoomCheck.rows.length > 0) {
        return res.status(400).json({
          error: `User is already in room "${existingRoomCheck.rows[0].name}". Users can only be in one room per camp.`
        });
      }

      // Add user to room
      await pool.query(
        'INSERT INTO user_rooms (user_id, room_id) VALUES ($1, $2)',
        [user_id, roomId]
      );

      res.json({ message: 'User added to room successfully' });
    } else if (action === 'remove') {
      // Remove user from room
      const result = await pool.query(
        'DELETE FROM user_rooms WHERE user_id = $1 AND room_id = $2',
        [user_id, roomId]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'User is not in this room' });
      }

      res.json({ message: 'User removed from room successfully' });
    }
  } catch (error) {
    next(error);
  }
});

// Validate camp access via invite code
router.post('/validate-code', apiEndpointLimiter, async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Camp code is required' });
    }

    const campResult = await pool.query(
      `SELECT c.*, u.username as admin_username, u.name as admin_name
       FROM camps c
       JOIN users u ON c.created_by = u.id
       WHERE c.camp_code = $1`,
      [code]
    );

    if (campResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid camp code' });
    }

    const camp = campResult.rows[0];

    // Check if camp is still active
    const now = new Date();
    if (now > new Date(camp.end_date)) {
      return res.status(400).json({ error: 'This camp has ended' });
    }

    // Check if user is already a member
    const membershipCheck = await pool.query(
      'SELECT id FROM user_camps WHERE user_id = $1 AND camp_id = $2',
      [req.user.id, camp.id]
    );

    const isMember = membershipCheck.rows.length > 0;

    if (isMember) {
      // Add to camp and redirect
      res.json({
        valid: true,
        camp,
        is_member: true,
        message: 'You are already a member of this camp'
      });
    } else {
      // Check if camp has reached user limit
      const userLimitCheck = await checkCampUserLimit(camp.id);
      if (!userLimitCheck.valid) {
        return res.status(400).json({ error: userLimitCheck.error });
      }

      // Add user to camp
      await pool.query(
        'INSERT INTO user_camps (user_id, camp_id, role) VALUES ($1, $2, $3)',
        [req.user.id, camp.id, 'contributor']
      );

      res.json({
        valid: true,
        camp,
        is_member: false,
        message: 'Successfully joined camp'
      });
    }
  } catch (error) {
    next(error);
  }
});

// Get beats in camp (tracks with no parent)
router.get('/:id/beats', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const { sort_by = 'recent', page = 1, limit = 20 } = req.query;
  
    // Verify user has access to camp
    const accessCheck = await pool.query(
      'SELECT id FROM user_camps WHERE user_id = $1 AND camp_id = $2',
      [req.user.id, campId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this camp' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Determine sort order
    let orderBy = 't.created_at DESC'; // default: recent
    if (sort_by === 'bpm') {
      orderBy = 't.metronome_bpm ASC';
    } else if (sort_by === 'key') {
      orderBy = 't.key ASC';
    } else if (sort_by === 'usage') {
      orderBy = 'collab_count DESC';
    }

    // Get beats (tracks with no parent_track_id, no room_id, and associated with camp) using standardized track query
    const baseQuery = getBaseTrackSelectQuery(true, 1, true);
    const beatsQuery = `
      SELECT 
        ${baseQuery},
        t.key
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE t.camp_id = $2 AND t.parent_track_id IS NULL AND t.room_id IS NULL AND t.processing_status = 'completed'
      ORDER BY ${orderBy}
      LIMIT $3 OFFSET $4
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tracks t
      WHERE t.camp_id = $1 AND t.parent_track_id IS NULL AND t.room_id IS NULL AND t.processing_status = 'completed'
    `;

    const [beatsResult, countResult] = await Promise.all([
      pool.query(beatsQuery, [req.user.id, campId, limit, offset]),
      pool.query(countQuery, [campId])
    ]);

    // Process beats using the same utility function as tracks.js
    const beats = await Promise.all(beatsResult.rows.map(beat => processTrack(beat, req.user.id)));

    const total = parseInt(countResult.rows[0].total);
    const hasMore = offset + beats.length < total;

    res.json({
      beats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        hasMore
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get tracks in camp (collabs on beats)
router.get('/:id/tracks', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const { sort_by = 'recent', room_id, page = 1, limit = 20 } = req.query;
  
    // Verify user has access to camp
    const accessCheck = await pool.query(
      'SELECT id FROM user_camps WHERE user_id = $1 AND camp_id = $2',
      [req.user.id, campId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this camp' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Determine sort order
    let orderBy = 't.created_at DESC'; // default: recent
    if (sort_by === 'likes') {
      orderBy = 'like_count DESC';
    }

    // Build query with optional room filter
    let whereClause = 't.camp_id = $2 AND (t.parent_track_id IS NOT NULL OR t.room_id IS NOT NULL) AND t.processing_status = \'completed\'';
    const queryParams = [req.user.id, campId];
    let paramIndex = 3;

    if (room_id) {
      whereClause += ` AND t.room_id = $${paramIndex}`;
      queryParams.push(parseInt(room_id));
      paramIndex++;
    }

    queryParams.push(limit, offset);

    // Get tracks using standardized track query
    const baseQuery = getBaseTrackSelectQuery(true, 1, true);
    const tracksQuery = `
      SELECT 
        ${baseQuery},
        t.room_id,
        r.name as room_name
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      LEFT JOIN rooms r ON t.room_id = r.id
      WHERE ${whereClause}
      ORDER BY ${orderBy}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    // Build count query params matching the whereClause structure
    // whereClause uses $2 for campId and $3 for roomId (if present)
    // Count query needs $1 for campId and $2 for roomId (if present)
    const countParams = [campId];
    if (room_id) {
      countParams.push(parseInt(room_id));
    }

    // Adjust parameter placeholders: $2 -> $1, $3 -> $2
    const countWhereClause = whereClause.replace(/\$2/g, '$1').replace(/\$3/g, '$2');

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tracks t
      WHERE ${countWhereClause}
    `;

    const [tracksResult, countResult] = await Promise.all([
      pool.query(tracksQuery, queryParams),
      pool.query(countQuery, countParams)
    ]);

    // Process tracks using the same utility function as tracks.js
    const tracks = await Promise.all(tracksResult.rows.map(track => processTrack(track, req.user.id)));

    const total = parseInt(countResult.rows[0].total);
    const hasMore = offset + tracks.length < total;

    res.json({
      tracks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        hasMore
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get room tracks
router.get('/:id/rooms/:roomId/tracks', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const roomId = parseInt(req.params.roomId);
    const { page = 1, limit = 20 } = req.query;
  
    // Verify user has access to camp
    const accessCheck = await pool.query(
      'SELECT id FROM user_camps WHERE user_id = $1 AND camp_id = $2',
      [req.user.id, campId]
    );

    if (accessCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this camp' });
    }

    // Verify room belongs to camp
    const roomCheck = await pool.query(
      'SELECT id FROM rooms WHERE id = $1 AND camp_id = $2',
      [roomId, campId]
    );

    if (roomCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Room not found in this camp' });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get room tracks using standardized track query
    const baseQuery = getBaseTrackSelectQuery(true, 1, true);
    const tracksQuery = `
      SELECT 
        ${baseQuery}
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE t.room_id = $2 AND t.processing_status = 'completed'
      ORDER BY t.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tracks t
      WHERE t.room_id = $1 AND t.processing_status = 'completed'
    `;

    const [tracksResult, countResult] = await Promise.all([
      pool.query(tracksQuery, [req.user.id, roomId, limit, offset]),
      pool.query(countQuery, [roomId])
    ]);

    // Process tracks using the same utility function as tracks.js
    const tracks = await Promise.all(tracksResult.rows.map(track => processTrack(track, req.user.id)));

    const total = parseInt(countResult.rows[0].total);
    const hasMore = offset + tracks.length < total;

    res.json({
      tracks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        hasMore
      }
    });
  } catch (error) {
    next(error);
  }
});

// Move track to room (camp member only, for non-beat tracks)
router.patch('/:id/tracks/:trackId/room', apiEndpointLimiter, async (req, res, next) => {
  try {
    const campId = parseInt(req.params.id);
    const trackId = parseInt(req.params.trackId);
    const { room_id } = req.body;

    // Verify user has access to camp
    const accessCheck = await validateCampAccess(campId, req.user.id);
    if (!accessCheck.valid) {
      return res.status(403).json({ error: accessCheck.error });
    }

    // Verify track belongs to camp and is a non-beat track (has parent_track_id)
    const trackCheck = await pool.query(
      'SELECT id, camp_id, room_id, parent_track_id, user_id FROM tracks WHERE id = $1 AND camp_id = $2',
      [trackId, campId]
    );

    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found or does not belong to this camp' });
    }

    const track = trackCheck.rows[0];

    // Only allow moving non-beat tracks (tracks with parent_track_id)
    if (!track.parent_track_id) {
      return res.status(400).json({ error: 'Cannot move beat tracks to rooms. Only collaboration tracks can be moved.' });
    }

    // Verify user owns the track or is admin/owner
    const isAdminOrOwner = await checkCampAdminOrOwner(campId, req.user.id);
    if (track.user_id !== req.user.id && !isAdminOrOwner) {
      return res.status(403).json({ error: 'You can only move your own tracks unless you are an admin or owner' });
    }

    // If room_id is provided, validate room belongs to camp
    if (room_id !== null && room_id !== undefined) {
      const roomCheck = await pool.query(
        'SELECT id FROM rooms WHERE id = $1 AND camp_id = $2',
        [room_id, campId]
      );

      if (roomCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Room not found in this camp' });
      }
    }

    // Update track's room
    await pool.query(
      'UPDATE tracks SET room_id = $1 WHERE id = $2',
      [room_id || null, trackId]
    );

    res.json({ 
      success: true,
      message: 'Track moved successfully'
    });
  } catch (error) {
    next(error);
  }
});

export default router;
