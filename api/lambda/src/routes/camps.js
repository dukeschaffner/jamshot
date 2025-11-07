const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const { contentCreationLimiter, apiEndpointLimiter } = require('../middleware/rateLimiting');
const { validateCampAccess, validateRoomAccess, getCampDetails, checkCampUserLimit } = require('../utils/campUtils');
const crypto = require('crypto');
const stripe = require('../config/stripe');

// Apply auth middleware to all routes
router.use(authMiddleware);

// Generate unique camp code for invite links
function generateCampCode() {
  return crypto.randomBytes(16).toString('hex');
}

// Create camp checkout session (camp will be created in webhook after successful payment)
router.post('/', contentCreationLimiter, async (req, res) => {
  const { name, start_date, product_version } = req.body;

  // Validate required fields
  if (!name || !product_version) {
    return res.status(400).json({ error: 'Camp name and product version are required' });
  }

  // Validate product version
  const validVersions = ['10_users', '25_users', '50_users', '100_users'];
  if (!validVersions.includes(product_version)) {
    return res.status(400).json({ error: 'Invalid product version' });
  }

  // Set pricing based on product version
  const pricing = {
    '10_users': { amount: 4900, name: 'Songwriting Camp (Up to 10 users)' },
    '25_users': { amount: 9900, name: 'Songwriting Camp (Up to 25 users)' },
    '50_users': { amount: 19900, name: 'Songwriting Camp (Up to 50 users)' },
    '100_users': { amount: 29900, name: 'Songwriting Camp (Up to 100 users)' }
  };

  const productInfo = pricing[product_version];
  if (!productInfo) {
    return res.status(400).json({ error: 'Invalid product version' });
  }

  try {
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
    console.error('Error creating camp checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get camp creation success details
router.get('/created', apiEndpointLimiter, async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
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
    console.error('Error retrieving camp creation details:', error);
    res.status(500).json({ error: 'Failed to retrieve camp details' });
  }
});

// Get camp details with rooms and members
router.get('/:id', apiEndpointLimiter, async (req, res) => {
  try {
    const campId = parseInt(req.params.id);

    const campDetails = await getCampDetails(campId, req.user.id);

    if (!campDetails.valid) {
      return res.status(campDetails.error === 'You are not a member of this camp' ? 403 : 404)
                 .json({ error: campDetails.error });
    }

    res.json(campDetails.camp);
  } catch (error) {
    console.error('Error fetching camp:', error);
    res.status(500).json({ error: 'Failed to fetch camp details' });
  }
});

// Update camp settings (admin only)
router.put('/:id', apiEndpointLimiter, async (req, res) => {
  const campId = parseInt(req.params.id);
  const { name } = req.body;

  try {
    // Check if user is admin
    const adminCheck = await pool.query(
      'SELECT role FROM user_camps WHERE user_id = $1 AND camp_id = $2 AND role = $3',
      [req.user.id, campId, 'admin']
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access required' });
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
    console.error('Error updating camp:', error);
    res.status(500).json({ error: 'Failed to update camp' });
  }
});

// Create a room in the camp (admin only)
router.post('/:id/rooms', contentCreationLimiter, async (req, res) => {
  const campId = parseInt(req.params.id);
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Room name is required' });
  }

  try {
    // Check if user is admin
    const adminCheck = await pool.query(
      'SELECT role FROM user_camps WHERE user_id = $1 AND camp_id = $2 AND role = $3',
      [req.user.id, campId, 'admin']
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access required' });
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
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});

// Invite user to camp
router.post('/:id/invite', apiEndpointLimiter, async (req, res) => {
  const campId = parseInt(req.params.id);
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // Check if user is admin
    const adminCheck = await pool.query(
      'SELECT role FROM user_camps WHERE user_id = $1 AND camp_id = $2 AND role = $3',
      [req.user.id, campId, 'admin']
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access required' });
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
    console.error('Error inviting user:', error);
    res.status(500).json({ error: 'Failed to invite user' });
  }
});

// Add/remove user from room (admin only)
router.put('/:id/rooms/:roomId/users', apiEndpointLimiter, async (req, res) => {
  const campId = parseInt(req.params.id);
  const roomId = parseInt(req.params.roomId);
  const { user_id, action } = req.body; // action: 'add' or 'remove'

  if (!user_id || !action || !['add', 'remove'].includes(action)) {
    return res.status(400).json({ error: 'Valid user_id and action (add/remove) are required' });
  }

  try {
    // Check if user is admin
    const adminCheck = await pool.query(
      'SELECT role FROM user_camps WHERE user_id = $1 AND camp_id = $2 AND role = $3',
      [req.user.id, campId, 'admin']
    );

    if (adminCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Admin access required' });
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
    console.error('Error managing room users:', error);
    res.status(500).json({ error: 'Failed to manage room users' });
  }
});

// Validate camp access via invite code
router.post('/validate-code', apiEndpointLimiter, async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Camp code is required' });
  }

  try {
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
    console.error('Error validating camp code:', error);
    res.status(500).json({ error: 'Failed to validate camp code' });
  }
});

module.exports = router;
