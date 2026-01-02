const express = require('express');
const pool = require('../config/db');
const rateLimit = require('express-rate-limit');
const { getGeolocationData } = require('../utils/geolocation');

const router = express.Router();

// Rate limiting for landing page endpoints
const landingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Add email to waitlist
router.post('/waitlist', landingLimiter, async (req, res) => {
  try {
    let { email } = req.body;

    // Validate email is provided
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Normalize email (trim and lowercase)
    email = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    // Get geolocation data if IP is available
    let location = { country_code: null, region: null, city: null };
    if (ip) {
      try {
        location = await getGeolocationData(ip);
      } catch (geoError) {
        console.error('Error getting geolocation:', geoError);
        // Continue without geolocation data
      }
    }

    // Check if email already exists
    const existingEmail = await pool.query(
      'SELECT id FROM waitlist WHERE email = $1',
      [email]
    );

    if (existingEmail.rows.length > 0) {
      return res.status(409).json({ error: 'Email already on waitlist' });
    }

    // Insert into waitlist
    await pool.query(
      `INSERT INTO waitlist (email, ip_address, country_code, region, city, user_agent) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [email, ip, location.country_code, location.region, location.city, userAgent]
    );

    res.json({ success: true, message: 'Added to waitlist successfully' });
  } catch (error) {
    console.error('Error adding to waitlist:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify access code
router.post('/access-code/verify', landingLimiter, async (req, res) => {
  try {
    let { code } = req.body;

    // Validate code is provided
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Access code is required' });
    }

    // Trim and validate length
    code = code.trim();
    if (code.length === 0 || code.length > 50) {
      return res.status(400).json({ error: 'Invalid access code format' });
    }
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    
    // Get geolocation data if IP is available
    let location = { country_code: null, region: null, city: null };
    if (ip) {
      try {
        location = await getGeolocationData(ip);
      } catch (geoError) {
        console.error('Error getting geolocation:', geoError);
        // Continue without geolocation data
      }
    }

    // Check if code exists and is valid
    const codeResult = await pool.query(
      `SELECT id, max_uses, current_uses, is_active, expires_at 
       FROM access_codes 
       WHERE code = $1`,
      [code.toUpperCase()]
    );

    if (codeResult.rows.length === 0) {
      return res.status(400).json({ valid: false, error: 'Invalid access code' });
    }

    const accessCode = codeResult.rows[0];

    // Check if code is active
    if (!accessCode.is_active) {
      return res.status(400).json({ valid: false, error: 'Access code is no longer active' });
    }

    // Check if code has expired
    if (accessCode.expires_at && new Date() > new Date(accessCode.expires_at)) {
      return res.status(400).json({ valid: false, error: 'Access code has expired' });
    }

    // Check if code has reached max uses
    if (accessCode.current_uses >= accessCode.max_uses) {
      return res.status(400).json({ valid: false, error: 'Access code has reached maximum uses' });
    }

    // Check if this IP has already used this code
    const existingUsage = await pool.query(
      'SELECT id FROM access_code_usage WHERE code_id = $1 AND ip_address = $2',
      [accessCode.id, ip]
    );

    if (existingUsage.rows.length > 0) {
      // IP has already used this code, but still grant access
      return res.json({ valid: true, message: 'Access granted' });
    }

    // Record the usage
    await pool.query(
      `INSERT INTO access_code_usage (code_id, ip_address, country_code, region, city, user_agent) 
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [accessCode.id, ip, location.country_code, location.region, location.city, userAgent]
    );

    // Update current_uses count
    await pool.query(
      'UPDATE access_codes SET current_uses = current_uses + 1 WHERE id = $1',
      [accessCode.id]
    );

    res.json({ valid: true, message: 'Access granted' });
  } catch (error) {
    console.error('Error verifying access code:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Check if user has valid access (for session persistence)
router.get('/access-code/check', (req, res) => {
  // This endpoint can be used to check server-side session if needed
  // For now, we're using client-side sessionStorage
  res.json({ hasAccess: false });
});

module.exports = router;

