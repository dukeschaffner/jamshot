import pool from '../config/db.js';
import { betterAuthMiddleware } from './betterAuthMiddleware.js';

/**
 * Admin middleware - Requires authentication AND admin privileges
 * Ensures user is authenticated and has admin privileges (is_admin = true)
 */
export const adminMiddleware = async (req, res, next) => {
  // First check if user is authenticated
  await betterAuthMiddleware(req, res, async () => {
    // If authentication passed, check admin status
    try {
      const adminCheck = await pool.query(
        'SELECT is_admin FROM users WHERE id = $1',
        [req.user.id]
      );

      if (adminCheck.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (!adminCheck.rows[0].is_admin) {
        return res.status(403).json({
          error: 'Admin privileges required',
          code: 'ADMIN_REQUIRED'
        });
      }

      // User is authenticated and has admin privileges, continue
      next();
    } catch (error) {
      console.error('Admin middleware error:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
};