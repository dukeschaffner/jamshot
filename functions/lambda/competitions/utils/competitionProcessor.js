const { pool } = require('../config/db');
const AWS = require('aws-sdk');
const nodemailer = require('nodemailer');

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

// Determine which event bus to use based on environment
const getEventBusName = () => {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'sterio-prod-events';
  if (env === 'test') return 'sterio-test-events';
  // Default to test for safety in unknown environments
  return 'sterio-test-events';
};

if (!process.env.DB_HOST) {
  require('dotenv').config();
}

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
 * Competition Processor class
 * Handles all competition-related processing logic
 */
class CompetitionProcessor {
  
  /**
   * Process competition end - main entry point for competition processing
   */
  async processCompetitionEnd(competitionId) {
    console.log(`Processing competition end for ID: ${competitionId}`);
    
    // Get competition details
    const competition = await this.getCompetitionDetails(competitionId);
    
    if (!competition) {
      throw new Error(`Competition ${competitionId} not found`);
    }
    
    // Check if competition has already been processed
    if (competition.winner_id) {
      console.log(`Competition ${competitionId} already has a winner`);
      return {
        status: 'success',
        message: 'Competition already processed',
        competition_id: competitionId
      };
    }
    
    // Get all entries for this competition
    const entries = await this.getCompetitionEntries(competitionId);
    
    if (entries.length === 0) {
      console.log(`No entries found for competition ${competitionId}`);
      await this.handleNoEntries(competition);
      return {
        status: 'success',
        message: 'No entries to process',
        competition_id: competitionId
      };
    }
    
    // Process winner selection based on method
    let winner = null;
    let backupWinner = null;
    
    if (competition.winner_selection_method === 'automated') {
      winner = await this.selectAutomatedWinner(entries);
      console.log(`Automated winner selected: ${winner?.id}`);
    } else {
      // For curated competitions, determine backup winner and schedule 24hr follow-up
      backupWinner = await this.selectAutomatedWinner(entries);
      await this.updateBackupWinner(competitionId, backupWinner.user_id);
      
      // Schedule 24hr follow-up Lambda
      await this.scheduleFollowUpLambda(competitionId);
      
      console.log(`Backup winner determined for curated competition: ${backupWinner?.id}`);
      console.log(`24hr follow-up scheduled for competition ${competitionId}`);
    }
    
    // If we have a winner (automated), process it
    if (winner) {
      await this.processWinner(competition, winner, entries, false);
    }
    
    return {
      status: 'success',
      message: 'Competition processed successfully',
      competition_id: competitionId,
      winner_selected: !!winner,
      backup_winner_determined: !!backupWinner,
      entries_count: entries.length
    };
  }
  
  /**
   * Process curated competition follow-up (24hr after end)
   */
  async processCuratedFollowup(competitionId) {
    console.log(`Processing curated follow-up for competition ID: ${competitionId}`);
    
    // Get competition details
    const competition = await this.getCompetitionDetails(competitionId);
    
    if (!competition) {
      throw new Error(`Competition ${competitionId} not found`);
    }
    
    // Check if competition already has a winner (host selected one)
    if (competition.winner_id) {
      console.log(`Competition ${competitionId} already has a winner selected by host`);
      return {
        status: 'success',
        message: 'Winner already selected by host',
        competition_id: competitionId
      };
    }
    
    // Check if we have a backup winner
    if (!competition.backup_winner_id) {
      console.log(`No backup winner found for competition ${competitionId}`);
      await this.handleNoBackupWinner(competition);
      return {
        status: 'success',
        message: 'No backup winner to process',
        competition_id: competitionId
      };
    }
    
    // Get backup winner details
    const backupWinner = await this.getBackupWinnerDetails(competition.backup_winner_id);
    
    if (!backupWinner) {
      console.log(`Backup winner ${competition.backup_winner_id} not found`);
      await this.handleNoBackupWinner(competition);
      return {
        status: 'success',
        message: 'Backup winner not found',
        competition_id: competitionId
      };
    }
    
    // Get all entries for notifications
    const entries = await this.getCompetitionEntries(competitionId);
    
    // Process the backup winner as the final winner
    await this.processWinner(competition, backupWinner, entries, true);
    
    return {
      status: 'success',
      message: 'Backup winner processed successfully',
      competition_id: competitionId,
      winner_id: backupWinner.id,
      entries_count: entries.length
    };
  }
  
  /**
   * Get competition details from database
   */
  async getCompetitionDetails(competitionId) {
    const query = `
      SELECT 
        c.*,
        t.title as track_title,
        u.username as host_username,
        u.email as host_email,
        u.name as host_name
      FROM competitions c
      JOIN tracks t ON c.track_id = t.id
      LEFT JOIN users u ON c.host_id = u.id
      WHERE c.id = $1
    `;
    
    const result = await pool.query(query, [competitionId]);
    return result.rows[0] || null;
  }
  
  /**
   * Get all competition entries with engagement metrics
   */
  async getCompetitionEntries(competitionId) {
    const query = `
      SELECT 
        t.*,
        u.username,
        u.name,
        u.email,
        u.verified,
        u.profile_pic_url,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
        (SELECT COUNT(*) FROM comments WHERE track_id = t.id) AS comment_count,
        (SELECT COUNT(*) FROM reposts WHERE track_id = t.id) AS repost_count,
        t.play_count
      FROM tracks t
      JOIN users u ON t.user_id = u.id
      WHERE t.competition_id = $1 
        AND t.is_competition_entry = true
      ORDER BY t.created_at ASC
    `;
    
    const result = await pool.query(query, [competitionId]);
    return result.rows;
  }
  
  /**
   * Get backup winner details
   */
  async getBackupWinnerDetails(backupWinnerId) {
    const query = `
      SELECT 
        t.*,
        u.username,
        u.name,
        u.email,
        u.verified,
        u.profile_pic_url,
        (SELECT COUNT(*) FROM likes WHERE track_id = t.id) AS like_count,
        (SELECT COUNT(*) FROM comments WHERE track_id = t.id) AS comment_count,
        (SELECT COUNT(*) FROM reposts WHERE track_id = t.id) AS repost_count,
        t.play_count
      FROM tracks t
      JOIN users u ON t.user_id = u.id
      WHERE t.id = $1
    `;
    
    const result = await pool.query(query, [backupWinnerId]);
    return result.rows[0] || null;
  }
  
  /**
   * Select winner using automated method (most likes, tiebreaker: play count, then random)
   */
  async selectAutomatedWinner(entries) {
    if (entries.length === 0) return null;
    if (entries.length === 1) return entries[0];
    
    // Sort by like count (desc), then play count (desc), then random
    const sortedEntries = entries.sort((a, b) => {
      // Primary: like count
      if (a.like_count !== b.like_count) {
        return b.like_count - a.like_count;
      }
      
      // Secondary: play count
      if (a.play_count !== b.play_count) {
        return b.play_count - a.play_count;
      }
      
      // Tertiary: random (using track ID for consistency)
      return b.id - a.id;
    });
    
    return sortedEntries[0];
  }
  
  /**
   * Update backup winner in database
   */
  async updateBackupWinner(competitionId, backupWinnerId) {
    const query = `
      UPDATE competitions 
      SET backup_winner_id = $1, updated_at = NOW()
      WHERE id = $2
    `;
    
    await pool.query(query, [backupWinnerId, competitionId]);
  }
  
  /**
   * Process the winner (update database, send notifications, handle payouts)
   * @param {Object} competition - Competition details
   * @param {Object} winner - Winner details
   * @param {Array} allEntries - All competition entries
   * @param {boolean} isBackupWinner - Whether this is a backup winner (affects notification types)
   */
  async processWinner(competition, winner, allEntries, isBackupWinner = false) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Update competition with winner
      await client.query(
        'UPDATE competitions SET winner_id = $1, updated_at = NOW() WHERE id = $2',
        [winner.user_id, competition.id]
      );

      // Send notifications (different types for backup vs regular winner)
      await this.sendWinnerNotifications(competition, winner, allEntries, isBackupWinner, client);

      // Handle prize payout if it's a cash prize
      if (competition.prize_amount && competition.prize_amount > 0) {
        await this.processPrizePayout(competition, winner, client);
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  
  /**
   * Handle competitions with no entries
   */
  async handleNoEntries(competition) {
    // Send notification to host about no entries
    await this.sendNoEntriesNotification(competition);
    
    // Send email to host about no entries
    try {
      await this.sendNoEntriesEmail(competition);
    } catch (error) {
      console.error('Error sending no entries email:', error);
    }
    
    // Update competition status (could add a status field to track this)
    await pool.query(
      'UPDATE competitions SET updated_at = NOW() WHERE id = $1',
      [competition.id]
    );
  }
  
  /**
   * Handle case where no backup winner exists
   */
  async handleNoBackupWinner(competition) {
    // Send notification to host about no backup winner
    await this.sendNotification({
      type: 'competition_ended',
      userId: competition.host_id,
      relatedTrackId: competition.track_id,
      competitionId: competition.id
    });
    
    // Send email to host
    try {
      await this.sendNoBackupWinnerEmail(competition);
    } catch (error) {
      console.error('Error sending no backup winner email:', error);
    }
  }
  
  /**
   * Send notifications to winner and host
   * @param {Object} competition - Competition details
   * @param {Object} winner - Winner details
   * @param {Array} allEntries - All competition entries
   * @param {boolean} isBackupWinner - Whether this is a backup winner (affects notification types)
   * @param {Object} client - Optional database client to use for notifications
   */
  async sendWinnerNotifications(competition, winner, allEntries, isBackupWinner = false, client = null) {
    const notifications = [];

    // Winner notification
    const winnerNotification = {
      type: 'competition_winner',
      userId: winner.user_id,
      relatedTrackId: winner.id,
      relatedUserId: winner.user_id,
      competitionId: competition.id
    };

    notifications.push(winnerNotification);

    // Host notification
    if (competition.host_id) {
      const hostNotification = {
        type: 'competition_ended',
        userId: competition.host_id,
        relatedTrackId: winner.id,
        relatedUserId: winner.user_id,
        competitionId: competition.id
      };

      notifications.push(hostNotification);
    }

    // Send all notifications sequentially to avoid connection pool exhaustion
    for (const notification of notifications) {
      await this.sendNotification(notification, client);
    }

    // Send email notifications
    await this.sendEmailNotifications(competition, winner, allEntries, isBackupWinner);
  }
  
  /**
   * Send notification to user
   * @param {Object} notification - Notification data
   * @param {Object} client - Optional database client to use instead of pool
   */
  async sendNotification(notification, client = null) {
    try {
      const query = `
        INSERT INTO notifications (user_id, type, related_track_id, related_user_id, competition_id, created_at)
        VALUES ($1, $2, $3, $4, $5, NOW())
      `;

      const dbClient = client || pool;
      await dbClient.query(query, [
        notification.userId,
        notification.type,
        notification.relatedTrackId || null,
        notification.relatedUserId || null,
        notification.competitionId || null
      ]);
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }
  
  /**
   * Send notification when competition has no entries
   */
  async sendNoEntriesNotification(competition) {
    if (!competition.host_id) return;
    
    await this.sendNotification({
      type: 'competition_ended',
      userId: competition.host_id,
      relatedTrackId: competition.track_id,
      competitionId: competition.id
    });
  }
  
  /**
   * Send email notifications
   * @param {Object} competition - Competition details
   * @param {Object} winner - Winner details
   * @param {Array} allEntries - All competition entries
   * @param {boolean} isBackupWinner - Whether this is a backup winner (affects email content)
   */
  async sendEmailNotifications(competition, winner, allEntries, isBackupWinner = false) {
    try {
      // Send winner email
      await this.sendWinnerEmail(competition, winner, allEntries, isBackupWinner);
      
      // Send host email
      await this.sendHostEmail(competition, winner, allEntries, isBackupWinner);
    } catch (error) {
      console.error('Error sending email notifications:', error);
    }
  }
  
  /**
   * Process prize payout via Stripe
   * @param {Object} competition - Competition details
   * @param {Object} winner - Winner details
   * @param {Object} client - Optional database client to use instead of pool
   */
  async processPrizePayout(competition, winner, client = null) {
    const dbClient = client || pool;

    // Log pending payout - will be processed manually by admin
    // Use placeholder stripe_transfer_id since actual transfer happens later
    await dbClient.query(
      `INSERT INTO payouts (user_id, amount, type, stripe_transfer_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        winner.user_id,
        competition.prize_amount,
        'competition_prize_pending_onboarding',
        'PENDING_STRIPE_ONBOARDING', // Placeholder until actual transfer
        JSON.stringify({
          competition_id: competition.id,
          track_title: competition.track_title,
          winner_username: winner.username,
          winner_email: winner.email,
          status: 'pending_onboarding',
          reason: 'Winner needs to complete Stripe onboarding before payout can be processed',
          requires_manual_processing: true
        })
      ]
    );

    console.log(`Prize payout logged as pending for winner ${winner.user_id} - requires manual admin processing after Stripe onboarding`);
  }
  
  /**
   * Schedule 24hr follow-up Lambda for curated competitions
   */
  async scheduleFollowUpLambda(competitionId) {
    try {
      const eventbridge = new AWS.EventBridge();
      
      const scheduleTime = new Date();
      scheduleTime.setHours(scheduleTime.getHours() + 24);
      
      const params = {
        Entries: [
          {
            Source: 'sterio.competitions',
            DetailType: 'Competition Follow-up',
            Detail: JSON.stringify({
              competition_id: competitionId,
              type: 'curated_followup'
            }),
            ScheduleExpression: `at(${scheduleTime.toISOString().replace(/[:\-]/g, '').split('.')[0]})`,
            EventBusName: getEventBusName()
          }
        ]
      };
      
      await eventbridge.putEvents(params).promise();
      
    } catch (error) {
      console.error('Error scheduling follow-up Lambda:', error);
    }
  }
  
  /**
   * Send error notification to admin
   */
  async sendErrorNotification(error, event) {
    // try {
    //   const sns = new AWS.SNS();
      
    //   const params = {
    //     TopicArn: process.env.ADMIN_ERROR_TOPIC_ARN,
    //     Message: JSON.stringify({
    //       error: error.message,
    //       stack: error.stack,
    //       event: event,
    //       timestamp: new Date().toISOString()
    //     }),
    //     Subject: 'Competition Lambda Error'
    //   };
      
    //   await sns.publish(params).promise();
    // } catch (notificationError) {
    //   console.error('Error sending error notification:', notificationError);
    // }
  }

  /**
   * Send winner notification email
   * @param {Object} competition - Competition details
   * @param {Object} winner - Winner details
   * @param {Array} allEntries - All competition entries
   * @param {boolean} isBackupWinner - Whether this is a backup winner
   */
  async sendWinnerEmail(competition, winner, allEntries, isBackupWinner = false) {
    if (!winner.email) return;

    const mailOptions = {
      from: process.env.EMAIL,
      to: getEmailAddress(winner.email),
      subject: '🎉 You won a competition on sterio.fm!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Congratulations ${winner.name || winner.username}!</h2>
          <p>You won the competition for "${competition.track_title}"!</p>
          ${isBackupWinner ? '<p><em>Note: You were selected as the winner after the host didn\'t choose within 24 hours.</em></p>' : ''}
          ${competition.prize_amount ? `<p><strong>Prize:</strong> $${(competition.prize_amount / 100).toFixed(2)}</p>` : ''}
          <p><strong>Total entries:</strong> ${allEntries.length}</p>

          ${competition.prize_amount ? `
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">💰 How to Collect Your Winnings</h3>
            <p>Congratulations on your win! To receive your prize money, you'll need to complete a quick payout setup process:</p>
            <ol style="color: #555;">
              <li><strong>Contact our support team</strong> at <a href="mailto:support@sterio.fm" style="color: #6772E5; text-decoration: none;">support@sterio.fm</a> with your competition win details</li>
              <li>Our team will guide you through setting up your payout method</li>
              <li>Once verified, your prize will be transferred within 2-3 business days</li>
            </ol>
            <p style="margin-bottom: 0;"><em>Please allow 1-2 business days for our team to process your payout setup request.</em></p>
          </div>
          ` : ''}

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/competition/${competition.id}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Competition</a>
            ${competition.prize_amount ? `<a href="mailto:support@sterio.fm?subject=Competition Win - Setup Payout&body=Hi, I won the competition for ${encodeURIComponent(competition.track_title)} and need help setting up my payout." style="background-color: #6772E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; margin-left: 10px;">Contact Support for Payout</a>` : ''}
          </div>
        </div>
      `
    };

    return transporter.sendMail(mailOptions);
  }

  /**
   * Send host notification email
   * @param {Object} competition - Competition details
   * @param {Object} winner - Winner details
   * @param {Array} allEntries - All competition entries
   * @param {boolean} isBackupWinner - Whether this is a backup winner
   */
  async sendHostEmail(competition, winner, allEntries, isBackupWinner = false) {
    if (!competition.host_email) return;

    const mailOptions = {
      from: process.env.EMAIL,
      to: getEmailAddress(competition.host_email),
      subject: isBackupWinner 
        ? 'Competition winner selected automatically' 
        : 'Competition ended - Winner selected!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">${isBackupWinner ? 'Competition winner selected automatically' : 'Your competition has ended!'}</h2>
          <p>The competition for "${competition.track_title}" has ${isBackupWinner ? 'been completed' : 'ended'}.</p>
          ${isBackupWinner ? '<p>Since you didn\'t select a winner within 24 hours, the winner was determined automatically:</p>' : ''}
          <p><strong>Winner:</strong> ${winner.username} with "${winner.title}"</p>
          <p><strong>Total entries:</strong> ${allEntries.length}</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/competition/${competition.id}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Results</a>
          </div>
        </div>
      `
    };

    return transporter.sendMail(mailOptions);
  }

  /**
   * Send no entries notification email to host
   * @param {Object} competition - Competition details
   */
  async sendNoEntriesEmail(competition) {
    if (!competition.host_email) return;

    const mailOptions = {
      from: process.env.EMAIL,
      to: getEmailAddress(competition.host_email),
      subject: 'Competition ended - No entries received',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Competition ended without entries</h2>
          <p>The competition for "${competition.track_title}" has ended.</p>
          <p>Unfortunately, no entries were received for this competition.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/competition/${competition.id}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Competition</a>
          </div>
        </div>
      `
    };

    return transporter.sendMail(mailOptions);
  }

  /**
   * Send no backup winner notification email to host
   * @param {Object} competition - Competition details
   */
  async sendNoBackupWinnerEmail(competition) {
    if (!competition.host_email) return;

    const mailOptions = {
      from: process.env.EMAIL,
      to: getEmailAddress(competition.host_email),
      subject: 'Competition ended - No winner selected',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Competition ended without a winner</h2>
          <p>The competition for "${competition.track_title}" has ended.</p>
          <p>No winner could be determined automatically. Please contact support if you need assistance.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL}/competition/${competition.id}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">View Competition</a>
          </div>
        </div>
      `
    };

    return transporter.sendMail(mailOptions);
  }
}

module.exports = CompetitionProcessor;
