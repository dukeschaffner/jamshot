import nodemailer from 'nodemailer';

const emailName = 'Duke from Sterio';

/**
 * Get the appropriate email address based on environment
 * @param {string} originalEmail - The original email address
 * @returns {string} - The email address to use (TEST_EMAIL in dev/test, original in production)
 */
export const getEmailAddress = (originalEmail) => {
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

// Only create transporter if all required environment variables are present
if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.EMAIL && process.env.EMAIL_PASSWORD) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT, 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
        },
        // Add connection timeout to prevent hanging
        connectionTimeout: 10000, // 10 seconds
        socketTimeout: 10000 // 10 seconds
    });
} else {
    throw new Error('Email transporter not initialized - missing required environment variables');
}

/**
 * Send an email using the configured transporter
 * @param {Object} mailOptions - Email options (to, subject, html, etc.)
 * @returns {Promise} - Resolves with send result or null if transporter unavailable
 */
export const sendEmail = async (mailOptions) => {
  try {
    // Check if transporter is available
    if (!transporter) {
      throw new Error('Email transporter not available - skipping email send');
    }

    // Ensure from address is set
    if (!mailOptions.from) {
      mailOptions.from = `"${emailName}" <${process.env.EMAIL}>`;
    }

    // Apply email redirection if needed
    if (mailOptions.to) {
      mailOptions.to = getEmailAddress(mailOptions.to);
    }

    // Send the email
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent successfully to ${mailOptions.to}`);
    return result;
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    // Don't throw the error to prevent Lambda crashes - log and continue
    return null;
  }
};

/**
 * Check if email transporter is available
 * @returns {boolean} - True if transporter is initialized and ready
 */
export const isTransporterAvailable = () => {
  return transporter !== null;
};
