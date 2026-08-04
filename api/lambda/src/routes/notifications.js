import express from 'express';
import { betterAuthMiddleware } from '../middleware/betterAuthMiddleware.js';

import pool from '../config/db.js';

const router = express.Router();

// Apply Better Auth middleware to all notification routes
router.use(betterAuthMiddleware);

// Get user's notifications
router.get('/', async (req, res, next) => {
  const userId = req.user.id;
  
  // Add pagination parameters
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50); // Max 50 items per page
  const offset = (page - 1) * limit;
  
  try {
    // Get total count for pagination metadata
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1',
      [userId]
    );
    const totalCount = parseInt(countResult.rows[0].count, 10);
    const totalPages = Math.ceil(totalCount / limit);
    
    // Get paginated notifications
    const result = await pool.query(`
      SELECT
        n.id,
        n.type,
        n.is_read,
        n.created_at,
        n.related_track_id,
        n.related_user_id,
        n.competition_id,
        n.project_invite_id,
        CASE 
          WHEN n.type IN ('follow_request', 'project_invite') THEN NULL
          ELSE t.title 
        END AS track_title,
        CASE 
          WHEN n.type IN ('follow_request', 'project_invite') THEN NULL
          ELSE t.guid 
        END AS track_guid,
        CASE 
          WHEN n.type IN ('follow_request', 'project_invite') THEN u_related.username
          ELSE u_actor.username
        END AS actor_username,
        CASE 
          WHEN n.type IN ('follow_request', 'project_invite') THEN u_related.name
          ELSE u_actor.name
        END AS actor_name,
        CASE 
          WHEN n.type IN ('follow_request', 'project_invite') THEN u_related.verified
          ELSE u_actor.verified
        END AS actor_verified,
        CASE
          WHEN n.type = 'follow_request' THEN (
            SELECT id FROM follow_requests 
            WHERE requester_id = n.related_user_id AND target_id = n.user_id
            LIMIT 1
          )
          ELSE NULL
        END AS follow_request_id,
        pi.token AS project_invite_token,
        pi.role AS project_invite_role,
        p.guid AS project_guid,
        p.name AS project_name
      FROM notifications n
      LEFT JOIN tracks t ON n.related_track_id = t.id
      LEFT JOIN users u_related ON n.related_user_id = u_related.id
      LEFT JOIN users u_actor ON n.type NOT IN ('follow_request', 'project_invite') AND u_actor.id = n.related_user_id
      LEFT JOIN project_invites pi ON n.project_invite_id = pi.id
      LEFT JOIN projects p ON pi.project_id = p.id
      WHERE n.user_id = $1
      ORDER BY n.created_at DESC
      LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);
    
    // Return paginated response format
    res.json({
      notifications: result.rows,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1
      }
    });
  } catch (err) {
    next(err);
  }
});

// Get unread notification count
router.get('/count', async (req, res, next) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );
    
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    next(err);
  }
});

// Mark notification as read
router.put('/:id/read', async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const result = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Mark all notifications as read
router.put('/read-all', async (req, res, next) => {
  const userId = req.user.id;
  
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [userId]
    );
    
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
});

// Delete a notification
router.delete('/:id', async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  try {
    const result = await pool.query(
      'DELETE FROM notifications WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// Get user's notification preferences
router.get('/preferences', async (req, res, next) => {
  const userId = req.user.id;
  
  try {
    const result = await pool.query(
      'SELECT activity_summary_frequency, collab_email_enabled FROM notification_preferences WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      // Create default preferences if they don't exist
      const defaultResult = await pool.query(
        'INSERT INTO notification_preferences (user_id, activity_summary_frequency, collab_email_enabled) VALUES ($1, $2, $3) RETURNING activity_summary_frequency, collab_email_enabled',
        [userId, 'weekly', true]
      );
      return res.json(defaultResult.rows[0]);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// Update user's notification preferences
router.put('/preferences', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { activity_summary_frequency, collab_email_enabled } = req.body;
    
    // Validate activity_summary_frequency
    const validFrequencies = ['daily', 'weekly', 'monthly', 'none'];
    if (activity_summary_frequency && !validFrequencies.includes(activity_summary_frequency)) {
      return res.status(400).json({ 
        error: 'Invalid activity_summary_frequency. Must be one of: daily, weekly, monthly, none' 
      });
    }
    
    // Validate collab_email_enabled
    if (collab_email_enabled !== undefined && typeof collab_email_enabled !== 'boolean') {
      return res.status(400).json({ 
        error: 'collab_email_enabled must be a boolean' 
      });
    }
  
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (activity_summary_frequency !== undefined) {
      updates.push(`activity_summary_frequency = $${paramCount}`);
      values.push(activity_summary_frequency);
      paramCount++;
    }
    
    if (collab_email_enabled !== undefined) {
      updates.push(`collab_email_enabled = $${paramCount}`);
      values.push(collab_email_enabled);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    values.push(userId);
    const query = `
      UPDATE notification_preferences 
      SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $${paramCount}
      RETURNING activity_summary_frequency, collab_email_enabled
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      // Create preferences if they don't exist
      const insertResult = await pool.query(
        'INSERT INTO notification_preferences (user_id, activity_summary_frequency, collab_email_enabled) VALUES ($1, $2, $3) RETURNING activity_summary_frequency, collab_email_enabled',
        [userId, activity_summary_frequency || 'weekly', collab_email_enabled !== undefined ? collab_email_enabled : true]
      );
      return res.json(insertResult.rows[0]);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

export default router; 