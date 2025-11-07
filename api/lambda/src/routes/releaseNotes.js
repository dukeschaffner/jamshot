const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { optionalAuthMiddleware } = require('../middleware/auth');
const { apiEndpointLimiter } = require('../middleware/rateLimiting');

// Apply optional auth middleware to all routes
router.use(optionalAuthMiddleware);

// GET /release-notes - Get paginated list of release notes
router.get('/', apiEndpointLimiter, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Get total count
    const countResult = await pool.query('SELECT COUNT(*) FROM release_notes');
    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    // Get paginated release notes
    const result = await pool.query(
      `SELECT id, version, title, content, show_toast_message, created_at, published_at
       FROM release_notes
       ORDER BY published_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      releaseNotes: result.rows,
      pagination: {
        page,
        limit,
        total,
        pages: totalPages,
        hasMore: page < totalPages
      }
    });
  } catch (err) {
    console.error('Error fetching release notes:', err);
    res.status(500).json({ error: 'Failed to fetch release notes' });
  }
});

// GET /release-notes/latest - Get latest release note with show_toast_message = true
router.get('/latest', apiEndpointLimiter, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, version, title, content, show_toast_message, created_at, published_at
       FROM release_notes
       WHERE show_toast_message = true
       ORDER BY published_at DESC
       LIMIT 1`
    );

    if (result.rows.length === 0) {
      return res.json(null);
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching latest release note:', err);
    res.status(500).json({ error: 'Failed to fetch latest release note' });
  }
});

module.exports = router;

