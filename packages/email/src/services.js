import jwt from 'jsonwebtoken';
import { sendEmail } from './transport.js';
import {
  generateActivitySummaryTemplate,
  generateCollabEmailTemplate,
  generateVerificationEmailTemplate,
  generatePasswordResetEmailTemplate,
  generateContactEmailTemplate,
  generateWaitlistConfirmationEmailTemplate,
  generateCompetitionWinnerTemplate,
  generateCompetitionHostTemplate,
  generateCompetitionNoEntriesTemplate,
  generateCompetitionNoBackupWinnerTemplate
} from './templates.js';

/**
 * Send an activity summary email
 * @param {string} userEmail - User's email address
 * @param {string} userName - User's name/username
 * @param {string} periodType - Type of period (daily, weekly, monthly)
 * @param {Object} analyticsData - Analytics data from user_analytics_aggregates
 * @param {string} settingsUrl - URL to manage notification settings
 * @returns {Promise} - Resolves when email is sent
 */
export const sendActivitySummaryEmail = async (userEmail, userName, periodType, analyticsData, settingsUrl) => {
  // Generate email template
  const htmlContent = generateActivitySummaryTemplate(userName, periodType, analyticsData, settingsUrl);

  // Skip if no activity (template returns null)
  if (!htmlContent) {
    console.log(`No activity for user, skipping summary email`);
    return null;
  }

  // Email options
  const mailOptions = {
    to: userEmail,
    subject: `Your ${periodType} activity summary - Sterio`,
    html: htmlContent
  };

  // Send the email
  return await sendEmail(mailOptions);
};

/**
 * Send a verification email to a newly registered user
 * @param {string} email - User's email address
 * @param {string} userId - User's ID in the database
 * @param {string} username - User's username
 * @param {string} [verificationUrl] - Optional verification URL (if not provided, will generate one)
 * @returns {Promise} - Resolves when email is sent
 */
export const sendVerificationEmail = async (email, userId, username, verificationUrl = null) => {
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

  // Generate email template
  const htmlContent = generateVerificationEmailTemplate(username, url);

  // Email options
  const mailOptions = {
    to: email,
    subject: 'Verify your sterio account',
    html: htmlContent
  };

  // Send the email
  return await sendEmail(mailOptions);
};

/**
 * Send a password reset email
 * @param {string} email - User's email address
 * @param {string} userId - User's ID in the database
 * @param {string} username - User's username
 * @param {string} [resetUrl] - Optional reset URL (if not provided, will generate one)
 * @returns {Promise} - Resolves when email is sent
 */
export const sendPasswordResetEmail = async (email, userId, username, resetUrl = null) => {
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

  // Generate email template
  const htmlContent = generatePasswordResetEmailTemplate(username, url);

  // Email options
  const mailOptions = {
    to: email,
    subject: 'Reset your sterio password',
    html: htmlContent
  };

  // Send the email
  return await sendEmail(mailOptions);
};

/**
 * Send a contact form email
 * @param {Object} param0
 * @param {string} param0.name - Sender's name
 * @param {string} param0.email - Sender's email
 * @param {string} param0.message - Message content
 * @returns {Promise} - Resolves when email is sent
 */
export const sendContactEmail = async ({ name, email, message }) => {
  // Generate email template
  const htmlContent = generateContactEmailTemplate(name, email, message);

  const mailOptions = {
    to: 'hello@sterio.fm',
    subject: `Contact Form Submission from ${name}`,
    html: htmlContent
  };

  return await sendEmail(mailOptions);
};

/**
 * Send waitlist confirmation email with referral link
 * @param {string} email - User's email address
 * @param {string} referralCode - Unique referral code for this waitlist entry
 * @returns {Promise} - Resolves when email is sent
 */
export const sendWaitlistConfirmationEmail = async (email, referralCode) => {
  // Create a confirmation token valid for 7 days
  const confirmationToken = jwt.sign(
    { email, action: 'confirm_waitlist' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Create the confirmation URL (points to API endpoint which will redirect to frontend)
  // API_URL should include /api (e.g., https://api.sterio.fm/api or http://localhost:5001/api)
  const apiBaseUrl = process.env.API_URL || 'http://localhost:5001/api';
  const confirmationUrl = `${apiBaseUrl}/confirm-waitlist/${confirmationToken}`;

  // Create the referral link
  const referralUrl = `${process.env.FRONTEND_URL || 'https://sterio.fm'}?ref=${referralCode}`;

  // Generate email template
  const htmlContent = generateWaitlistConfirmationEmailTemplate(confirmationUrl, referralUrl);

  // Email options
  const mailOptions = {
    to: email,
    subject: 'Confirm your spot on the Sterio waitlist',
    html: htmlContent
  };

  // Send the email
  return await sendEmail(mailOptions);
};

/**
 * Send a collaboration notification email
 * @param {string} recipientEmail - Email address of the track owner
 * @param {string} collaboratorName - Name of the user who collaborated
 * @param {string} trackTitle - Title of the original track
 * @param {string} trackUrl - URL to view the track
 * @param {string} settingsUrl - URL to manage notification settings
 * @returns {Promise} - Resolves when email is sent
 */
export const sendCollaborationEmail = async (recipientEmail, collaboratorName, trackTitle, trackUrl, settingsUrl) => {
  // Generate email template
  const htmlContent = generateCollabEmailTemplate(collaboratorName, trackTitle, trackUrl, settingsUrl);

  // Email options
  const mailOptions = {
    to: recipientEmail,
    subject: `New collaboration on "${trackTitle}"`,
    html: htmlContent
  };

  // Send the email
  return await sendEmail(mailOptions);
};

/**
 * Send competition winner email
 * @param {string} winnerEmail - Winner's email address
 * @param {string} winnerName - Winner's name or username
 * @param {string} trackTitle - Title of the competition track
 * @param {boolean} isBackupWinner - Whether this is a backup winner
 * @param {number} prizeAmount - Prize amount in cents (optional)
 * @param {number} entriesCount - Total number of entries
 * @param {string} competitionId - Competition ID
 * @returns {Promise} - Resolves when email is sent
 */
export const sendCompetitionWinnerEmail = async (winnerEmail, winnerName, trackTitle, isBackupWinner, prizeAmount, entriesCount, competitionId) => {
  if (!winnerEmail) return null;

  const competitionUrl = `${process.env.FRONTEND_URL || 'https://sterio.fm'}/competition/${competitionId}`;
  const htmlContent = generateCompetitionWinnerTemplate(winnerName, trackTitle, isBackupWinner, prizeAmount, entriesCount, competitionUrl);

  const mailOptions = {
    to: winnerEmail,
    subject: '🎉 You won a competition on sterio.fm!',
    html: htmlContent
  };

  return await sendEmail(mailOptions);
};

/**
 * Send competition host notification email
 * @param {string} hostEmail - Host's email address
 * @param {string} trackTitle - Title of the competition track
 * @param {boolean} isBackupWinner - Whether this is a backup winner
 * @param {string} winnerUsername - Winner's username
 * @param {string} winnerTrackTitle - Winner's track title
 * @param {number} entriesCount - Total number of entries
 * @param {string} competitionId - Competition ID
 * @returns {Promise} - Resolves when email is sent
 */
export const sendCompetitionHostEmail = async (hostEmail, trackTitle, isBackupWinner, winnerUsername, winnerTrackTitle, entriesCount, competitionId) => {
  if (!hostEmail) return null;

  const competitionUrl = `${process.env.FRONTEND_URL || 'https://sterio.fm'}/competition/${competitionId}`;
  const htmlContent = generateCompetitionHostTemplate(trackTitle, isBackupWinner, winnerUsername, winnerTrackTitle, entriesCount, competitionUrl);

  const mailOptions = {
    to: hostEmail,
    subject: isBackupWinner 
      ? 'Competition winner selected automatically' 
      : 'Competition ended - Winner selected!',
    html: htmlContent
  };

  return await sendEmail(mailOptions);
};

/**
 * Send competition no entries email to host
 * @param {string} hostEmail - Host's email address
 * @param {string} trackTitle - Title of the competition track
 * @param {string} competitionId - Competition ID
 * @returns {Promise} - Resolves when email is sent
 */
export const sendCompetitionNoEntriesEmail = async (hostEmail, trackTitle, competitionId) => {
  if (!hostEmail) return null;

  const competitionUrl = `${process.env.FRONTEND_URL || 'https://sterio.fm'}/competition/${competitionId}`;
  const htmlContent = generateCompetitionNoEntriesTemplate(trackTitle, competitionUrl);

  const mailOptions = {
    to: hostEmail,
    subject: 'Competition ended - No entries received',
    html: htmlContent
  };

  return await sendEmail(mailOptions);
};

/**
 * Send competition no backup winner email to host
 * @param {string} hostEmail - Host's email address
 * @param {string} trackTitle - Title of the competition track
 * @param {string} competitionId - Competition ID
 * @returns {Promise} - Resolves when email is sent
 */
export const sendCompetitionNoBackupWinnerEmail = async (hostEmail, trackTitle, competitionId) => {
  if (!hostEmail) return null;

  const competitionUrl = `${process.env.FRONTEND_URL || 'https://sterio.fm'}/competition/${competitionId}`;
  const htmlContent = generateCompetitionNoBackupWinnerTemplate(trackTitle, competitionUrl);

  const mailOptions = {
    to: hostEmail,
    subject: 'Competition ended - No winner selected',
    html: htmlContent
  };

  return await sendEmail(mailOptions);
};
