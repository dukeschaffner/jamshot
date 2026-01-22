
import { createLambdaPool } from '@sterio/db-config';
import { sendActivitySummaryEmail } from '@sterio/email';

const pool = createLambdaPool();


/**
 * Send an activity summary email
 * @param {string} userId - ID of the user to send summary to
 * @param {string} periodType - Type of period (daily, weekly, monthly)
 * @param {Object} analyticsData - Analytics data from user_analytics_aggregates
 * @returns {Promise} - Resolves when email is sent
 */
const sendActivitySummaryEmailToUser = async (userId, periodType, analyticsData) => {
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

    // Use the shared email service
    await sendActivitySummaryEmail(
      user.email,
      user.name || user.username,
      periodType,
      analyticsData,
      settingsUrl
    );

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
export const processEmailNotifications = async (forcePeriods = null) => {
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
            await sendActivitySummaryEmailToUser(userId, periodType, analyticsData);
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
export const handler = async (event, context) => {
  const result = await processEmailNotifications();
  return result;
};

