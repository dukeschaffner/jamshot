const pool = require('../config/db.cjs');
const { getTeamPlan } = require('../../shared/utils/subscription.cjs');

/**
 * Check if team subscription is expired
 * @param {Object} team - Team object with subscription_expires_at
 * @returns {boolean} True if subscription is expired
 */
function isTeamSubscriptionExpired(team) {
  if (!team.subscription_expires_at) {
    return false; // If no expiration date, assume not expired (could be enterprise or legacy)
  }
  const expiresAt = new Date(team.subscription_expires_at);
  const now = new Date();
  return expiresAt < now;
}

/**
 * Validate user's access to a team
 * @param {number} teamId - Team ID to validate
 * @param {number} userId - User ID to check
 * @returns {Object} Validation result with team data or error
 */
async function validateTeamAccess(teamId, userId) {
  try {
    const result = await pool.query(
      `SELECT t.*, tm.role
       FROM teams t
       JOIN team_members tm ON t.id = tm.team_id
       WHERE t.id = $1 AND tm.user_id = $2`,
      [teamId, userId]
    );

    if (result.rows.length === 0) {
      return { valid: false, error: 'You are not a member of this team' };
    }

    const team = result.rows[0];

    // Check if team subscription is active
    if (team.subscription_status !== 'active' && team.subscription_status !== 'trialing') {
      return { valid: false, error: 'Team subscription is not active' };
    }

    // Check if subscription has expired
    if (isTeamSubscriptionExpired(team)) {
      return { valid: false, error: 'Team subscription has expired' };
    }

    return {
      valid: true,
      team: {
        id: team.id,
        name: team.name,
        product_version: team.product_version,
        subscription_status: team.subscription_status,
        user_role: team.role
      }
    };
  } catch (error) {
    console.error('Error validating team access:', error);
    return { valid: false, error: 'Failed to validate team access' };
  }
}

/**
 * Validate folder access within a team
 * @param {number} folderId - Folder ID to validate
 * @param {number} teamId - Team ID the folder should belong to
 * @param {number} userId - User ID to check membership
 * @param {object} team - Optional team object from previous validation (to avoid redundant DB call)
 * @returns {Object} Validation result
 */
async function validateTeamFolderAccess(folderId, teamId, userId, team = null) {
  try {
    // Validate team access if team object not provided
    let teamValidation;
    if (team) {
      // If team object is provided, create validation result object
      teamValidation = {
        valid: true,
        team: team
      };
    } else {
      // Otherwise, validate team access
      teamValidation = await validateTeamAccess(teamId, userId);
      if (!teamValidation.valid) {
        return teamValidation;
      }
    }

    // Check if folder exists and belongs to team
    const folderResult = await pool.query(
      'SELECT id, name, parent_folder_id FROM team_folders WHERE id = $1 AND team_id = $2',
      [folderId, teamId]
    );

    if (folderResult.rows.length === 0) {
      return { valid: false, error: 'Folder does not exist in this team' };
    }

    return {
      valid: true,
      folder: folderResult.rows[0],
      team: teamValidation.team
    };
  } catch (error) {
    console.error('Error validating team folder access:', error);
    return { valid: false, error: 'Failed to validate team folder access' };
  }
}

/**
 * Get team details with members and folders
 * @param {number} teamId - Team ID
 * @param {number} userId - User ID (for access validation)
 * @returns {Object} Team details or error
 */
async function getTeamDetails(teamId, userId) {
  try {
    // Validate access first
    const accessValidation = await validateTeamAccess(teamId, userId);
    if (!accessValidation.valid) {
      return accessValidation;
    }

    // Get team details
    const teamResult = await pool.query(
      `SELECT t.*, u.username as admin_username, u.name as admin_name
       FROM teams t
       JOIN users u ON t.created_by = u.id
       WHERE t.id = $1`,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return { valid: false, error: 'Team not found' };
    }

    const team = teamResult.rows[0];

    // Get team members
    const membersResult = await pool.query(
      `SELECT tm.role, u.id, u.username, u.name, u.profile_pic_url, tm.joined_at
       FROM team_members tm
       JOIN users u ON tm.user_id = u.id
       WHERE tm.team_id = $1
       ORDER BY tm.joined_at`,
      [teamId]
    );

    // Get folders
    const foldersResult = await pool.query(
      `SELECT tf.*, u.username as creator_username, u.name as creator_name
       FROM team_folders tf
       LEFT JOIN users u ON tf.created_by = u.id
       WHERE tf.team_id = $1
       ORDER BY tf.created_at`,
      [teamId]
    );

    // Get user limit information
    const userLimitInfo = await checkTeamUserLimit(teamId);

    return {
      valid: true,
      team: {
        ...team,
        user_role: accessValidation.team.user_role,
        members: membersResult.rows,
        folders: foldersResult.rows,
        user_limit: {
          current_users: userLimitInfo.current_users,
          max_users: userLimitInfo.max_users,
          spots_remaining: userLimitInfo.max_users === -1 ? -1 : userLimitInfo.max_users - userLimitInfo.current_users
        }
      }
    };
  } catch (error) {
    console.error('Error getting team details:', error);
    return { valid: false, error: 'Failed to get team details' };
  }
}

/**
 * Check if user is team owner
 * @param {number} teamId - Team ID
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if user is owner
 */
async function checkTeamOwner(teamId, userId) {
  try {
    const result = await pool.query(
      'SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2 AND role = $3',
      [userId, teamId, 'owner']
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking team owner:', error);
    return false;
  }
}

/**
 * Check if user is team admin or owner (owner has all admin permissions)
 * @param {number} teamId - Team ID
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if user is admin or owner
 */
async function checkTeamAdminOrOwner(teamId, userId) {
  try {
    const result = await pool.query(
      'SELECT role FROM team_members WHERE user_id = $1 AND team_id = $2 AND role IN (\'admin\', \'owner\')',
      [userId, teamId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking team admin/owner:', error);
    return false;
  }
}

/**
 * Check if team has reached its user limit based on product version
 * @param {number} teamId - Team ID to check
 * @returns {Object} Validation result with limit info
 */
async function checkTeamUserLimit(teamId) {
  try {
    // Get team with current member count
    const teamResult = await pool.query(
      `SELECT t.product_version,
              COUNT(tm.user_id) as current_users
       FROM teams t
       LEFT JOIN team_members tm ON t.id = tm.team_id
       WHERE t.id = $1
       GROUP BY t.id, t.product_version`,
      [teamId]
    );

    if (teamResult.rows.length === 0) {
      return { valid: false, error: 'Team not found' };
    }

    const team = teamResult.rows[0];
    const currentUsers = parseInt(team.current_users);

    // Get user limit from shared team plan config
    const teamPlan = getTeamPlan(team.product_version);
    if (!teamPlan) {
      return { valid: false, error: 'Invalid product version' };
    }

    const maxUsers = teamPlan.max_users;

    // Enterprise plan has unlimited users
    if (maxUsers === -1) {
      return {
        valid: true,
        current_users: currentUsers,
        max_users: -1,
        product_version: team.product_version,
        error: null
      };
    }

    return {
      valid: currentUsers < maxUsers,
      current_users: currentUsers,
      max_users: maxUsers,
      product_version: team.product_version,
      error: currentUsers >= maxUsers ? `Team has reached its maximum capacity of ${maxUsers} users` : null
    };
  } catch (error) {
    console.error('Error checking team user limit:', error);
    return { valid: false, error: 'Failed to check team user limit' };
  }
}

module.exports = {
  validateTeamAccess,
  validateTeamFolderAccess,
  getTeamDetails,
  checkTeamUserLimit,
  isTeamSubscriptionExpired,
  checkTeamOwner,
  checkTeamAdminOrOwner
};

