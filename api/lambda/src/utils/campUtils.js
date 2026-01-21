import pool from '../config/db.js';

/**
 * Validate user's access to a camp
 * @param {number} campId - Camp ID to validate
 * @param {string} userId - User ID to check
 * @returns {Object} Validation result with camp data or error
 */
async function validateCampAccess(campId, userId) {
  try {
    const result = await pool.query(
      `SELECT c.*, uc.role
       FROM camps c
       JOIN user_camps uc ON c.id = uc.camp_id
       WHERE c.id = $1 AND uc.user_id = $2`,
      [campId, userId]
    );

    if (result.rows.length === 0) {
      return { valid: false, error: 'You are not a member of this camp' };
    }

    const camp = result.rows[0];
    const now = new Date();

    // Check if camp is still active
    if (now > new Date(camp.end_date)) {
      return { valid: false, error: 'This camp has ended' };
    }

    return {
      valid: true,
      camp: {
        id: camp.id,
        name: camp.name,
        start_date: camp.start_date,
        end_date: camp.end_date,
        product_version: camp.product_version,
        user_role: camp.role
      }
    };
  } catch (error) {
    console.error('Error validating camp access:', error);
    return { valid: false, error: 'Failed to validate camp access' };
  }
}

/**
 * Validate room access within a camp
 * @param {number} roomId - Room ID to validate
 * @param {number} campId - Camp ID the room should belong to
 * @param {string} userId - User ID to check membership
 * @returns {Object} Validation result
 */
async function validateRoomAccess(roomId, campId, userId) {
  try {
    // First validate camp access
    const campValidation = await validateCampAccess(campId, userId);
    if (!campValidation.valid) {
      return campValidation;
    }

    // Check if room exists and belongs to camp
    const roomResult = await pool.query(
      'SELECT id, name FROM rooms WHERE id = $1 AND camp_id = $2',
      [roomId, campId]
    );

    if (roomResult.rows.length === 0) {
      return { valid: false, error: 'Room does not exist in this camp' };
    }

    return {
      valid: true,
      room: roomResult.rows[0],
      camp: campValidation.camp
    };
  } catch (error) {
    console.error('Error validating room access:', error);
    return { valid: false, error: 'Failed to validate room access' };
  }
}

/**
 * Get camp details with members and rooms
 * @param {number} campId - Camp ID
 * @param {number} userId - User ID (for access validation)
 * @returns {Object} Camp details or error
 */
async function getCampDetails(campId, userId) {
  try {
    // Validate access first
    const accessValidation = await validateCampAccess(campId, userId);
    if (!accessValidation.valid) {
      return accessValidation;
    }

    // Get camp details
    const campResult = await pool.query(
      `SELECT c.*, u.username as admin_username, u.name as admin_name
       FROM camps c
       JOIN users u ON c.created_by = u.id
       WHERE c.id = $1`,
      [campId]
    );

    if (campResult.rows.length === 0) {
      return { valid: false, error: 'Camp not found' };
    }

    const camp = campResult.rows[0];

    // Get camp members with their room assignments
    const membersResult = await pool.query(
      `SELECT uc.role, u.id, u.username, u.name, u.profile_pic_url, r.id as room_id
       FROM user_camps uc
       JOIN users u ON uc.user_id = u.id
       LEFT JOIN user_rooms ur ON u.id = ur.user_id
       LEFT JOIN rooms r ON ur.room_id = r.id AND r.camp_id = $1
       WHERE uc.camp_id = $1
       ORDER BY uc.joined_at`,
      [campId]
    );

    // Get rooms with members (including role from user_camps) and track_count
    const roomsResult = await pool.query(
      `SELECT r.*,
              json_agg(
                json_build_object(
                  'id', u.id,
                  'username', u.username,
                  'name', u.name,
                  'profile_pic_url', u.profile_pic_url,
                  'role', uc.role,
                  'room_id', r.id
                )
              ) FILTER (WHERE u.id IS NOT NULL) as members,
              (SELECT COUNT(*) FROM tracks WHERE room_id = r.id AND processing_status = 'completed') as track_count
       FROM rooms r
       LEFT JOIN user_rooms ur ON r.id = ur.room_id
       LEFT JOIN users u ON ur.user_id = u.id
       LEFT JOIN user_camps uc ON u.id = uc.user_id AND uc.camp_id = $1
       WHERE r.camp_id = $1
       GROUP BY r.id
       ORDER BY r.created_at`,
      [campId]
    );

    // Get user limit information
    const userLimitInfo = await checkCampUserLimit(campId);

    // Convert track_count to number for each room
    const roomsWithTrackCount = roomsResult.rows.map(room => ({
      ...room,
      track_count: parseInt(room.track_count) || 0
    }));

    return {
      valid: true,
      camp: {
        ...camp,
        user_role: accessValidation.camp.user_role,
        members: membersResult.rows,
        rooms: roomsWithTrackCount,
        user_limit: {
          current_users: userLimitInfo.current_users,
          max_users: userLimitInfo.max_users,
          spots_remaining: userLimitInfo.max_users - userLimitInfo.current_users
        }
      }
    };
  } catch (error) {
    console.error('Error getting camp details:', error);
    return { valid: false, error: 'Failed to get camp details' };
  }
}

/**
 * Check if user is camp owner
 * @param {number} campId - Camp ID
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if user is owner
 */
async function checkCampOwner(campId, userId) {
  try {
    const result = await pool.query(
      'SELECT role FROM user_camps WHERE user_id = $1 AND camp_id = $2 AND role = $3',
      [userId, campId, 'owner']
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking camp owner:', error);
    return false;
  }
}

/**
 * Check if user is camp admin or owner (owner has all admin permissions)
 * @param {number} campId - Camp ID
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if user is admin or owner
 */
async function checkCampAdminOrOwner(campId, userId) {
  try {
    const result = await pool.query(
      'SELECT role FROM user_camps WHERE user_id = $1 AND camp_id = $2 AND role IN (\'admin\', \'owner\')',
      [userId, campId]
    );
    return result.rows.length > 0;
  } catch (error) {
    console.error('Error checking camp admin/owner:', error);
    return false;
  }
}

/**
 * Check if camp has reached its user limit based on product version
 * @param {number} campId - Camp ID to check
 * @returns {Object} Validation result with limit info
 */
async function checkCampUserLimit(campId) {
  try {
    // Get camp with current member count
    const campResult = await pool.query(
      `SELECT c.product_version,
              COUNT(uc.user_id) as current_users
       FROM camps c
       LEFT JOIN user_camps uc ON c.id = uc.camp_id
       WHERE c.id = $1
       GROUP BY c.id, c.product_version`,
      [campId]
    );

    if (campResult.rows.length === 0) {
      return { valid: false, error: 'Camp not found' };
    }

    const camp = campResult.rows[0];
    const currentUsers = parseInt(camp.current_users);

    // Define user limits by product version
    const userLimits = {
      '10_users': 10,
      '25_users': 25,
      '50_users': 50,
      '100_users': 100
    };

    const maxUsers = userLimits[camp.product_version];
    if (!maxUsers) {
      return { valid: false, error: 'Invalid product version' };
    }

    return {
      valid: currentUsers < maxUsers,
      current_users: currentUsers,
      max_users: maxUsers,
      product_version: camp.product_version,
      error: currentUsers >= maxUsers ? `Camp has reached its maximum capacity of ${maxUsers} users` : null
    };
  } catch (error) {
    console.error('Error checking camp user limit:', error);
    return { valid: false, error: 'Failed to check camp user limit' };
  }
}

export {
  validateCampAccess,
  validateRoomAccess,
  getCampDetails,
  checkCampUserLimit,
  checkCampOwner,
  checkCampAdminOrOwner
};
