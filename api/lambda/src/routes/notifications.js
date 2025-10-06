const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// Apply auth middleware to all notification routes
router.use(authMiddleware);

// Get user's notifications
router.get('/', async (req, res) => {
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
        CASE 
          WHEN n.type = 'follow_request' THEN NULL
          ELSE t.title 
        END AS track_title,
        CASE 
          WHEN n.type = 'follow_request' THEN u_related.username
          ELSE u_actor.username
        END AS actor_username,
        CASE 
          WHEN n.type = 'follow_request' THEN u_related.name
          ELSE u_actor.name
        END AS actor_name,
        CASE 
          WHEN n.type = 'follow_request' THEN u_related.verified
          ELSE u_actor.verified
        END AS actor_verified,
        CASE
          WHEN n.type = 'follow_request' THEN (
            SELECT id FROM follow_requests 
            WHERE requester_id = n.related_user_id AND target_id = n.user_id
            LIMIT 1
          )
          ELSE NULL
        END AS follow_request_id
      FROM notifications n
      LEFT JOIN tracks t ON n.related_track_id = t.id
      LEFT JOIN users u_related ON n.related_user_id = u_related.id
      LEFT JOIN users u_actor ON (
        CASE 
          WHEN n.type = 'like' THEN (
            SELECT user_id FROM likes
            WHERE track_id = n.related_track_id
            ORDER BY created_at DESC
            LIMIT 1
          )
          WHEN n.type = 'comment' THEN (
            SELECT user_id FROM comments
            WHERE track_id = n.related_track_id
            ORDER BY created_at DESC
            LIMIT 1
          )
          WHEN n.type = 'repost' THEN (
            SELECT user_id FROM reposts
            WHERE track_id = n.related_track_id
            ORDER BY created_at DESC
            LIMIT 1
          )
          WHEN n.type = 'new_version' THEN (
            SELECT user_id FROM tracks 
            WHERE parent_track_id = n.related_track_id
            ORDER BY created_at DESC
            LIMIT 1
          )
          ELSE NULL
        END
      ) = u_actor.id
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
    console.error('Error fetching notifications:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get unread notification count
router.get('/count', async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [userId]
    );
    
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) {
    console.error('Error fetching notification count:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark notification as read
router.put('/:id/read', async (req, res) => {
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
    console.error('Error marking notification as read:', err);
    res.status(500).json({ error: err.message });
  }
});

// Mark all notifications as read
router.put('/read-all', async (req, res) => {
  const userId = req.user.id;
  
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [userId]
    );
    
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete a notification
router.delete('/:id', async (req, res) => {
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
    console.error('Error deleting notification:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router; 