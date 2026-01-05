const path = require('path');

// Load environment variables first, before importing db config
if (!process.env.DB_HOST) {
  require('dotenv').config({ path: path.join(__dirname, '.env') });
}

const { pool } = require('./config/db');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');

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
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.EMAIL,
    pass: process.env.EMAIL_PASSWORD
  }
});

/**
 * Generate HTML template for activity summary email
 * @param {string} userName - Name of the user receiving the summary
 * @param {string} periodType - Type of period (daily, weekly, monthly)
 * @param {Object} analyticsData - Analytics data from user_analytics_aggregates
 * @param {string} settingsUrl - URL to manage notification settings
 * @returns {string} HTML email template
 */
const generateActivitySummaryTemplate = (userName, periodType, analyticsData, settingsUrl) => {
  const periodLabel = periodType === 'daily' ? 'Yesterday' : 
                     periodType === 'weekly' ? 'This Week' : 
                     'This Month';
  
  const totalPlays = analyticsData.total_plays_received || 0;
  const totalLikes = analyticsData.total_likes_received || 0;
  const totalComments = analyticsData.total_comments_received || 0;
  const totalCollaborations = analyticsData.total_collaborations_received || 0;
  const newFollowers = 0; //analyticsData.follower_count || 0;
  
  // Only send if there's some activity
  const hasActivity = totalPlays > 0 || totalLikes > 0 || totalComments > 0 || totalCollaborations > 0 || newFollowers > 0;
  
  if (!hasActivity) {
    return null; // Don't send email if no activity
  }
  
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #171717; font-size: 1.8rem; font-weight: 700; margin-bottom: 20px;">Your ${periodLabel} Activity Summary</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">Hi ${userName},</p>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">Here's how your tracks performed ${periodType === 'daily' ? 'yesterday' : `this ${periodType.slice(0, -2)}`}:</p>
      
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px;">
          ${totalPlays > 0 ? `
            <div style="text-align: center;">
              <div style="font-size: 2rem; font-weight: bold; color: #93E9BE;">${totalPlays}</div>
              <div style="color: #555555; font-size: 0.9rem;">Play${totalPlays !== 1 ? 's' : ''}</div>
            </div>
          ` : ''}
          
          ${totalLikes > 0 ? `
            <div style="text-align: center;">
              <div style="font-size: 2rem; font-weight: bold; color: #93E9BE;">${totalLikes}</div>
              <div style="color: #555555; font-size: 0.9rem;">Like${totalLikes !== 1 ? 's' : ''}</div>
            </div>
          ` : ''}
          
          ${totalComments > 0 ? `
            <div style="text-align: center;">
              <div style="font-size: 2rem; font-weight: bold; color: #93E9BE;">${totalComments}</div>
              <div style="color: #555555; font-size: 0.9rem;">Comment${totalComments !== 1 ? 's' : ''}</div>
            </div>
          ` : ''}
          
          ${totalCollaborations > 0 ? `
            <div style="text-align: center;">
              <div style="font-size: 2rem; font-weight: bold; color: #93E9BE;">${totalCollaborations}</div>
              <div style="color: #555555; font-size: 0.9rem;">Collaboration${totalCollaborations !== 1 ? 's' : ''}</div>
            </div>
          ` : ''}
        </div>
        
        ${newFollowers > 0 ? `
          <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e0e0e0;">
            <div style="font-size: 1.5rem; font-weight: bold; color: #93E9BE;">+${newFollowers}</div>
            <div style="color: #555555; font-size: 0.9rem;">New Follower${newFollowers !== 1 ? 's' : ''}</div>
          </div>
        ` : ''}
      </div>
      
      <div style="text-align: center; margin: 30px 0;">
        <a href="${process.env.FRONTEND_URL || 'https://sterio.fm'}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 20px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">View Your Profile</a>
      </div>
      
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">Keep creating and collaborating to grow your audience!</p>
      
      <div style="border-top: 1px solid #e0e0e0; margin-top: 30px; padding-top: 20px;">
        <p style="font-size: 0.9rem; color: #555555; line-height: 1.6;">
          You're receiving this ${periodType} summary because you have activity summaries enabled. 
          <a href="${settingsUrl}" style="color: #93E9BE; text-decoration: none;">Manage your notification preferences</a>
        </p>
      </div>
    </div>
  `;
};

/**
 * Send an activity summary email
 * @param {number} userId - ID of the user to send summary to
 * @param {string} periodType - Type of period (daily, weekly, monthly)
 * @param {Object} analyticsData - Analytics data from user_analytics_aggregates
 * @returns {Promise} - Resolves when email is sent
 */
const sendActivitySummaryEmail = async (userId, periodType, analyticsData) => {
  try {
    // Get user details and preferences
    const userQuery = `
      SELECT 
        u.email,
        u.name,
        u.username,
        u.email_verified,
        np.activity_summary_frequency
      FROM users u
      LEFT JOIN notification_preferences np ON u.id = np.user_id
      WHERE u.id = $1
    `;
    const userResult = await pool.query(userQuery, [userId]);
    
    if (userResult.rows.length === 0) {
      console.log(`User ${userId} not found for activity summary email`);
      return;
    }
    
    const user = userResult.rows[0];
    
    // Check if email should be sent
    if (!user.email_verified) {
      console.log(`User ${userId} email not verified, skipping activity summary email`);
      return;
    }
    
    if (user.activity_summary_frequency !== periodType) {
      console.log(`User ${userId} has different frequency preference (${user.activity_summary_frequency} vs ${periodType}), skipping`);
      return;
    }
    
    // Generate URLs
    const settingsUrl = `${process.env.FRONTEND_URL || 'https://sterio.fm'}/user/edit?tab=notifications`;
    
    // Generate email template
    const htmlContent = generateActivitySummaryTemplate(
      user.name || user.username,
      periodType,
      analyticsData,
      settingsUrl
    );
    
    // Skip if no activity (template returns null)
    if (!htmlContent) {
      console.log(`No activity for user ${userId}, skipping summary email`);
      return;
    }
    
    // Email options
    const mailOptions = {
      from: `"${emailName}" <${process.env.EMAIL}>`,
      to: getEmailAddress(user.email),
      subject: `Your ${periodType} activity summary - Sterio`,
      html: htmlContent
    };
    
    // Send the email
    await transporter.sendMail(mailOptions);
    console.log(`Activity summary email sent to ${user.email} for ${periodType} period`);
    
  } catch (error) {
    console.error('Error sending activity summary email:', error);
    // Don't throw error to prevent blocking other emails
  }
};

/**
 * Get date range for period type
 */
const getDateRange = (periodType) => {
  const now = new Date();
  let startDate, endDate;
  
  switch (periodType) {
    case 'daily':
      // Yesterday
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 1);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(startDate);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'weekly':
      // Last 7 days
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    case 'monthly':
      // Last 30 days
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 30);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);
      break;
      
    default:
      throw new Error(`Invalid period type: ${periodType}`);
  }
  
  return { startDate, endDate };
};

/**
 * Determine which period types should run today
 */
const getPeriodTypesToRun = () => {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
  const dayOfMonth = now.getDate();
  
  const periods = ['daily']; // Always run daily
  
  // Run weekly on Mondays (day 1)
  if (dayOfWeek === 1) {
    periods.push('weekly');
  }
  
  // Run monthly on the 1st of each month
  if (dayOfMonth === 1) {
    periods.push('monthly');
  }
  
  return periods;
};

/**
 * Main processing function
 */
const processEmailNotifications = async (forcePeriods = null) => {
  console.log('Starting email notifications processing');
  
  try {
    const periodTypes = forcePeriods || getPeriodTypesToRun();
    console.log(`Running for periods: ${periodTypes.join(', ')}`);
    
    let totalEmailsSent = 0;
    let totalErrors = 0;
    
    for (const periodType of periodTypes) {
      console.log(`Processing ${periodType} summaries...`);
      
      // Get users who want this frequency
      const usersQuery = `
        SELECT DISTINCT u.id
        FROM users u
        JOIN notification_preferences np ON u.id = np.user_id
        WHERE np.activity_summary_frequency = $1
          AND u.email_verified = true
      `;
      
      const usersResult = await pool.query(usersQuery, [periodType]);
      console.log(`Found ${usersResult.rows.length} users with ${periodType} preference`);
      
      if (usersResult.rows.length === 0) {
        continue;
      }
      
      // Get date range for this period
      const { startDate, endDate } = getDateRange(periodType);
      console.log(`Date range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
      
      // Process users in batches to avoid overwhelming the email service
      const batchSize = 50;
      const userIds = usersResult.rows.map(row => row.id);
      
      for (let i = 0; i < userIds.length; i += batchSize) {
        const batch = userIds.slice(i, i + batchSize);
        console.log(`Processing batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(userIds.length / batchSize)} for ${periodType}`);
        
        // Get analytics data for this batch
        const analyticsQuery = `
          SELECT 
            user_id,
            SUM(total_plays_received) as total_plays_received,
            SUM(total_listeners_received) as total_listeners_received,
            SUM(total_likes_received) as total_likes_received,
            SUM(total_comments_received) as total_comments_received,
            SUM(total_reposts_received) as total_reposts_received,
            SUM(total_collaborations_received) as total_collaborations_received,
            MAX(follower_count) as follower_count
          FROM user_analytics_aggregates
          WHERE user_id = ANY($1)
            AND period_start >= $2
            AND period_end <= $3
          GROUP BY user_id
        `;
        
        const analyticsResult = await pool.query(analyticsQuery, [batch, startDate, endDate]);
        const analyticsMap = new Map();
        analyticsResult.rows.forEach(row => {
          analyticsMap.set(row.user_id, row);
        });
        
        // Send emails for this batch
        const emailPromises = batch.map(async (userId) => {
          try {
            const analyticsData = analyticsMap.get(userId) || {};
            await sendActivitySummaryEmail(userId, periodType, analyticsData);
            totalEmailsSent++;
          } catch (error) {
            console.error(`Error sending email to user ${userId}:`, error);
            totalErrors++;
          }
        });
        
        await Promise.all(emailPromises);
        
        // Small delay between batches to be nice to the email service
        if (i + batchSize < userIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    console.log(`Email notifications completed. Sent: ${totalEmailsSent}, Errors: ${totalErrors}`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Email notifications completed',
        emailsSent: totalEmailsSent,
        errors: totalErrors,
        periodsProcessed: periodTypes
      })
    };
    
  } catch (error) {
    console.error('Error in email notifications processing:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'Error processing email notifications',
        error: error.message
      })
    };
  }
};

/**
 * Main Lambda handler
 */
exports.handler = async (event, context) => {
  try {
    const result = await processEmailNotifications();
    return result;
  } finally {
    // Close database connection
    await pool.end();
  }
};

/**
 * Local execution support
 */
if (require.main === module) {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let forcePeriods = null;
  
  if (args.length > 0) {
    const validPeriods = ['daily', 'weekly', 'monthly'];
    forcePeriods = args.filter(arg => validPeriods.includes(arg));
    if (forcePeriods.length === 0) {
      console.log('Usage: node index.js [daily] [weekly] [monthly]');
      console.log('Examples:');
      console.log('  node index.js              # Run based on current date');
      console.log('  node index.js daily        # Force daily emails only');
      console.log('  node index.js weekly       # Force weekly emails only');
      console.log('  node index.js daily weekly # Force both daily and weekly');
      process.exit(1);
    }
  }
  
  // Run the function
  processEmailNotifications(forcePeriods)
    .then(result => {
      console.log('Local execution completed:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Local execution failed:', error);
      process.exit(1);
    });
}
