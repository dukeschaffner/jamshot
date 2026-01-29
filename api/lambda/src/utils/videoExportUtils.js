import pool from '../config/db.js';

/**
 * Check if user has reached their daily video export limit
 * @param {string} userId - User ID (required)
 * @returns {Promise<{allowed: boolean, count: number, limit: number}|null>} Returns limit info or null if error
 */
export async function checkVideoExportLimit(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const exportCountResult = await pool.query(
      'SELECT COUNT(*) FROM video_exports WHERE user_id = $1 AND created_at >= $2',
      [userId, today]
    );

    const dailyExportCount = parseInt(exportCountResult.rows[0].count);
    const DAILY_LIMIT = 5;

    return {
      allowed: dailyExportCount < DAILY_LIMIT,
      count: dailyExportCount,
      limit: DAILY_LIMIT
    };
  } catch (err) {
    console.error('Error checking video export limit:', err);
    return null; // Return null on error to allow graceful handling
  }
}

