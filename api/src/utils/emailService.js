const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// Create a transporter using Gmail credentials
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Send a verification email to a newly registered user
 * @param {string} email - User's email address
 * @param {number} userId - User's ID in the database
 * @param {string} username - User's username
 * @returns {Promise} - Resolves when email is sent
 */
const sendVerificationEmail = async (email, userId, username) => {
  // Create a verification token valid for 24 hours
  const verificationToken = jwt.sign(
    { id: userId, action: 'verify_email' },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  // Create the verification URL
  const verificationUrl = `${process.env.API_URL || 'http://localhost:5001/api'}/auth/verify-email/${verificationToken}`;

  // Email content
  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: 'Verify your Sterio account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Sterio, ${username}!</h2>
        <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Verify Email</a>
        </div>
        <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
        <p>This link will expire in 24 hours.</p>
        <p>If you didn't create an account on Sterio, you can safely ignore this email.</p>
      </div>
    `
  };

  // Send the email
  return transporter.sendMail(mailOptions);
};

/**
 * Send a password reset email
 * @param {string} email - User's email address
 * @param {number} userId - User's ID in the database
 * @returns {Promise} - Resolves when email is sent
 */
const sendPasswordResetEmail = async (email, userId, username) => {
  // Create a reset token valid for 1 hour
  const resetToken = jwt.sign(
    { id: userId, action: 'reset_password' },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

  // Create the reset URL (frontend page)
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;

  // Email content
  const mailOptions = {
    from: process.env.EMAIL,
    to: email,
    subject: 'Reset your Sterio password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${username},</p>
        <p>We received a request to reset your password. Click the button below to create a new password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Reset Password</a>
        </div>
        <p>If the button doesn't work, you can also copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p>This link will expire in 1 hour.</p>
        <p>If you didn't request a password reset, you can safely ignore this email.</p>
      </div>
    `
  };

  // Send the email
  return transporter.sendMail(mailOptions);
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail
}; 