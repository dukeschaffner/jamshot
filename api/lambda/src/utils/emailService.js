import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendContactEmail,
  sendWaitlistConfirmationEmail,
  sendCollaborationEmail
} from '@sterio/email';

/**
 * Send a verification email to a newly registered user
 * @param {string} email - User's email address
 * @param {string} userId - User's ID in the database
 * @param {string} username - User's username
 * @param {string} [verificationUrl] - Optional verification URL (if not provided, will generate one)
 * @returns {Promise} - Resolves when email is sent
 */
const sendVerificationEmailWrapper = async (email, userId, username, verificationUrl = null) => {
  // Use provided URL or create a verification token valid for 24 hours
  let url = verificationUrl;
  if (!url) {
    const verificationToken = jwt.sign(
      { id: userId, action: 'verify_email' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    // Create the verification URL
    url = `${process.env.API_URL || 'http://localhost:5001/api'}/auth/verify-email/${verificationToken}`;
  }

  return await sendVerificationEmail(email, userId, username, url);
};

/**
 * Send a password reset email
 * @param {string} email - User's email address
 * @param {string} userId - User's ID in the database
 * @param {string} username - User's username
 * @param {string} [resetUrl] - Optional reset URL (if not provided, will generate one)
 * @returns {Promise} - Resolves when email is sent
 */
const sendPasswordResetEmailWrapper = async (email, userId, username, resetUrl = null) => {
  // Use provided URL or create a reset token valid for 1 hour
  let url = resetUrl;
  if (!url) {
    const resetToken = jwt.sign(
      { id: userId, action: 'reset_password' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    // Create the reset URL (frontend page)
    url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${resetToken}`;
  }

  return await sendPasswordResetEmail(email, userId, username, url);
};

/**
 * Send a contact form email
 * @param {Object} param0
 * @param {string} param0.name - Sender's name
 * @param {string} param0.email - Sender's email
 * @param {string} param0.message - Message content
 * @returns {Promise} - Resolves when email is sent
 */
const sendContactEmailWrapper = async ({ name, email, message }) => {
  return await sendContactEmail({ name, email, message });
};

/**
 * Send waitlist confirmation email with referral link
 * @param {string} email - User's email address
 * @param {string} referralCode - Unique referral code for this waitlist entry
 * @returns {Promise} - Resolves when email is sent
 */
const sendWaitlistConfirmationEmailWrapper = async (email, referralCode) => {
  return await sendWaitlistConfirmationEmail(email, referralCode);
};

/**
 * Send a collaboration notification email
 * @param {number} userId - ID of the user who created the collaboration
 * @param {number} collabTrackId - ID of the collaboration track
 * @param {number} parentTrackId - ID of the parent track
 * @returns {Promise} - Resolves when email is sent
 */
const sendCollabEmailWrapper = async (userId, collabTrackId, parentTrackId) => {
  try {
    // Get parent track owner details and preferences
    const parentTrackQuery = `
      SELECT
        t.title,
        t.guid,
        u.email,
        u.name,
        u.email_verified,
        np.collab_email_enabled
      FROM tracks t
      JOIN users u ON t.user_id = u.id
      LEFT JOIN notification_preferences np ON u.id = np.user_id
      WHERE t.id = $1
    `;
    const parentTrackResult = await pool.query(parentTrackQuery, [parentTrackId]);

    if (parentTrackResult.rows.length === 0) {
      console.log('Parent track not found for collab email');
      return;
    }

    const parentTrack = parentTrackResult.rows[0];

    // Check if email should be sent
    if (!parentTrack.email_verified) {
      console.log('Parent track owner email not verified, skipping collab email');
      return;
    }

    if (!parentTrack.collab_email_enabled) {
      console.log('Parent track owner has collab emails disabled, skipping');
      return;
    }

    // Get collaborator details
    const collaboratorQuery = `
      SELECT name, username
      FROM users
      WHERE id = $1
    `;
    const collaboratorResult = await pool.query(collaboratorQuery, [userId]);

    if (collaboratorResult.rows.length === 0) {
      console.log('Collaborator not found for collab email');
      return;
    }

    const collaborator = collaboratorResult.rows[0];

    // Generate URLs
    const trackUrl = `${process.env.FRONTEND_URL || 'https://sterio.fm'}/track/${parentTrack.guid}`;
    const settingsUrl = `${process.env.FRONTEND_URL || 'https://sterio.fm'}/user/edit?tab=notifications`;

    // Use the shared email service
    await sendCollaborationEmail(
      parentTrack.email,
      collaborator.name || collaborator.username,
      parentTrack.title,
      trackUrl,
      settingsUrl
    );

  } catch (error) {
    console.error('Error sending collab email:', error);
    // Don't throw error to prevent blocking notification creation
  }
};

export {
  sendVerificationEmailWrapper as sendVerificationEmail,
  sendPasswordResetEmailWrapper as sendPasswordResetEmail,
  sendContactEmailWrapper as sendContactEmail,
  sendWaitlistConfirmationEmailWrapper as sendWaitlistConfirmationEmail,
  sendCollabEmailWrapper as sendCollabEmail
}; 