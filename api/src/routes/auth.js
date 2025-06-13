const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');
const { authMiddleware } = require('../middleware/auth');
require('dotenv').config();

const router = express.Router();

// Helper function to generate refresh token
const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

// Helper function to save refresh token to database
const saveRefreshToken = async (userId, token, deviceInfo = null) => {
  // Set expiration to 30 days from now
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  
  const result = await pool.query(
    'INSERT INTO refresh_tokens (user_id, token, expires_at, device_info) VALUES ($1, $2, $3, $4) RETURNING id',
    [userId, token, expiresAt, deviceInfo]
  );
  
  return result.rows[0].id;
};

// Helper function to generate tokens
const generateTokens = async (userId, deviceInfo = null) => {
  // Generate access token (short-lived, 1 hour)
  const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
  
  // Generate refresh token (long-lived, 30 days)
  const refreshToken = generateRefreshToken();
  
  // Save refresh token to database
  await saveRefreshToken(userId, refreshToken, deviceInfo);
  
  return { accessToken, refreshToken };
};

// Password validation function
const validatePassword = (password) => {
  // Password must be at least 8 characters long
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  
  // Password must contain at least one uppercase letter
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  
  // Password must contain at least one lowercase letter
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  
  // Password must contain at least one number
  if (!/\d/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  
  // Password must contain at least one special character
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character' };
  }
  
  return { valid: true };
};

// Register
router.post('/register', async (req, res) => {
  const { username, name, email, password } = req.body;
  const deviceInfo = req.headers['user-agent'] || null;
  
  // Username validation: only allow letters, numbers, and underscores
  if (!/^\w+$/.test(username)) {
    return res.status(400).json({ error: 'Username can only contain letters, numbers, and underscores.' });
  }
  
  try {
    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }
    
    // Validate name is provided
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    // Check if email already exists
    const emailCheck = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already registered' });
    }
    
    // Check if username already exists
    const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username is already taken' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.query(
      'INSERT INTO users (username, name, email, password_hash) VALUES ($1, $2, $3, $4) RETURNING id, username, email',
      [username, name, email, hashedPassword]
    );
    
    const user = result.rows[0];
    
    // Send verification email
    try {
      await sendVerificationEmail(user.email, user.id, user.username);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr);
      // Continue with registration even if email fails
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(user.id, deviceInfo);
    
    res.status(201).json({ 
      accessToken,
      refreshToken,
      message: 'Registration successful. Please check your email to verify your account.'
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const deviceInfo = req.headers['user-agent'] || null;
  
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Check if email is verified
    if (!user.email_verified) {
      return res.status(403).json({ 
        error: 'Email not verified',
        message: 'Please verify your email before logging in.'
      });
    }
    
    // Generate tokens
    const { accessToken, refreshToken } = await generateTokens(user.id, deviceInfo);
    
    res.json({ 
      accessToken,
      refreshToken
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Refresh token endpoint
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }
  
  try {
    // Find the refresh token in the database
    const tokenResult = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token = $1 AND revoked = false AND expires_at > NOW()',
      [refreshToken]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }
    
    const tokenData = tokenResult.rows[0];
    const userId = tokenData.user_id;
    
    // Generate a new access token
    const accessToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
    
    // Optionally, you can implement a rotation strategy for refresh tokens
    // This would involve revoking the old token and issuing a new one
    // For simplicity, we'll just return a new access token
    
    res.json({ accessToken });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout endpoint
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }
  
  try {
    // Revoke the refresh token
    await pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE token = $1',
      [refreshToken]
    );
    
    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Verify email
router.get('/verify-email/:token', async (req, res) => {
  const { token } = req.params;
  
  try {
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if this is a verification token
    if (decoded.action !== 'verify_email') {
      return res.status(400).json({ error: 'Invalid verification token' });
    }
    
    // Update user's email_verified status
    await pool.query(
      'UPDATE users SET email_verified = true WHERE id = $1',
      [decoded.id]
    );
    
    // Redirect to frontend with success message
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/login?verified=true`);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Verification link has expired' });
    }
    res.status(400).json({ error: 'Invalid verification token' });
  }
});

// Resend verification email
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  
  try {
    // Find user by email
    const result = await pool.query(
      'SELECT id, username, email, email_verified FROM users WHERE email = $1',
      [email]
    );
    
    const user = result.rows[0];
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    if (user.email_verified) {
      return res.status(400).json({ error: 'Email is already verified' });
    }
    
    // Send verification email
    await sendVerificationEmail(user.email, user.id, user.username);
    
    res.json({ message: 'Verification email sent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  
  try {
    // Find user by email
    const result = await pool.query(
      'SELECT id, username, email FROM users WHERE email = $1',
      [email]
    );
    
    const user = result.rows[0];
    
    if (!user) {
      // Don't reveal that the email doesn't exist for security reasons
      return res.json({ message: 'If your email is registered, you will receive a password reset link' });
    }
    
    // Send password reset email
    await sendPasswordResetEmail(user.email, user.id, user.username);
    
    res.json({ message: 'Password reset email sent successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;
  
  try {
    // Validate password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({ error: passwordValidation.message });
    }
    
    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if this is a password reset token
    if (decoded.action !== 'reset_password') {
      return res.status(400).json({ error: 'Invalid reset token' });
    }
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update user's password
    await pool.query(
      'UPDATE users SET password_hash = $1 WHERE id = $2',
      [hashedPassword, decoded.id]
    );
    
    // Revoke all refresh tokens for this user (force re-login after password reset)
    await pool.query(
      'UPDATE refresh_tokens SET revoked = true WHERE user_id = $1',
      [decoded.id]
    );
    
    res.json({ message: 'Password reset successful' });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Password reset link has expired' });
    }
    res.status(400).json({ error: 'Invalid reset token' });
  }
});

module.exports = router;