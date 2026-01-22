// Transport utilities
export { sendEmail, getEmailAddress, isTransporterAvailable } from './transport.js';

// Email templates
export {
  generateActivitySummaryTemplate,
  generateCollabEmailTemplate,
  generateVerificationEmailTemplate,
  generatePasswordResetEmailTemplate,
  generateContactEmailTemplate,
  generateWaitlistConfirmationEmailTemplate
} from './templates.js';

// High-level email services
export {
  sendActivitySummaryEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendContactEmail,
  sendWaitlistConfirmationEmail,
  sendCollaborationEmail
} from './services.js';
