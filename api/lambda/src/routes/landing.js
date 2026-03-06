import express from 'express';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
const router = express.Router();
import pool from '../config/db.js';
import { getGeolocationData } from '../utils/geolocation.js';
import { sendWaitlistConfirmationEmail } from '../utils/emailService.js';

// Rate limiting for landing page endpoints
const landingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: { error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Helper function to generate a random IP address for development testing
const generateRandomIP = () => {
  // Generate a random IP in the range 192.168.0.0 to 192.168.255.255
  // This is a private IP range, safe for testing
  const octet3 = Math.floor(Math.random() * 256);
  const octet4 = Math.floor(Math.random() * 256);
  return `192.168.${octet3}.${octet4}`;
};

// Helper function to check if email contains any numbers
const emailContainsNumbers = (email) => {
  return /\d/.test(email);
};

// Helper function to generate a unique alphanumeric referral code
const generateReferralCode = async () => {
  let code;
  let isUnique = false;
  let attempts = 0;
  const maxAttempts = 10;
  const codeLength = 10;
  
  // Characters to use: uppercase letters and numbers (excluding ambiguous characters like 0, O, I, 1)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  while (!isUnique && attempts < maxAttempts) {
    // Generate an alphanumeric code
    code = '';
    for (let i = 0; i < codeLength; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    // Check if code already exists
    const existing = await pool.query(
      'SELECT id FROM waitlist WHERE referral_code = $1',
      [code]
    );
    
    if (existing.rows.length === 0) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique referral code');
  }

  return code;
};

// Add email to waitlist
router.post('/waitlist', landingLimiter, async (req, res, next) => {
  try {
    let { email, referralCode } = req.body;

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
    
    // In development: if email contains numbers, assign random IP for testing referrals
    let ip = req.ip || req.connection.remoteAddress;
    const isDevelopment = process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'development';
    if (isDevelopment && emailContainsNumbers(email)) {
      ip = generateRandomIP();
      console.log(`[DEV] Generated random IP ${ip} for email ${email} (contains numbers)`);
    }
    
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

    // Generate unique referral code for this user
    const newReferralCode = await generateReferralCode();

    // Start transaction for referral tracking
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Insert into waitlist
      const insertResult = await client.query(
        `INSERT INTO waitlist (email, ip_address, country_code, region, city, user_agent, referral_code) 
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [email, ip, location.country_code, location.region, location.city, userAgent, newReferralCode]
      );

      const waitlistId = insertResult.rows[0].id;

      // Track if self-referral was attempted
      let selfReferralWarning = null;

      // Handle referral tracking if referral code is provided
      if (referralCode && typeof referralCode === 'string') {
        referralCode = referralCode.trim();
        
        // Find the referrer by referral code
        const referrerResult = await client.query(
          'SELECT id, email, ip_address FROM waitlist WHERE referral_code = $1',
          [referralCode]
        );

        if (referrerResult.rows.length > 0) {
          const referrer = referrerResult.rows[0];
          
          // Prevent self-referrals: check email and IP
          const isSelfReferral = 
            referrer.email.toLowerCase() === email.toLowerCase() ||
            (referrer.ip_address && ip && referrer.ip_address === ip);

          if (isSelfReferral) {
            // Set warning message for self-referral attempt
            selfReferralWarning = 'You cannot refer yourself. Your signup was successful, but the referral was not counted.';
          } else {
            // Record the referral
            try {
              await client.query(
                `INSERT INTO referrals (referrer_waitlist_id, referred_waitlist_id) 
                 VALUES ($1, $2)`,
                [referrer.id, waitlistId]
              );
            } catch (refError) {
              // Ignore duplicate referral errors (unique constraint)
              if (refError.code !== '23505') {
                throw refError;
              }
            }
          }
        }
      }

      await client.query('COMMIT');

      // Send confirmation email (await to keep Lambda execution context alive)
      try {
        await sendWaitlistConfirmationEmail(email, newReferralCode);
      } catch (emailErr) {
        console.error('Error sending waitlist confirmation email:', emailErr);
        // Don't fail the request if email fails
      }

      const response = { success: true, message: 'Added to waitlist successfully' };
      if (selfReferralWarning) {
        response.warning = selfReferralWarning;
      }
      res.json(response);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    next(error);
  }
});

// Verify access code
router.post('/access-code/verify', landingLimiter, async (req, res, next) => {
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
    next(error);
  }
});

// Check if user has valid access (for session persistence)
router.get('/access-code/check', (req, res) => {
  // This endpoint can be used to check server-side session if needed
  // For now, we're using client-side sessionStorage
  res.json({ hasAccess: false });
});

// Confirm waitlist email
router.get('/confirm-waitlist/:token', async (req, res, next) => {
  const { token } = req.params;
  
  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if this is a waitlist confirmation token
    if (decoded.action !== 'confirm_waitlist') {
      console.error('Invalid token action:', decoded.action);
      return res.status(400).json({ error: 'Invalid confirmation token' });
    }
    
    // Normalize email (lowercase) to match how it's stored
    const email = decoded.email ? decoded.email.toLowerCase().trim() : null;
    if (!email) {
      console.error('No email in token');
      return res.status(400).json({ error: 'Invalid confirmation token' });
    }
    
    // Update waitlist entry's confirmed status (case-insensitive match)
    const result = await pool.query(
      'UPDATE waitlist SET confirmed = true WHERE LOWER(email) = LOWER($1) RETURNING id, email',
      [email]
    );
    
    if (result.rows.length === 0) {
      console.error('Waitlist entry not found for email:', email);
      return res.status(404).json({ error: 'Waitlist entry not found' });
    }
    
    console.log('Waitlist confirmed for email:', result.rows[0].email);
    
    // Redirect to frontend with success message
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}?waitlist-confirmed=true`);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      console.error('Token expired for confirmation');
      return res.status(400).json({ error: 'Confirmation link has expired' });
    }
    console.error('Error confirming waitlist:', err);
    res.status(400).json({ error: 'Invalid confirmation token' });
  }
});

export default router;

