/**
 * Email templates for notification emails
 */

/**
 * Generate HTML template for activity summary email
 * @param {string} userName - Name of the user receiving the summary
 * @param {string} periodType - Type of period (daily, weekly, monthly)
 * @param {Object} analyticsData - Analytics data from user_analytics_aggregates
 * @param {string} settingsUrl - URL to manage notification settings
 * @returns {string} HTML email template
 */
export const generateActivitySummaryTemplate = (userName, periodType, analyticsData, settingsUrl) => {
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
 * Generate HTML template for collaboration notification email
 * @param {string} collaboratorName - Name of the user who collaborated
 * @param {string} trackTitle - Title of the original track
 * @param {string} trackUrl - URL to view the track
 * @param {string} settingsUrl - URL to manage notification settings
 * @returns {string} HTML email template
 */
export const generateCollabEmailTemplate = (collaboratorName, trackTitle, trackUrl, settingsUrl) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #171717; font-size: 1.8rem; font-weight: 700; margin-bottom: 20px;">New Collaboration on Your Track!</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">Hi there,</p>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;"><strong>${collaboratorName}</strong> just added a collaboration to your track "<strong>${trackTitle}</strong>".</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${trackUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 20px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">Listen to the Collaboration</a>
      </div>

      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">Check out what they added and see how your track has evolved!</p>

      <div style="border-top: 1px solid #e0e0e0; margin-top: 30px; padding-top: 20px;">
        <p style="font-size: 0.9rem; color: #555555; line-height: 1.6;">
          You're receiving this email because you have collaboration notifications enabled.
          <a href="${settingsUrl}" style="color: #93E9BE; text-decoration: none;">Manage your notification preferences</a>
        </p>
      </div>
    </div>
  `;
};

/**
 * Generate HTML template for email verification
 * @param {string} username - User's username
 * @param {string} verificationUrl - URL for email verification
 * @returns {string} HTML email template
 */
export const generateVerificationEmailTemplate = (username, verificationUrl) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <h2 style="color: #171717; font-size: 2rem; font-weight: 700; margin-bottom: 16px;">Welcome to sterio, ${username}!</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;">Thank you for registering! Please verify your email address by clicking the button below to complete your account setup.</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${verificationUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 20px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">Verify Email</a>
      </div>

      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">If the button doesn't work, you can also copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #555555; background: #f5f5f5; padding: 10px; border-radius: 6px; font-size: 0.875rem; margin-bottom: 24px;">${verificationUrl}</p>

      <p style="font-size: 0.9rem; color: #555555; line-height: 1.6; margin-bottom: 8px;">This link will expire in 24 hours.</p>
      <p style="font-size: 0.9rem; color: #555555; line-height: 1.6;">If you didn't create an account on sterio, you can safely ignore this email.</p>
    </div>
  `;
};

/**
 * Generate HTML template for password reset email
 * @param {string} username - User's username
 * @param {string} resetUrl - URL for password reset
 * @returns {string} HTML email template
 */
export const generatePasswordResetEmailTemplate = (username, resetUrl) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <h2 style="color: #171717; font-size: 2rem; font-weight: 700; margin-bottom: 16px;">Password Reset Request</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;">Hello ${username},</p>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;">We received a request to reset your password. Click the button below to create a new password:</p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 20px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">Reset Password</a>
      </div>

      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">If the button doesn't work, you can also copy and paste this link into your browser:</p>
      <p style="word-break: break-all; color: #555555; background: #f5f5f5; padding: 10px; border-radius: 6px; font-size: 0.875rem; margin-bottom: 24px;">${resetUrl}</p>

      <p style="font-size: 0.9rem; color: #555555; line-height: 1.6; margin-bottom: 8px;">This link will expire in 1 hour.</p>
      <p style="font-size: 0.9rem; color: #555555; line-height: 1.6;">If you didn't request a password reset, you can safely ignore this email.</p>
    </div>
  `;
};

/**
 * Generate HTML template for contact form email
 * @param {string} name - Sender's name
 * @param {string} email - Sender's email
 * @param {string} message - Message content
 * @returns {string} HTML email template
 */
export const generateContactEmailTemplate = (name, email, message) => {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #333;">New Contact Form Submission</h2>
      <p><strong>Name:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Message:</strong></p>
      <div style="background: #f9f9f9; padding: 16px; border-radius: 6px;">${message.replace(/\n/g, '<br>')}</div>
    </div>
  `;
};

/**
 * Generate HTML template for waitlist confirmation email
 * @param {string} confirmationUrl - URL for confirming waitlist entry
 * @param {string} referralUrl - Referral link for the user
 * @returns {string} HTML email template
 */
export const generateWaitlistConfirmationEmailTemplate = (confirmationUrl, referralUrl) => {
  return `
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
  `;
};

/**
 * Generate HTML template for competition winner email
 * @param {string} winnerName - Winner's name or username
 * @param {string} trackTitle - Title of the competition track
 * @param {boolean} isBackupWinner - Whether this is a backup winner
 * @param {number} prizeAmount - Prize amount in cents (optional)
 * @param {number} entriesCount - Total number of entries
 * @param {string} competitionUrl - URL to view the competition
 * @returns {string} HTML email template
 */
export const generateCompetitionWinnerTemplate = (winnerName, trackTitle, isBackupWinner, prizeAmount, entriesCount, competitionUrl) => {
  const prizeAmountDollars = prizeAmount ? (prizeAmount / 100).toFixed(2) : null;
  const supportEmail = 'hello@sterio.fm';
  const payoutSubject = encodeURIComponent(`Competition Win - Setup Payout`);
  const payoutBody = encodeURIComponent(`Hi, I won the competition for ${trackTitle} and need help setting up my payout.`);

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <h2 style="color: #171717; font-size: 2rem; font-weight: 700; margin-bottom: 16px;">🎉 Congratulations ${winnerName}!</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">You won the competition for "<strong>${trackTitle}</strong>"!</p>
      ${isBackupWinner ? '<p style="color: #555555; font-size: 0.95rem; line-height: 1.6; font-style: italic; margin-bottom: 16px;">Note: You were selected as the winner after the host didn\'t choose within 24 hours.</p>' : ''}
      ${prizeAmountDollars ? `<p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 8px;"><strong>Prize:</strong> $${prizeAmountDollars}</p>` : ''}
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;"><strong>Total entries:</strong> ${entriesCount}</p>

      ${prizeAmountDollars ? `
      <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #93E9BE;">
        <h3 style="color: #171717; margin-top: 0; font-size: 1.3rem; font-weight: 600; margin-bottom: 12px;">💰 How to Collect Your Winnings</h3>
        <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">Congratulations on your win! To receive your prize money, you'll need to complete a quick payout setup process:</p>
        <ol style="color: #555555; font-size: 1rem; line-height: 1.8; padding-left: 20px; margin-bottom: 16px;">
          <li style="margin-bottom: 8px;"><strong>Contact our support team</strong> at <a href="mailto:${supportEmail}" style="color: #93E9BE; text-decoration: none;">${supportEmail}</a> with your competition win details</li>
          <li style="margin-bottom: 8px;">Our team will guide you through setting up your payout method</li>
          <li style="margin-bottom: 0;">Once verified, your prize will be transferred within 2-3 business days</li>
        </ol>
        <p style="margin-bottom: 0; color: #555555; font-size: 0.95rem; line-height: 1.6; font-style: italic;">Please allow 1-2 business days for our team to process your payout setup request.</p>
      </div>
      ` : ''}

      <div style="text-align: center; margin: 30px 0;">
        <a href="${competitionUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block; margin-right: ${prizeAmountDollars ? '10px' : '0'};">View Competition</a>
        ${prizeAmountDollars ? `<a href="mailto:${supportEmail}?subject=${payoutSubject}&body=${payoutBody}" style="background-color: #6772E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">Contact Support for Payout</a>` : ''}
      </div>
    </div>
  `;
};

/**
 * Generate HTML template for competition host notification email
 * @param {string} trackTitle - Title of the competition track
 * @param {boolean} isBackupWinner - Whether this is a backup winner
 * @param {string} winnerUsername - Winner's username
 * @param {string} winnerTrackTitle - Winner's track title
 * @param {number} entriesCount - Total number of entries
 * @param {string} competitionUrl - URL to view the competition
 * @returns {string} HTML email template
 */
export const generateCompetitionHostTemplate = (trackTitle, isBackupWinner, winnerUsername, winnerTrackTitle, entriesCount, competitionUrl) => {
  const subject = isBackupWinner ? 'Competition winner selected automatically' : 'Your competition has ended!';
  const heading = isBackupWinner ? 'Competition winner selected automatically' : 'Your competition has ended!';
  const statusText = isBackupWinner ? 'been completed' : 'ended';

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <h2 style="color: #171717; font-size: 2rem; font-weight: 700; margin-bottom: 16px;">${heading}</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">The competition for "<strong>${trackTitle}</strong>" has ${statusText}.</p>
      ${isBackupWinner ? '<p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">Since you didn\'t select a winner within 24 hours, the winner was determined automatically:</p>' : ''}
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 8px;"><strong>Winner:</strong> ${winnerUsername} with "<strong>${winnerTrackTitle}</strong>"</p>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;"><strong>Total entries:</strong> ${entriesCount}</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${competitionUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">View Results</a>
      </div>
    </div>
  `;
};

/**
 * Generate HTML template for competition with no entries email
 * @param {string} trackTitle - Title of the competition track
 * @param {string} competitionUrl - URL to view the competition
 * @returns {string} HTML email template
 */
export const generateCompetitionNoEntriesTemplate = (trackTitle, competitionUrl) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <h2 style="color: #171717; font-size: 2rem; font-weight: 700; margin-bottom: 16px;">Competition ended without entries</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">The competition for "<strong>${trackTitle}</strong>" has ended.</p>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;">Unfortunately, no entries were received for this competition.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${competitionUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">View Competition</a>
      </div>
    </div>
  `;
};

/**
 * Generate HTML template for competition with no backup winner email
 * @param {string} trackTitle - Title of the competition track
 * @param {string} competitionUrl - URL to view the competition
 * @returns {string} HTML email template
 */
export const generateCompetitionNoBackupWinnerTemplate = (trackTitle, competitionUrl) => {
  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <h2 style="color: #171717; font-size: 2rem; font-weight: 700; margin-bottom: 16px;">Competition ended without a winner</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 16px;">The competition for "<strong>${trackTitle}</strong>" has ended.</p>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6; margin-bottom: 24px;">No winner could be determined automatically. Please contact support if you need assistance.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${competitionUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">View Competition</a>
      </div>
    </div>
  `;
};

/**
 * Generate HTML template for project deletion warning email.
 * @param {string} userName
 * @param {'7d'|'1d'} warningType
 * @param {Array<{ name: string, scheduledDeletionAt: string|Date }>} projects
 * @param {string} subscribeUrl
 * @returns {string}
 */
export const generateProjectDeletionWarningTemplate = (
  userName,
  warningType,
  projects,
  subscribeUrl
) => {
  const isOneDay = warningType === '1d';
  const heading = isOneDay
    ? 'Projects scheduled for deletion tomorrow'
    : 'Projects scheduled for deletion in 7 days';
  const urgency = isOneDay
    ? 'These projects will be permanently deleted in about 1 day unless you restore access.'
    : 'These projects will be permanently deleted in about 7 days unless you restore access.';

  const projectList = (projects || [])
    .map((project) => {
      const dateLabel = project.scheduledDeletionAt
        ? new Date(project.scheduledDeletionAt).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })
        : 'soon';
      return `<li style="margin-bottom: 8px;"><strong>${escapeHtml(project.name || 'Untitled project')}</strong> — deleted on ${dateLabel}</li>`;
    })
    .join('');

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <h2 style="color: #171717; font-size: 1.8rem; font-weight: 700; margin-bottom: 16px;">${heading}</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">Hi ${escapeHtml(userName || 'there')},</p>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">${urgency}</p>
      <ul style="color: #171717; font-size: 1rem; line-height: 1.6; padding-left: 20px;">
        ${projectList}
      </ul>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">Upgrade or renew your subscription to restore locked projects and cancel deletion.</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${subscribeUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">Manage subscription</a>
      </div>
    </div>
  `;
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
