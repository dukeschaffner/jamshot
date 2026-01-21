import nodemailer from 'nodemailer';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import pool from '../config/db.js';
import { generateCollabEmailTemplate } from './emailTemplates.js';

const emailName = 'Duke from Sterio';

/**
 * Get the appropriate email address based on environment
 * @param {string} originalEmail - The original email address
 * @returns {string} - The email address to use (TEST_EMAIL in dev/test, original in production)
 */
const getEmailAddress = (originalEmail) => {
  const env = process.env.NODE_ENV;
  const isDevOrTest = env === 'dev' || env === 'development' || env === 'test';
  
  if (isDevOrTest && process.env.TEST_EMAIL) {
    console.log(`[EMAIL REDIRECT] ${originalEmail} -> ${process.env.TEST_EMAIL} (${env} environment)`);
    return process.env.TEST_EMAIL;
  }
  
  return originalEmail;
};

// Create a transporter using custom SMTP credentials
let transporter = null;

try {
  // Only create transporter if all required environment variables are present
  if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.EMAIL && process.env.EMAIL_PASSWORD) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST, // e.g., 'smtp.zoho.com' or your provider's SMTP host
      port: parseInt(process.env.SMTP_PORT, 10), // e.g., 465 or 587
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for 587
      auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
      },
      // Add connection timeout to prevent hanging
      connectionTimeout: 10000, // 10 seconds
      socketTimeout: 10000 // 10 seconds
    });
    console.log('✅ Email transporter initialized successfully');
  } else {
    console.warn('⚠️ Email transporter not initialized - missing required environment variables');
  }
} catch (error) {
  console.error('❌ Failed to initialize email transporter:', error);
  transporter = null;
}

/**
 * Send a verification email to a newly registered user
 * @param {string} email - User's email address
 * @param {string} userId - User's ID in the database
 * @param {string} username - User's username
 * @param {string} [verificationUrl] - Optional verification URL (if not provided, will generate one)
 * @returns {Promise} - Resolves when email is sent
 */
const sendVerificationEmail = async (email, userId, username, verificationUrl = null) => {
  try {
    // Check if transporter is available
    if (!transporter) {
      console.warn('⚠️ Email transporter not available - skipping verification email');
      return null;
    }

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

    // Email content
    const mailOptions = {
      from: `"${emailName}" <${process.env.EMAIL}>`,
      to: getEmailAddress(email),
      subject: 'Verify your sterio account',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <h2 style="color: #171717; font-size: 2rem; font-weight: 700; margin-bottom: 16px;">Welcome to sterio, ${username}!</h2>
          <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;">Thank you for registering! Please verify your email address by clicking the button below to complete your account setup.</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${url}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 20px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">Verify Email</a>
          </div>

          <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">If the button doesn't work, you can also copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #555555; background: #f5f5f5; padding: 10px; border-radius: 6px; font-size: 0.875rem; margin-bottom: 24px;">${url}</p>

          <p style="font-size: 0.9rem; color: #555555; line-height: 1.6; margin-bottom: 8px;">This link will expire in 24 hours.</p>
          <p style="font-size: 0.9rem; color: #555555; line-height: 1.6;">If you didn't create an account on sterio, you can safely ignore this email.</p>
        </div>
      `
    };

    // Send the email with proper error handling
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Verification email sent successfully to ${getEmailAddress(email)}`);
    return result;
  } catch (error) {
    console.error('❌ Failed to send verification email:', error);
    // Don't throw the error to prevent Lambda crashes - log and continue
    // The user can still verify their account through other means
    return null;
  }
};

/**
 * Send a password reset email
 * @param {string} email - User's email address
 * @param {string} userId - User's ID in the database
 * @param {string} username - User's username
 * @param {string} [resetUrl] - Optional reset URL (if not provided, will generate one)
 * @returns {Promise} - Resolves when email is sent
 */
const sendPasswordResetEmail = async (email, userId, username, resetUrl = null) => {
  try {
    // Check if transporter is available
    if (!transporter) {
      console.warn('⚠️ Email transporter not available - skipping password reset email');
      return null;
    }

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

    // Email content - matching the verification email theme
    const mailOptions = {
      from: `"${emailName}" <${process.env.EMAIL}>`,
      to: getEmailAddress(email),
      subject: 'Reset your sterio password',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <h2 style="color: #171717; font-size: 2rem; font-weight: 700; margin-bottom: 16px;">Password Reset Request</h2>
          <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;">Hello ${username},</p>
          <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;">We received a request to reset your password. Click the button below to create a new password:</p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${url}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 20px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">Reset Password</a>
          </div>

          <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">If the button doesn't work, you can also copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #555555; background: #f5f5f5; padding: 10px; border-radius: 6px; font-size: 0.875rem; margin-bottom: 24px;">${url}</p>

          <p style="font-size: 0.9rem; color: #555555; line-height: 1.6; margin-bottom: 8px;">This link will expire in 1 hour.</p>
          <p style="font-size: 0.9rem; color: #555555; line-height: 1.6;">If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      `
    };

    // Send the email with proper error handling
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Password reset email sent successfully to ${getEmailAddress(email)}`);
    return result;
  } catch (error) {
    console.error('❌ Failed to send password reset email:', error);
    // Don't throw the error to prevent Lambda crashes - log and continue
    // The user can still reset their password through other means
    return null;
  }
};

/**
 * Send a contact form email
 * @param {Object} param0
 * @param {string} param0.name - Sender's name
 * @param {string} param0.email - Sender's email
 * @param {string} param0.message - Message content
 * @returns {Promise} - Resolves when email is sent
 */
const sendContactEmail = async ({ name, email, message }) => {
  try {
    // Check if transporter is available
    if (!transporter) {
      console.warn('⚠️ Email transporter not available - skipping contact email');
      return null;
    }

    const mailOptions = {
      from: `"${emailName}" <${process.env.EMAIL}>`,
      to: getEmailAddress('hello@sterio.fm'),
      subject: `Contact Form Submission from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Message:</strong></p>
          <div style="background: #f9f9f9; padding: 16px; border-radius: 6px;">${message.replace(/\n/g, '<br>')}</div>
        </div>
      `
    };
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Contact email sent successfully from ${email}`);
    return result;
  } catch (error) {
    console.error('❌ Failed to send contact email:', error);
    // Don't throw the error to prevent Lambda crashes - log and continue
    return null;
  }
};

/**
 * Send waitlist confirmation email with referral link
 * @param {string} email - User's email address
 * @param {string} referralCode - Unique referral code for this waitlist entry
 * @returns {Promise} - Resolves when email is sent
 */
const sendWaitlistConfirmationEmail = async (email, referralCode) => {
  try {
    // Check if transporter is available
    if (!transporter) {
      console.warn('⚠️ Email transporter not available - skipping waitlist confirmation email');
      return null;
    }

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

    // Email content
    const mailOptions = {
      from: `"${emailName}" <${process.env.EMAIL}>`,
      to: getEmailAddress(email),
      subject: 'Confirm your spot on the Sterio waitlist',
      html: `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
          <h2 style="color: #171717; font-size: 2rem; font-weight: 700; margin-bottom: 16px;">Welcome to sterio!</h2>
          <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;">Thank you for joining our waitlist! We're excited to have you be part of the future of music collaboration.</p>

          <div style="background-color: #C1F4D9; border-left: 4px solid #93E9BE; padding: 16px; margin: 20px 0; border-radius: 6px;">
            <h3 style="margin-top: 0; color: #171717; font-size: 1.2rem; font-weight: 600;">Want your tracks to be featured on the home feed at launch?</h3>
            <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 12px;">Get priority early access to the app to start posting and collaborating by:</p>
            <ul style="margin: 0; padding-left: 20px; color: #171717; font-size: 1rem; line-height: 1.6;">
              <li style="margin-bottom: 8px;">confirming your spot on the waitlist using the button below</li>
              <li style="margin-bottom: 0;">referring 3 friends to sterio using the referral link below</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmationUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block; font-size: 1rem;">Confirm Your Spot</a>
          </div>

          <p style="color: #555555; font-size: 0.9rem; margin-bottom: 8px;">If the button doesn't work, you can also copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #555555; background: #f5f5f5; padding: 10px; border-radius: 6px; font-size: 0.875rem; margin-bottom: 24px;">${confirmationUrl}</p>

          <div style="border-top: 1px solid #e0e0e0; margin-top: 30px; padding-top: 20px;">
            <h3 style="color: #171717; font-size: 1.2rem; font-weight: 600; margin-bottom: 12px;">Share with Friends</h3>
            <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">Want to get priority access? Refer friends to join the waitlist! Share your unique referral link:</p>
            <div style="background: #f5f5f5; padding: 16px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; font-weight: 600; color: #171717; font-size: 0.9rem;">Your Referral Link:</p>
              <p style="word-break: break-all; color: #93E9BE; font-size: 0.875rem; margin: 8px 0 0 0;">${referralUrl}</p>
            </div>
            <p style="font-size: 0.875rem; color: #555555; margin-top: 12px;">Refer 3 friends to get priority access when we launch!</p>
          </div>

          <p style="margin-top: 30px; font-size: 0.7rem; color: #999999; line-height: 1.5;">This confirmation link will expire in 7 days. If you didn't sign up for the Sterio waitlist, you can safely ignore this email.</p>
        </div>
      `
    };

    // Send the email with proper error handling
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Waitlist confirmation email sent successfully to ${getEmailAddress(email)}`);
    return result;
  } catch (error) {
    console.error('❌ Failed to send waitlist confirmation email:', error);
    // Don't throw the error to prevent Lambda crashes - log and continue
    return null;
  }
};

/**
 * Send a collaboration notification email
 * @param {number} userId - ID of the user who created the collaboration
 * @param {number} collabTrackId - ID of the collaboration track
 * @param {number} parentTrackId - ID of the parent track
 * @returns {Promise} - Resolves when email is sent
 */
const sendCollabEmail = async (userId, collabTrackId, parentTrackId) => {

  try {
    // Check if transporter is available
    if (!transporter) {
      console.warn('⚠️ Email transporter not available - skipping collaboration email');
      return;
    }

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
    
    // Generate email template
    const htmlContent = generateCollabEmailTemplate(
      collaborator.name || collaborator.username,
      parentTrack.title,
      trackUrl,
      settingsUrl
    );
    
    // Email options
    const mailOptions = {
      from: `"${emailName}" <${process.env.EMAIL}>`,
      to: getEmailAddress(parentTrack.email),
      subject: `New collaboration on "${parentTrack.title}"`,
      html: htmlContent
    };
    
    // Send the email
    await transporter.sendMail(mailOptions);
    console.log(`Collab email sent to ${parentTrack.email} for track ${parentTrack.title}`);
    
  } catch (error) {
    console.error('Error sending collab email:', error);
    // Don't throw error to prevent blocking notification creation
  }
};

export {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendContactEmail,
  sendWaitlistConfirmationEmail,
  sendCollabEmail
}; 