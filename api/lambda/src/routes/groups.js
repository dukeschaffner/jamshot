import express from 'express';

const router = express.Router();
import pool from '../config/db.js';
import { apiEndpointLimiter } from '../middleware/rateLimiting.js';
import { getGeolocationData } from '../utils/geolocation.js';

/**
 * Log a visit to a predefined group landing page
 * POST /api/groups/visit
 * 
 * This is a public endpoint - no auth required
 * Only logs if the group exists in the database
 */
router.post('/visit', apiEndpointLimiter, async (req, res) => {
  const { group_name, type } = req.body;

  // Validate required fields
  if (!group_name || !type) {
    return res.status(400).json({ error: 'group_name and type are required' });
  }

  // Validate type
  if (!['team', 'camp'].includes(type)) {
    return res.status(400).json({ error: 'type must be either "team" or "camp"' });
  }

  try {
    // Check if group exists in the database (case-insensitive comparison)
    const groupResult = await pool.query(
      'SELECT id, group_name, display_name FROM predefined_groups WHERE LOWER(group_name) = LOWER($1) AND type = $2',
      [group_name, type]
    );

    if (groupResult.rows.length === 0) {
      // Group doesn't exist - don't log, just return success
      // This is intentional: we don't want to reveal which groups are tracked
      return res.json({ logged: false });
    }

    const group = groupResult.rows[0];

    // Extract visit metadata from request
    const userAgent = req.headers['user-agent'] || null;
    const referrerUrl = req.headers['referer'] || req.headers['referrer'] || null;
    
    // Get IP address (respects proxy trust settings)
    const ipAddress = req.ip || req.connection?.remoteAddress || null;

    // Get geolocation data if IP is available
    let geoData = { country_code: null, region: null, city: null };
    if (ipAddress) {
      try {
        geoData = await getGeolocationData(ipAddress);
      } catch (geoError) {
        console.error('Error getting geolocation:', geoError);
        // Continue without geolocation data
      }
    }

    // Start a transaction to update visit count and log the visit
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update the predefined_groups table
      await client.query(
        `UPDATE predefined_groups 
         SET visits = visits + 1, 
             has_been_visited = TRUE 
         WHERE id = $1`,
        [group.id]
      );

      // Insert the visit record
      await client.query(
        `INSERT INTO group_visits 
         (group_id, user_agent, ip_address, referrer_url, country_code, region, city)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          group.id,
          userAgent,
          ipAddress,
          referrerUrl,
          geoData.country_code,
          geoData.region,
          geoData.city
        ]
      );

      await client.query('COMMIT');

      res.json({ 
        logged: true,
        group_name: group.group_name,
        display_name: group.display_name
      });
    } catch (txError) {
      await client.query('ROLLBACK');
      throw txError;
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('Error logging group visit:', error);
    res.status(500).json({ error: 'Failed to log visit' });
  }
});

export default router;

