const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const stripe = require('../config/stripe');
const { authMiddleware, optionalAuthMiddleware } = require('../middleware/auth');
const { 
  contentCreationLimiter, 
  interactionLimiter, 
  apiEndpointLimiter 
} = require('../middleware/rateLimiting');
const { processTrack } = require('../utils/trackUtils');
const { getUserPlan } = require('../utils/subscriptionUtils');
const { scheduleCompetitionEnd } = require('../utils/eventBridgeScheduler');

// Apply optional auth middleware to all routes
router.use(optionalAuthMiddleware);

// GET /competitions - Browse competitions with filtering
router.get('/', async (req, res) => {
  const userId = req.user?.id;
  const { 
    page = 1, 
    limit = 10, 
    genreId, 
    instrumentId, 
    status = 'active', // active, upcoming, ended
    pinned = false 
  } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);
  
  try {
    let whereClause = '';
    const queryParams = [];
    const whereParams = []; // Separate array for WHERE clause parameters
    let paramIndex = 1;
    let whereParamIndex = 1;
    
    // Build status filter
    const now = new Date();
    switch (status) {
      case 'active':
        whereClause += `c.startdate <= $${whereParamIndex} AND c.enddate >= $${whereParamIndex}`;
        whereParams.push(now);
        whereParamIndex++;
        break;
      case 'upcoming':
        whereClause += `c.startdate > $${whereParamIndex}`;
        whereParams.push(now);
        whereParamIndex++;
        break;
      case 'ended':
        whereClause += `c.enddate < $${whereParamIndex}`;
        whereParams.push(now);
        whereParamIndex++;
        break;
      case 'my_entries':
        if (userId) {
          whereClause += `EXISTS(SELECT 1 FROM tracks WHERE competition_id = c.id AND user_id = $${whereParamIndex} AND is_competition_entry = true)`;
          whereParams.push(userId);
          whereParamIndex++;
        }
        break;
      case 'my_hosted':
        if (userId) {
          whereClause += `c.host_id = $${whereParamIndex}`;
          whereParams.push(userId);
          whereParamIndex++;
        }
        break;
    }
    
    // Add pinned filter
    if (pinned === 'true') {
      if (whereClause) whereClause += ' AND ';
      whereClause += `c.pinned = true`;
    }
    
    // Add genre filter
    if (genreId) {
      if (whereClause) whereClause += ' AND ';
      whereClause += `EXISTS (SELECT 1 FROM track_genres tg WHERE tg.track_id = c.track_id AND tg.genre_id = $${whereParamIndex})`;
      whereParams.push(genreId);
      whereParamIndex++;
    }
    
    // Add instrument filter
    if (instrumentId) {
      if (whereClause) whereClause += ' AND ';
      whereClause += `EXISTS (SELECT 1 FROM track_instruments ti WHERE ti.track_id = c.track_id AND ti.instrument_id = $${whereParamIndex})`;
      whereParams.push(instrumentId);
      whereParamIndex++;
    }

    // Calculate parameter indices for SELECT clause (after WHERE parameters)
    const selectParamOffset = whereParams.length;

    // Build the main query
    let query = `
      SELECT 
        c.*,
        t.id as track_id,
        t.title as track_title,
        t.audio_url,
        t.combined_audio_url,
        t.duration,
        t.layer,
        t.parent_track_id,
        t.play_count,
        t.is_private,
        t.metronome_bpm,
        t.time_signature,
        t.created_at as track_created_at,
        u.id as user_id,
        u.username,
        u.name,
        u.verified,
        u.profile_pic_url,
        t2.title AS original_title,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
        ${userId ? 'EXISTS(SELECT 1 FROM likes WHERE user_id = $' + (selectParamOffset + 1) + ' AND track_id = t.id) AS is_liked,' : 'false AS is_liked,'}
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
        (SELECT COUNT(*) FROM comments WHERE track_id = t.id) AS comment_count,
        (SELECT COUNT(*) FROM reposts WHERE track_id = t.id) AS repost_count,
        (SELECT COUNT(*) FROM tracks WHERE competition_id = c.id AND is_competition_entry = true) AS entry_count,
        ${userId ? 'EXISTS(SELECT 1 FROM tracks WHERE competition_id = c.id AND user_id = $' + (selectParamOffset + 2) + ' AND is_competition_entry = true) AS has_entered,' : 'false AS has_entered,'}
        ${userId ? 'c.host_id = $' + (selectParamOffset + 3) + ' AS is_host' : 'false AS is_host'}
      FROM competitions c
      JOIN tracks t ON c.track_id = t.id
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
    `;
    
    if (whereClause) {
      query += ` WHERE ${whereClause}`;
    }
    
    // Combine WHERE parameters and user parameters for the main query
    queryParams.push(...whereParams);

    // Add user parameters for authenticated requests
    if (userId) {
      queryParams.push(userId, userId, userId);
    }
    
    // Add ordering and pagination
    query += ` ORDER BY c.pinned DESC, c.created_at DESC LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams.push(limitNum, offset);
    
    // Get total count for pagination
    let countQuery = `
      SELECT COUNT(*) 
      FROM competitions c
      JOIN tracks t ON c.track_id = t.id
    `;
    
    if (whereClause) {
      countQuery += ` WHERE ${whereClause}`;
    }
    
    // Count query only needs WHERE clause parameters
    const countParams = whereParams;
    
    const [result, countResult] = await Promise.all([
      pool.query(query, queryParams),
      pool.query(countQuery, countParams)
    ]);
    
    // Process tracks using the existing utility function
    const competitions = await Promise.all(result.rows.map(async (row) => {
      // Map track properties to correct names before processing
      const trackData = {
        ...row,
        id: row.track_id,
        title: row.track_title,
        created_at: row.track_created_at
      };
      const track = await processTrack(trackData, userId);
      return {
        track,
        id: row.id,
        startdate: row.startdate,
        enddate: row.enddate,
        title: row.title,
        description: row.description,
        prize_amount: row.prize_amount,
        host_id: row.host_id,
        pinned: row.pinned,
        sponsored: row.sponsored,
        sponsor_name: row.sponsor_name,
        image_url: row.image_url,
        voucher_code: row.voucher_code,
        winner_selection_method: row.winner_selection_method,
        winner_id: row.winner_id,
        backup_winner_id: row.backup_winner_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        creation_fee_paid: row.creation_fee_paid,
        entry_count: row.entry_count,
        has_entered: row.has_entered,
        is_host: row.is_host
      };
    }));
    
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      competitions,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: limitNum,
        pages: totalPages,
        hasMore: parseInt(page) < totalPages
      }
    });
  } catch (err) {
    console.error('Error fetching competitions:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /competitions/:id - Get specific competition details
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const userId = req.user?.id;
  
  try {
    const query = `
      SELECT 
        c.*,
        t.id as track_id,
        t.title as track_title,
        t.audio_url,
        t.combined_audio_url,
        t.duration,
        t.layer,
        t.parent_track_id,
        t.play_count,
        t.is_private,
        t.metronome_bpm,
        t.time_signature,
        t.created_at as track_created_at,
        u.id as user_id,
        u.username,
        u.name,
        u.verified,
        u.profile_pic_url,
        t2.title AS original_title,
        (SELECT COUNT(*) FROM tracks t3 WHERE t3.parent_track_id = t.id) AS collab_count,
        ${userId ? 'EXISTS(SELECT 1 FROM likes WHERE user_id = $2 AND track_id = t.id) AS is_liked,' : 'false AS is_liked,'}
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
        (SELECT COUNT(*) FROM comments WHERE track_id = t.id) AS comment_count,
        (SELECT COUNT(*) FROM reposts WHERE track_id = t.id) AS repost_count,
        (SELECT COUNT(*) FROM tracks WHERE competition_id = c.id AND is_competition_entry = true) AS entry_count,
        ${userId ? 'EXISTS(SELECT 1 FROM tracks WHERE competition_id = c.id AND user_id = $2 AND is_competition_entry = true) AS has_entered,' : 'false AS has_entered,'}
        ${userId ? 'c.host_id = $2 AS is_host' : 'false AS is_host'}
      FROM competitions c
      JOIN tracks t ON c.track_id = t.id
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE c.id = $1
    `;
    
    const queryParams = userId ? [id, userId] : [id];
    const result = await pool.query(query, queryParams);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Competition not found' });
    }
    
    const row = result.rows[0];
    // Map track properties to correct names before processing
    const trackData = {
      ...row,
      id: row.track_id,
      title: row.track_title,
      created_at: row.track_created_at
    };
    const track = await processTrack(trackData, userId);
    
    const competition = {
      track,
      id: row.id,
      startdate: row.startdate,
      enddate: row.enddate,
      title: row.title,
      description: row.description,
      prize_amount: row.prize_amount,
      host_id: row.host_id,
      pinned: row.pinned,
      sponsored: row.sponsored,
      sponsor_name: row.sponsor_name,
      image_url: row.image_url,
      voucher_code: row.voucher_code,
      winner_selection_method: row.winner_selection_method,
      winner_id: row.winner_id,
      backup_winner_id: row.backup_winner_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      creation_fee_paid: row.creation_fee_paid,
      entry_count: row.entry_count,
      has_entered: row.has_entered,
      is_host: row.is_host
    };
    
    res.json(competition);
  } catch (err) {
    console.error('Error fetching competition:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /competitions/create - Create new competition (with payment integration)
router.post('/create', contentCreationLimiter, authMiddleware, async (req, res) => {
  const {
    track_id,
    startdate,
    enddate,
    prize_amount,
    winner_selection_method,
    pinned = false,
    voucher_code = null
  } = req.body;
  
  const userId = req.user.id;
  
  try {
    // Validate required fields
    if (!track_id || !startdate || !enddate || !prize_amount || !winner_selection_method) {
      return res.status(400).json({ 
        error: 'Missing required fields: track_id, startdate, enddate, prize_amount, winner_selection_method' 
      });
    }
    
    // Validate winner selection method
    if (!['curated', 'automated'].includes(winner_selection_method)) {
      return res.status(400).json({ 
        error: 'winner_selection_method must be either "curated" or "automated"' 
      });
    }
    
    // Validate dates - frontend sends UTC ISO strings, so parse as UTC
    const startDate = new Date(startdate + (startdate.includes('Z') ? '' : 'Z')); // Ensure UTC
    const endDate = new Date(enddate + (enddate.includes('Z') ? '' : 'Z')); // Ensure UTC
    const now = new Date();

    if (startDate <= now) {
      return res.status(400).json({
        error: 'Competition start date must be in the future'
      });
    }

    if (endDate <= startDate) {
      return res.status(400).json({
        error: 'Competition end date must be after start date'
      });
    }

    // Check if competition duration is valid (1 day to 1 month)
    const durationMs = endDate.getTime() - startDate.getTime();
    const durationDays = durationMs / (1000 * 60 * 60 * 24);

    if (durationDays < 1 || durationDays > 30) {
      return res.status(400).json({
        error: 'Competition duration must be between 1 day and 1 month'
      });
    }
    
    // Validate prize amount (minimum $5)
    const prizeAmount = parseInt(prize_amount);
    if (prizeAmount < 500) { // $5 in cents
      return res.status(400).json({ 
        error: 'Prize amount must be at least $5' 
      });
    }
    
    // Check if track exists and belongs to user
    const trackResult = await pool.query(
      'SELECT id, user_id, layer, competition_id FROM tracks WHERE id = $1',
      [track_id]
    );
    
    if (trackResult.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    
    const track = trackResult.rows[0];

    if (track.competition_id !== null) {
      return res.status(400).json({
        error: 'Cannot create competition for a track that is already associated with another competition'
      });
    }
    
    if (track.user_id !== userId) {
      return res.status(403).json({ error: 'You can only create competitions for your own tracks' });
    }
    
    // Check if track is layer 5 (cannot allow more collaborations)
    if (track.layer >= 4) {
      return res.status(400).json({ 
        error: 'Cannot create competition for a track that has reached the maximum collaboration layer' 
      });
    }
    
    // Check if track already has an active competition
    const existingCompetition = await pool.query(
      'SELECT id FROM competitions WHERE track_id = $1 AND enddate > NOW()',
      [track_id]
    );

    if (existingCompetition.rows.length > 0) {
      return res.status(400).json({
        error: 'This track already has an active competition'
      });
    }
    
    // Check user subscription and permissions
    const userResult = await pool.query(
      'SELECT subscription_tier, subscription_expires_at FROM users WHERE id = $1',
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    const subscription = getUserPlan(user);
    
    // Check if user can host competitions
    if (!subscription.features.host_competitions) {
      return res.status(403).json({ 
        error: 'Your subscription tier does not allow hosting competitions. Upgrade your plan to host competitions.',
        upgrade_link: `${process.env.FRONTEND_URL || ''}/subscribe`
      });
    }
    
    // Calculate fees
    const platformFee = Math.round(prizeAmount * 0.15); // 15% platform fee
    const pinningFee = pinned ? 2500 : 0; // $25 for pinning
    const totalFee = prizeAmount + platformFee + pinningFee;
    
    // Check if user has premium subscription (no hosting fees)
    const hasNoHostingFees = subscription.features.no_hosting_fees;
    const finalFee = hasNoHostingFees ? pinningFee : totalFee;
    
    // If using voucher code, validate it
    if (voucher_code) {
      // TODO: Implement voucher validation logic
      // For now, we'll skip fee calculation if voucher is provided
    }
    
    // If no fee required (voucher or premium user with no pinning), create competition immediately
    if (finalFee === 0) {
      const competitionResult = await pool.query(
        `INSERT INTO competitions (
          track_id, startdate, enddate, prize_amount, host_id,
          pinned, winner_selection_method, voucher_code
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [track_id, startDate, endDate, prizeAmount, userId, pinned, winner_selection_method, voucher_code]
      );

      const competition = competitionResult.rows[0];

      // Update the host track with competition_id (is_competition_entry remains false to indicate host track)
      await pool.query(
        'UPDATE tracks SET competition_id = $1 WHERE id = $2',
        [competition.id, track_id]
      );

      // Schedule the competition end event
      try {
        await scheduleCompetitionEnd(competition.id, endDate, winner_selection_method);
        console.log(`Competition end scheduled for ID: ${competition.id}`);
      } catch (scheduleError) {
        console.error('Error scheduling competition end:', scheduleError);
        // Don't fail the request if scheduling fails - log and continue
      }

      return res.status(201).json({
        competition,
        payment_required: false,
        message: 'Competition created successfully'
      });
    }
    
    // Create Stripe checkout session for payment (competition will be created via webhook)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Competition Hosting Fee',
              description: `Host competition with $${(prizeAmount / 100).toFixed(2)} prize${pinned ? ' (Pinned)' : ''}`,
            },
            unit_amount: finalFee,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.FRONTEND_URL}/competition/create?track=${track_id}&payment=success`,
      cancel_url: `${process.env.FRONTEND_URL}/competition/create?track=${track_id}&payment=canceled`,
      metadata: {
        userId: userId,
        trackId: track_id,
        startdate: startDate.toISOString(),
        enddate: endDate.toISOString(),
        prizeAmount: prizeAmount,
        winnerSelectionMethod: winner_selection_method,
        pinned: pinned,
        voucherCode: voucher_code || '',
        type: 'competition_creation'
      },
    });
    
    res.status(201).json({
      payment_required: true,
      checkout_session: {
        id: session.id,
        url: session.url
      },
      message: 'Payment required to create competition'
    });
    
  } catch (err) {
    console.error('Error creating competition:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /competitions/:id - Update competition (host only)
router.put('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { 
    startdate, 
    enddate, 
    winner_selection_method,
    pinned 
  } = req.body;
  
  try {
    // Check if competition exists and user is the host
    const competitionResult = await pool.query(
      'SELECT * FROM competitions WHERE id = $1',
      [id]
    );
    
    if (competitionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Competition not found' });
    }
    
    const competition = competitionResult.rows[0];
    
    if (competition.host_id !== userId) {
      return res.status(403).json({ error: 'You can only update competitions you host' });
    }
    
    // Check if competition has started
    const now = new Date();
    if (new Date(competition.startdate) <= now) {
      return res.status(400).json({ 
        error: 'Cannot update competition after it has started' 
      });
    }
    
    // Check if competition has entries
    const entryCount = await pool.query(
      'SELECT COUNT(*) FROM tracks WHERE competition_id = $1 AND is_competition_entry = true',
      [id]
    );
    
    if (parseInt(entryCount.rows[0].count) > 0) {
      return res.status(400).json({ 
        error: 'Cannot update competition that has entries' 
      });
    }
    
    // Build update query dynamically
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (startdate !== undefined) {
      const startDate = new Date(startdate + (startdate.includes('Z') ? '' : 'Z')); // Ensure UTC
      if (startDate <= now) {
        return res.status(400).json({
          error: 'Competition start date must be in the future'
        });
      }
      updates.push(`startdate = $${paramIndex}`);
      values.push(startDate);
      paramIndex++;
    }

    if (enddate !== undefined) {
      const endDate = new Date(enddate + (enddate.includes('Z') ? '' : 'Z')); // Ensure UTC
      const currentStartDate = startdate ? new Date(startdate + (startdate.includes('Z') ? '' : 'Z')) : new Date(competition.startdate);

      if (endDate <= currentStartDate) {
        return res.status(400).json({
          error: 'Competition end date must be after start date'
        });
      }

      // Check duration limits
      const durationMs = endDate.getTime() - currentStartDate.getTime();
      const durationDays = durationMs / (1000 * 60 * 60 * 24);

      if (durationDays < 1 || durationDays > 30) {
        return res.status(400).json({
          error: 'Competition duration must be between 1 day and 1 month'
        });
      }

      updates.push(`enddate = $${paramIndex}`);
      values.push(endDate);
      paramIndex++;
    }
    
    if (winner_selection_method !== undefined) {
      if (!['curated', 'automated'].includes(winner_selection_method)) {
        return res.status(400).json({ 
          error: 'winner_selection_method must be either "curated" or "automated"' 
        });
      }
      updates.push(`winner_selection_method = $${paramIndex}`);
      values.push(winner_selection_method);
      paramIndex++;
    }
    
    if (pinned !== undefined) {
      updates.push(`pinned = $${paramIndex}`);
      values.push(pinned);
      paramIndex++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    // Add updated_at and competition id
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const query = `
      UPDATE competitions 
      SET ${updates.join(', ')} 
      WHERE id = $${paramIndex} 
      RETURNING *
    `;
    
    const result = await pool.query(query, values);
    
    res.json(result.rows[0]);
    
  } catch (err) {
    console.error('Error updating competition:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /competitions/:id - Cancel/delete competition (with entry validation)
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    // Check if competition exists and user is the host
    const competitionResult = await pool.query(
      'SELECT * FROM competitions WHERE id = $1',
      [id]
    );
    
    if (competitionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Competition not found' });
    }
    
    const competition = competitionResult.rows[0];
    
    if (competition.host_id !== userId) {
      return res.status(403).json({ error: 'You can only delete competitions you host' });
    }
    
    // Check if competition has entries
    const entryCount = await pool.query(
      'SELECT COUNT(*) FROM tracks WHERE competition_id = $1 AND is_competition_entry = true',
      [id]
    );
    
    const hasEntries = parseInt(entryCount.rows[0].count) > 0;
    
    if (hasEntries) {
      return res.status(400).json({ 
        error: 'Cannot delete competition that has entries. You can only cancel competitions before they receive their first entry.' 
      });
    }
    
    // Check if competition has started
    const now = new Date();
    if (new Date(competition.startdate) <= now) {
      return res.status(400).json({ 
        error: 'Cannot delete competition after it has started' 
      });
    }
    
    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Clear competition_id from the host track
      await client.query('UPDATE tracks SET competition_id = NULL WHERE id = $1', [competition.track_id]);

      // Delete the competition
      await client.query('DELETE FROM competitions WHERE id = $1', [id]);

      await client.query('COMMIT');
      
      res.json({ 
        message: 'Competition deleted successfully' 
      });
      
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    
  } catch (err) {
    console.error('Error deleting competition:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /competitions/:id/entries - Get competition entries
router.get('/:id/entries', async (req, res) => {
  const { id: competitionId } = req.params;
  const userId = req.user?.id;
  const { page = 1, limit = 10 } = req.query;
  
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const limitNum = parseInt(limit);

  try {
    // Import track utils here to avoid circular dependencies
    const { getBaseTrackSelectQuery, processTrack } = require('../utils/trackUtils');
    
    let baseQuery;
    let queryParams;
    if (userId) {
      baseQuery = getBaseTrackSelectQuery(true, 2, false);
      queryParams = [competitionId, userId];
    } else {
      baseQuery = getBaseTrackSelectQuery(false, 1, false);
      queryParams = [competitionId];
    }

    // Get competition entries
    let entriesQuery = `
      SELECT 
        ${baseQuery}
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.is_competition_entry = true 
        AND t.competition_id = $1
      ORDER BY t.created_at DESC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    
    // Get the total count for pagination info
    let countQuery = `
      SELECT COUNT(*) 
      FROM tracks
      WHERE is_competition_entry = true 
        AND competition_id = $1
    `;
    
    // Execute queries for entries and count
    const [entriesResult, countResult] = await Promise.all([
      pool.query(entriesQuery, [...queryParams, limitNum, offset]),
      pool.query(countQuery, [competitionId])
    ]);
    
    // Process tracks
    const entries = await Promise.all(entriesResult.rows.map(track => processTrack(track, userId)));
    
    // Get pagination info
    const totalCount = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    res.json({
      data: entries,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: limitNum,
        pages: totalPages,
        hasMore: parseInt(page) < totalPages
      }
    });
  } catch (err) {
    console.error('Error fetching competition entries:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
