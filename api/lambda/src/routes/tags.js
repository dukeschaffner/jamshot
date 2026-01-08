import express from 'express';
import { createRequire } from 'module';
import { betterAuthMiddleware as authMiddleware, optionalBetterAuthMiddleware as optionalAuthMiddleware } from '../middleware/betterAuthMiddleware.js';

const require = createRequire(import.meta.url);
const pool = require('../config/db.cjs');
const router = express.Router();

// Get all genres
router.get('/genres', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM genres ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching genres:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all instruments
router.get('/instruments', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM instruments ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching instruments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all elements
router.get('/elements', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM elements ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching elements:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// // Add a new genre (admin only)
// router.post('/genres', authMiddleware, async (req, res) => {
//   try {
//     // Check if user is admin (you'll need to add an admin field to users table)
//     const userCheck = await pool.query('SELECT verified FROM users WHERE id = $1', [req.user.id]);
//     if (!userCheck.rows[0].verified) {
//       return res.status(403).json({ error: 'Only verified artists can add genres' });
//     }

//     const { name } = req.body;
//     if (!name) {
//       return res.status(400).json({ error: 'Genre name is required' });
//     }

//     // Check if genre already exists
//     const existingGenre = await pool.query('SELECT * FROM genres WHERE name = $1', [name]);
//     if (existingGenre.rows.length > 0) {
//       return res.status(400).json({ error: 'Genre already exists' });
//     }

//     const result = await pool.query(
//       'INSERT INTO genres (name) VALUES ($1) RETURNING *',
//       [name]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error('Error adding genre:', error);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// // Add a new instrument (admin only)
// router.post('/instruments', authMiddleware, async (req, res) => {
//   try {
//     // Check if user is admin (you'll need to add an admin field to users table)
//     const userCheck = await pool.query('SELECT verified FROM users WHERE id = $1', [req.user.id]);
//     if (!userCheck.rows[0].verified) {
//       return res.status(403).json({ error: 'Only verified artists can add instruments' });
//     }

//     const { name } = req.body;
//     if (!name) {
//       return res.status(400).json({ error: 'Instrument name is required' });
//     }

//     // Check if instrument already exists
//     const existingInstrument = await pool.query('SELECT * FROM instruments WHERE name = $1', [name]);
//     if (existingInstrument.rows.length > 0) {
//       return res.status(400).json({ error: 'Instrument already exists' });
//     }

//     const result = await pool.query(
//       'INSERT INTO instruments (name) VALUES ($1) RETURNING *',
//       [name]
//     );

//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error('Error adding instrument:', error);
//     res.status(500).json({ error: 'Server error' });
//   }
// });

// Get genres for a track
router.get('/track/:trackId/genres', async (req, res) => {
  try {
    const { trackId } = req.params;
    const result = await pool.query(
      `SELECT g.* FROM genres g
       JOIN track_genres tg ON g.id = tg.genre_id
       WHERE tg.track_id = $1
       ORDER BY g.name`,
      [trackId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching track genres:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get instruments for a track
router.get('/track/:trackId/instruments', async (req, res) => {
  try {
    const { trackId } = req.params;
    const result = await pool.query(
      `SELECT i.* FROM instruments i
       JOIN track_instruments ti ON i.id = ti.instrument_id
       WHERE ti.track_id = $1
       ORDER BY i.name`,
      [trackId]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching track instruments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update track genres
router.post('/track/:trackId/genres', authMiddleware, async (req, res) => {
  try {
    const { trackId } = req.params;
    const { genreIds } = req.body;

    if (!Array.isArray(genreIds)) {
      return res.status(400).json({ error: 'genreIds must be an array' });
    }

    // Check if track belongs to user
    const trackCheck = await pool.query('SELECT user_id FROM tracks WHERE id = $1', [trackId]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    if (trackCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only update tags for your own tracks' });
    }

    // Start a transaction
    await pool.query('BEGIN');

    // Remove existing genres
    await pool.query('DELETE FROM track_genres WHERE track_id = $1', [trackId]);

    // Add new genres
    for (const genreId of genreIds) {
      await pool.query(
        'INSERT INTO track_genres (track_id, genre_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [trackId, genreId]
      );
    }

    await pool.query('COMMIT');
    res.status(200).json({ message: 'Track genres updated successfully' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error updating track genres:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update track instruments
router.post('/track/:trackId/instruments', authMiddleware, async (req, res) => {
  try {
    const { trackId } = req.params;
    const { instrumentIds } = req.body;

    if (!Array.isArray(instrumentIds)) {
      return res.status(400).json({ error: 'instrumentIds must be an array' });
    }

    // Check if track belongs to user
    const trackCheck = await pool.query('SELECT user_id FROM tracks WHERE id = $1', [trackId]);
    if (trackCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Track not found' });
    }
    if (trackCheck.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only update tags for your own tracks' });
    }

    // Start a transaction
    await pool.query('BEGIN');

    // Remove existing instruments
    await pool.query('DELETE FROM track_instruments WHERE track_id = $1', [trackId]);

    // Add new instruments
    for (const instrumentId of instrumentIds) {
      await pool.query(
        'INSERT INTO track_instruments (track_id, instrument_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [trackId, instrumentId]
      );
    }

    await pool.query('COMMIT');
    res.status(200).json({ message: 'Track instruments updated successfully' });
  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Error updating track instruments:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router; 