const express = require('express');
const router = express.Router();
const pool = require('../config/db.cjs');
const { authMiddleware } = require('../middleware/auth.cjs');
const { contentCreationLimiter, apiEndpointLimiter } = require('../middleware/rateLimiting.cjs');
const { validateTeamAccess, validateTeamFolderAccess, getTeamDetails, checkTeamUserLimit, isTeamSubscriptionExpired, checkTeamOwner, checkTeamAdminOrOwner } = require('../utils/teamUtils.cjs');
const { TEAM_PRODUCT_VERSIONS, TEAM_PLANS, isValidTeamProductVersion } = require('../utils/subscriptionUtils.cjs');
const { getBaseTrackSelectQuery, processTrack } = require('../utils/trackUtils.cjs');
const stripe = require('../config/stripe.cjs');

// Helper function to check if user is team admin
async function checkTeamAdmin(teamId, userId) {
  const adminCheck = await pool.query(
    'SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2 AND role = $3',
    [userId, teamId, 'admin']
  );
  return adminCheck.rows.length > 0;
}

// Apply auth middleware to all routes
router.use(authMiddleware);

// Create team checkout session (team will be created in webhook after successful subscription payment)
router.post('/', contentCreationLimiter, async (req, res) => {
  const { name, product_version } = req.body;

  // Validate required fields
  if (!name || !product_version) {
    return res.status(400).json({ error: 'Team name and product version are required' });
  }

  // Validate product version using shared config
  if (!isValidTeamProductVersion(product_version)) {
    return res.status(400).json({ error: 'Invalid product version' });
  }

  // Get team plan from extended config (includes Stripe price IDs)
  const teamPlan = TEAM_PLANS[product_version];
  if (!teamPlan) {
    return res.status(400).json({ error: 'Invalid product version' });
  }

  // Enterprise plan requires contact, no checkout session
  if (product_version === TEAM_PRODUCT_VERSIONS.ENTERPRISE) {
    return res.status(400).json({ error: 'Enterprise plan requires contacting sales. Please reach out for custom pricing.' });
  }

  // Check if Stripe price ID is configured
  if (!teamPlan.stripe_price_id) {
    return res.status(500).json({ error: 'Team plan not configured. Please contact support.' });
  }

  try {
    // Get user from database to get email
    const userResult = await pool.query(
      'SELECT email FROM users WHERE id = $1',
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    
    // Create a new Stripe customer for this team
    // Each team gets its own customer to prevent balance carryover from previous subscriptions
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: {
        userId: req.user.id,
        teamName: name,
        productVersion: product_version,
      },
    });

    // Create Stripe checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: teamPlan.stripe_price_id,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      customer: customer.id,
      success_url: `${process.env.FRONTEND_URL}/team/created?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/teams`,
      metadata: {
        userId: req.user.id,
        type: 'team_creation',
        teamName: name,
        productVersion: product_version,
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Error creating team checkout session:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// Get team creation success details
router.get('/created', apiEndpointLimiter, async (req, res) => {
  const { session_id } = req.query;

  if (!session_id) {
    return res.status(400).json({ error: 'Session ID is required' });
  }

  try {
    // Get session details from Stripe
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (parseInt(session.metadata.userId) !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.payment_status !== 'paid') {
      return res.status(400).json({ error: 'Payment not completed' });
    }

    // Find the team created for this session
    const teamResult = await pool.query(
      'SELECT id, name, product_version, subscription_status, team_code FROM teams WHERE stripe_subscription_id = $1 OR stripe_customer_id = $2 ORDER BY created_at DESC LIMIT 1',
      [session.subscription || session.id, session.customer]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found. It may still be processing.' });
    }

    res.json(teamResult.rows[0]);
  } catch (error) {
    console.error('Error retrieving team creation details:', error);
    res.status(500).json({ error: 'Failed to retrieve team details' });
  }
});

// Validate team access via invite code
router.post('/validate-code', apiEndpointLimiter, async (req, res) => {
  const { code } = req.body;

  if (!code) {
    return res.status(400).json({ error: 'Team code is required' });
  }

  try {
    const teamResult = await pool.query(
      `SELECT t.*, u.username as admin_username, u.name as admin_name
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id AND tm.role IN ('admin', 'owner')
       JOIN users u ON tm.user_id = u.id
       WHERE t.team_code = $1
       LIMIT 1`,
      [code]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Invalid team code' });
    }

    const team = teamResult.rows[0];

    // Check if team subscription is active
    if (team.subscription_status !== 'active' && team.subscription_status !== 'trialing') {
      return res.status(400).json({ error: 'This team subscription is not active' });
    }

    // Check if subscription has expired
    if (isTeamSubscriptionExpired(team)) {
      return res.status(400).json({ error: 'This team subscription has expired' });
    }

    // Check if user is already a member
    const membershipCheck = await pool.query(
      'SELECT id FROM team_members WHERE user_id = $1 AND team_id = $2',
      [req.user.id, team.id]
    );

    const isMember = membershipCheck.rows.length > 0;

    if (isMember) {
      res.json({
        valid: true,
        team,
        is_member: true,
        message: 'You are already a member of this team'
      });
    } else {
      // Check if team has reached user limit
      const userLimitCheck = await checkTeamUserLimit(team.id);
      if (!userLimitCheck.valid) {
        return res.status(400).json({ error: userLimitCheck.error });
      }

      // Add user to team
      await pool.query(
        'INSERT INTO team_members (user_id, team_id, role) VALUES ($1, $2, $3)',
        [req.user.id, team.id, 'contributor']
      );

      res.json({
        valid: true,
        team,
        is_member: false,
        message: 'Successfully joined team'
      });
    }
  } catch (error) {
    console.error('Error validating team code:', error);
    res.status(500).json({ error: 'Failed to validate team code' });
  }
});

// Get team details with members and folders
router.get('/:id', apiEndpointLimiter, async (req, res) => {
  try {
    const teamId = parseInt(req.params.id);

    const teamDetails = await getTeamDetails(teamId, req.user.id);

    if (!teamDetails.valid) {
      return res.status(teamDetails.error === 'You are not a member of this team' ? 403 : 404)
                 .json({ error: teamDetails.error });
    }

    res.json(teamDetails.team);
  } catch (error) {
    console.error('Error fetching team:', error);
    res.status(500).json({ error: 'Failed to fetch team details' });
  }
});

// Update team settings (admin/owner only)
router.put('/:id', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Team name is required' });
  }

  try {
    // Check if user is admin or owner
    const isAdminOrOwner = await checkTeamAdminOrOwner(teamId, req.user.id);
    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    const result = await pool.query(
      'UPDATE teams SET name = $1 WHERE id = $2 RETURNING *',
      [name, teamId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating team:', error);
    res.status(500).json({ error: 'Failed to update team' });
  }
});

// Invite user to team
router.post('/:id/invite', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const { username } = req.body;

  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }

  try {
    // Check if user is admin or owner
    const isAdminOrOwner = await checkTeamAdminOrOwner(teamId, req.user.id);
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

    // Check if user is already in team
    const existingMember = await pool.query(
      'SELECT id FROM team_members WHERE user_id = $1 AND team_id = $2',
      [invitedUser.id, teamId]
    );

    if (existingMember.rows.length > 0) {
      return res.status(400).json({ error: 'User is already a member of this team' });
    }

    // Check if team has reached user limit
    const userLimitCheck = await checkTeamUserLimit(teamId);
    if (!userLimitCheck.valid) {
      return res.status(400).json({ error: userLimitCheck.error });
    }

    // Add user to team
    await pool.query(
      'INSERT INTO team_members (user_id, team_id, role) VALUES ($1, $2, $3)',
      [invitedUser.id, teamId, 'contributor']
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

// Get team members list
router.get('/:id/members', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);

  try {
    // Verify user has access to team
    const accessCheck = await validateTeamAccess(teamId, req.user.id);
    if (!accessCheck.valid) {
      return res.status(403).json({ error: accessCheck.error });
    }

    const membersResult = await pool.query(
      `SELECT tm.role, u.id, u.username, u.name, u.profile_pic_url, tm.joined_at
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
       ORDER BY tm.joined_at`,
      [teamId]
    );

    res.json({ members: membersResult.rows });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

// Update member role (owner/admin can change roles, but admins cannot demote admins)
router.patch('/:id/members/:userId/role', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);
  const { role } = req.body;

  if (!role) {
    return res.status(400).json({ error: 'Role is required' });
  }

  // Validate role
  if (!['admin', 'contributor', 'viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be admin, contributor, or viewer' });
  }

  try {
    // Check if user is owner or admin
    const isOwner = await checkTeamOwner(teamId, req.user.id);
    const isAdmin = await checkTeamAdmin(teamId, req.user.id);
    
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Owner or admin access required' });
    }

    // Prevent changing your own role
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    // Check if user is a member of the team
    const memberCheck = await pool.query(
      'SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2',
      [userId, teamId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User is not a member of this team' });
    }

    const currentRole = memberCheck.rows[0].role;

    // Prevent promoting to owner (owner role is set only at team creation)
    if (role === 'owner') {
      return res.status(400).json({ error: 'Cannot assign owner role' });
    }

    // Prevent changing owner role
    if (currentRole === 'owner') {
      return res.status(400).json({ error: 'Cannot change owner role' });
    }

    // Admins cannot demote other admins
    if (!isOwner && isAdmin && currentRole === 'admin' && role !== 'admin') {
      return res.status(403).json({ error: 'Admins cannot demote other admins' });
    }

    // Update role
    await pool.query(
      'UPDATE team_members SET role = $1 WHERE user_id = $2 AND team_id = $3',
      [role, userId, teamId]
    );

    res.json({ message: 'Member role updated successfully' });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// Remove member from team (admin/owner only)
router.delete('/:id/members/:userId', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const userId = parseInt(req.params.userId);

  try {
    // Check if user is admin or owner
    const isAdminOrOwner = await checkTeamAdminOrOwner(teamId, req.user.id);
    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    // Prevent removing yourself
    if (userId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself from the team' });
    }

    // Check if user is a member of the team and get their role
    const memberCheck = await pool.query(
      'SELECT id, role FROM team_members WHERE user_id = $1 AND team_id = $2',
      [userId, teamId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(404).json({ error: 'User is not a member of this team' });
    }

    const targetMemberRole = memberCheck.rows[0].role;

    // Prevent removing the owner
    if (targetMemberRole === 'owner') {
      return res.status(403).json({ error: 'Cannot remove the team owner' });
    }

    // Prevent admins (non-owners) from removing other admins
    const isCurrentUserOwner = await checkTeamOwner(teamId, req.user.id);
    if (!isCurrentUserOwner && targetMemberRole === 'admin') {
      return res.status(403).json({ error: 'Admins cannot remove other admins from the team' });
    }

    // Remove user from team
    await pool.query(
      'DELETE FROM team_members WHERE user_id = $1 AND team_id = $2',
      [userId, teamId]
    );

    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    console.error('Error removing team member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Get team tracks feed (paginated)
router.get('/:id/tracks', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const { sort_by = 'recent', page = 1, limit = 20 } = req.query;
  
  try {
    // Verify user has access to team
    const accessCheck = await validateTeamAccess(teamId, req.user.id);
    if (!accessCheck.valid) {
      return res.status(403).json({ error: accessCheck.error });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Determine sort order
    let orderBy = 't.created_at DESC'; // default: recent
    if (sort_by === 'bpm') {
      orderBy = 't.metronome_bpm ASC';
    } else if (sort_by === 'key') {
      orderBy = 't.key ASC';
    }

    // Get tracks associated with team using standardized track query
    const baseQuery = getBaseTrackSelectQuery(true, 1, true);
    const tracksQuery = `
      SELECT 
        ${baseQuery},
        t.team_folder_id,
        t.key,
        tf.name as folder_name
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      LEFT JOIN team_folders tf ON t.team_folder_id = tf.id
      WHERE t.team_id = $2 AND t.processing_status = 'completed'
      ORDER BY ${orderBy}
      LIMIT $3 OFFSET $4
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tracks t
      WHERE t.team_id = $1 AND t.processing_status = 'completed'
    `;

    const [tracksResult, countResult] = await Promise.all([
      pool.query(tracksQuery, [req.user.id, teamId, limit, offset]),
      pool.query(countQuery, [teamId])
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
    console.error('Error fetching team tracks:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Get team folders list
router.get('/:id/folders', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);

  try {
    // Verify user has access to team
    const accessCheck = await validateTeamAccess(teamId, req.user.id);
    if (!accessCheck.valid) {
      return res.status(403).json({ error: accessCheck.error });
    }

    const foldersResult = await pool.query(
      `SELECT tf.*, u.username as creator_username, u.name as creator_name,
              (SELECT COUNT(*) FROM tracks WHERE team_folder_id = tf.id) as track_count
       FROM team_folders tf
       LEFT JOIN users u ON tf.created_by = u.id
       WHERE tf.team_id = $1
       ORDER BY tf.created_at`,
      [teamId]
    );

    res.json({ folders: foldersResult.rows });
  } catch (error) {
    console.error('Error fetching team folders:', error);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

// Create folder (admin/contributor)
router.post('/:id/folders', contentCreationLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const { name, parent_folder_id } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  try {
    // Verify user has access and is admin or contributor
    const accessCheck = await validateTeamAccess(teamId, req.user.id);
    if (!accessCheck.valid) {
      return res.status(403).json({ error: accessCheck.error });
    }

    if (accessCheck.team.user_role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot create folders' });
    }

    // If parent_folder_id is provided, validate it belongs to the team
    if (parent_folder_id) {
      const parentCheck = await pool.query(
        'SELECT id FROM team_folders WHERE id = $1 AND team_id = $2',
        [parent_folder_id, teamId]
      );

      if (parentCheck.rows.length === 0) {
        return res.status(404).json({ error: 'Parent folder not found in this team' });
      }
    }

    // Check if folder name already exists in this team and parent folder
    const existingFolder = await pool.query(
      'SELECT id FROM team_folders WHERE team_id = $1 AND name = $2 AND (parent_folder_id = $3 OR (parent_folder_id IS NULL AND $3 IS NULL))',
      [teamId, name, parent_folder_id || null]
    );

    if (existingFolder.rows.length > 0) {
      return res.status(400).json({ error: 'Folder name already exists in this location' });
    }

    const result = await pool.query(
      `INSERT INTO team_folders (team_id, name, parent_folder_id, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [teamId, name, parent_folder_id || null, req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

// Update folder name (admin/contributor)
router.put('/:id/folders/:folderId', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const folderId = parseInt(req.params.folderId);
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Folder name is required' });
  }

  try {
    // Validate folder access
    const folderValidation = await validateTeamFolderAccess(folderId, teamId, req.user.id);
    if (!folderValidation.valid) {
      return res.status(403).json({ error: folderValidation.error });
    }

    if (folderValidation.team.user_role === 'viewer') {
      return res.status(403).json({ error: 'Viewers cannot update folders' });
    }

    // Check if folder name already exists in this team and parent folder
    const existingFolder = await pool.query(
      'SELECT id FROM team_folders WHERE team_id = $1 AND name = $2 AND id != $3 AND (parent_folder_id = $4 OR (parent_folder_id IS NULL AND $4 IS NULL))',
      [teamId, name, folderId, folderValidation.folder.parent_folder_id]
    );

    if (existingFolder.rows.length > 0) {
      return res.status(400).json({ error: 'Folder name already exists in this location' });
    }

    const result = await pool.query(
      'UPDATE team_folders SET name = $1 WHERE id = $2 RETURNING *',
      [name, folderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating folder:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

// Delete folder (admin/owner only)
router.delete('/:id/folders/:folderId', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const folderId = parseInt(req.params.folderId);

  try {
    // Check if user is admin or owner
    const isAdminOrOwner = await checkTeamAdminOrOwner(teamId, req.user.id);
    if (!isAdminOrOwner) {
      return res.status(403).json({ error: 'Admin or owner access required' });
    }

    // Verify folder belongs to team
    const folderCheck = await pool.query(
      'SELECT id FROM team_folders WHERE id = $1 AND team_id = $2',
      [folderId, teamId]
    );

    if (folderCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Folder not found in this team' });
    }

    // Check if folder has subfolders
    const subfolderCheck = await pool.query(
      'SELECT id FROM team_folders WHERE parent_folder_id = $1',
      [folderId]
    );

    if (subfolderCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Cannot delete folder with subfolders. Please delete subfolders first.' });
    }

    // Delete folder (cascade will handle tracks)
    await pool.query(
      'DELETE FROM team_folders WHERE id = $1',
      [folderId]
    );

    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    console.error('Error deleting folder:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Get tracks in folder (paginated)
router.get('/:id/folders/:folderId/tracks', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const folderId = parseInt(req.params.folderId);
  const { page = 1, limit = 20 } = req.query;
  
  try {
    // Validate folder access
    const folderValidation = await validateTeamFolderAccess(folderId, teamId, req.user.id);
    if (!folderValidation.valid) {
      return res.status(403).json({ error: folderValidation.error });
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Get tracks in folder using standardized track query
    const baseQuery = getBaseTrackSelectQuery(true, 1, true);
    const tracksQuery = `
      SELECT 
        ${baseQuery},
        t.team_folder_id,
        t.key
      FROM tracks t
      LEFT JOIN tracks t2 ON t.parent_track_id = t2.id
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users u2 ON t2.user_id = u2.id
      WHERE t.team_folder_id = $2 AND t.processing_status = 'completed'
      ORDER BY t.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tracks t
      WHERE t.team_folder_id = $1 AND t.processing_status = 'completed'
    `;

    const [tracksResult, countResult] = await Promise.all([
      pool.query(tracksQuery, [req.user.id, folderId, limit, offset]),
      pool.query(countQuery, [folderId])
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
    console.error('Error fetching folder tracks:', error);
    res.status(500).json({ error: 'Failed to fetch tracks' });
  }
});

// Move track to folder (admin/contributor)
router.patch('/:id/tracks/:trackId/folder', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const trackId = parseInt(req.params.trackId);
  const { folder_id } = req.body;

  try {
    // Verify user has access to team
    const accessCheck = await validateTeamAccess(teamId, req.user.id);
    if (!accessCheck.valid) {
      return res.status(403).json({ error: accessCheck.error });
    }

    // Check if user is contributor or admin
    const memberCheck = await pool.query(
      'SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2',
      [req.user.id, teamId]
    );

    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'You are not a member of this team' });
    }

    const userRole = memberCheck.rows[0].role;
    if (userRole !== 'admin' && userRole !== 'contributor' && userRole !== 'owner') {
      return res.status(403).json({ error: 'Only contributors, admins, and owners can move tracks' });
    }

    // Verify track belongs to team
    const trackCheck = await pool.query(
      'SELECT id, team_id, team_folder_id FROM tracks WHERE id = $1 AND team_id = $2',
      [trackId, teamId]
    );

    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found or does not belong to this team' });
    }

    // If folder_id is provided, validate folder access
    if (folder_id !== null && folder_id !== undefined) {
      const folderValidation = await validateTeamFolderAccess(folder_id, teamId, req.user.id);
      if (!folderValidation.valid) {
        return res.status(403).json({ error: folderValidation.error });
      }
    }

    // Update track's folder
    await pool.query(
      'UPDATE tracks SET team_folder_id = $1 WHERE id = $2',
      [folder_id || null, trackId]
    );

    res.json({ 
      success: true,
      message: 'Track moved successfully'
    });
  } catch (error) {
    console.error('Error moving track:', error);
    res.status(500).json({ error: 'Failed to move track' });
  }
});

// Get team subscription status (owner only)
router.get('/:id/subscription-status', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);

  try {
    // Check if user is owner
    const isOwner = await checkTeamOwner(teamId, req.user.id);
    if (!isOwner) {
      return res.status(403).json({ error: 'Owner access required' });
    }

    // Get team subscription details
    const teamResult = await pool.query(
      'SELECT product_version, subscription_status, subscription_expires_at, stripe_subscription_id, stripe_customer_id FROM teams WHERE id = $1',
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teamResult.rows[0];
    
    let subscriptionStatus = {
      product_version: team.product_version,
      subscription_status: team.subscription_status,
      expires_at: team.subscription_expires_at,
      is_active: false,
      cancel_at_period_end: false
    };

    if (team.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(team.stripe_subscription_id);
        subscriptionStatus.is_active = subscription.status === 'active' || subscription.status === 'trialing';
        subscriptionStatus.cancel_at_period_end = subscription.cancel_at_period_end;
        subscriptionStatus.current_period_end = new Date(subscription.current_period_end * 1000);
      } catch (error) {
        console.error('Error retrieving subscription from Stripe:', error);
      }
    }

    res.json(subscriptionStatus);
  } catch (error) {
    console.error('Error getting team subscription status:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
});

// Modify team subscription (upgrade/downgrade) - owner only
router.post('/:id/modify-subscription', contentCreationLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);
  const { product_version: newProductVersion } = req.body;

  try {
    // Check if user is owner
    const isOwner = await checkTeamOwner(teamId, req.user.id);
    if (!isOwner) {
      return res.status(403).json({ error: 'Owner access required' });
    }

    if (!newProductVersion || !isValidTeamProductVersion(newProductVersion)) {
      return res.status(400).json({ error: 'Invalid product version' });
    }

    // Get team details
    const teamResult = await pool.query(
      'SELECT product_version, stripe_subscription_id, stripe_customer_id FROM teams WHERE id = $1',
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teamResult.rows[0];

    // Enterprise plan requires contact, cannot be changed via API
    if (newProductVersion === TEAM_PRODUCT_VERSIONS.ENTERPRISE) {
      return res.status(400).json({ error: 'Enterprise plan requires contacting sales. Please reach out for custom pricing.' });
    }

    // If team doesn't have an existing subscription, create a new one
    if (!team.stripe_subscription_id) {
      const newPlan = TEAM_PLANS[newProductVersion];
      if (!newPlan.stripe_price_id) {
        return res.status(400).json({ error: 'Team plan not configured' });
      }

      // Create checkout session for new subscription
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: newPlan.stripe_price_id,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        customer: team.stripe_customer_id,
        success_url: `${process.env.FRONTEND_URL}/teams/${teamId}?subscription=success`,
        cancel_url: `${process.env.FRONTEND_URL}/teams/${teamId}`,
        metadata: {
          userId: req.user.id,
          type: 'team_subscription_modify',
          teamId: teamId.toString(),
          productVersion: newProductVersion,
        },
      });

      return res.json({ 
        type: 'checkout_session',
        id: session.id,
        url: session.url
      });
    }

    // Get current subscription details
    const subscription = await stripe.subscriptions.retrieve(team.stripe_subscription_id);

    // Handle reactivation of canceled subscription
    if (subscription.cancel_at_period_end) {
      const currentPriceId = subscription.items.data[0]?.price?.id;
      const newPlan = TEAM_PLANS[newProductVersion];
      
      if (currentPriceId === newPlan.stripe_price_id) {
        await stripe.subscriptions.update(team.stripe_subscription_id, {
          cancel_at_period_end: false,
        });
        
        return res.json({ 
          message: `Successfully reactivated your ${newPlan.name} subscription`,
          type: 'reactivation'
        });
      }
    }

    // Handle product version change between paid plans
    const newPlan = TEAM_PLANS[newProductVersion];
    if (!newPlan.stripe_price_id) {
      return res.status(400).json({ error: 'Team plan not configured' });
    }

    // Update subscription with new price - Stripe handles proration automatically
    const updatedSubscription = await stripe.subscriptions.update(team.stripe_subscription_id, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPlan.stripe_price_id,
      }],
      cancel_at_period_end: false, // Ensure subscription is not set to cancel
      proration_behavior: 'always_invoice', // Handle proration for immediate changes
    });

    // Update team record immediately (webhook will also update, but this ensures consistency)
    await pool.query(
      `UPDATE teams SET 
       product_version = $1, 
       subscription_expires_at = $2
       WHERE id = $3`,
      [
        newProductVersion,
        new Date(updatedSubscription.current_period_end * 1000),
        teamId
      ]
    );

    res.json({ 
      message: `Successfully switched to ${newPlan.name}`,
      type: 'tier_change',
      newProductVersion: newProductVersion
    });

  } catch (error) {
    console.error('Error modifying team subscription:', error);
    res.status(500).json({ 
      error: error.message || 'Failed to modify subscription'
    });
  }
});

// Cancel team subscription (owner only)
router.post('/:id/cancel-subscription', apiEndpointLimiter, async (req, res) => {
  const teamId = parseInt(req.params.id);

  try {
    // Check if user is owner
    const isOwner = await checkTeamOwner(teamId, req.user.id);
    if (!isOwner) {
      return res.status(403).json({ error: 'Owner access required' });
    }

    // Get team subscription details
    const teamResult = await pool.query(
      'SELECT stripe_subscription_id FROM teams WHERE id = $1',
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const team = teamResult.rows[0];

    if (!team.stripe_subscription_id) {
      return res.status(400).json({ error: 'Team does not have an active subscription' });
    }

    // Cancel the subscription at period end
    await stripe.subscriptions.update(team.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    res.json({ message: 'Subscription will be canceled at the end of the current period' });
  } catch (error) {
    console.error('Error canceling team subscription:', error);
    res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

module.exports = router;

