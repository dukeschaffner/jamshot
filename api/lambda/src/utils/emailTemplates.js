/**
 * Email templates for notification emails
 */

/**
 * Generate HTML template for collaboration notification email
 * @param {string} collaboratorName - Name of the user who collaborated
 * @param {string} trackTitle - Title of the original track
 * @param {string} trackUrl - URL to view the track
 * @param {string} settingsUrl - URL to manage notification settings
 * @returns {string} HTML email template
 */
const generateCollabEmailTemplate = (collaboratorName, trackTitle, trackUrl, settingsUrl) => {
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

export {
  generateCollabEmailTemplate
};
