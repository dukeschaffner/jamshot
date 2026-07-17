// Transport utilities
export { sendEmail, getEmailAddress, isTransporterAvailable } from './transport.js';

// Email templates
export {
  generateActivitySummaryTemplate,
  generateCollabEmailTemplate,
  generateVerificationEmailTemplate,
  generatePasswordResetEmailTemplate,
  generateContactEmailTemplate,
  generateWaitlistConfirmationEmailTemplate,
  generateCompetitionWinnerTemplate,
  generateCompetitionHostTemplate,
  generateCompetitionNoEntriesTemplate,
  generateCompetitionNoBackupWinnerTemplate,
  generateProjectDeletionWarningTemplate,
} from './templates.js';

// High-level email services
export {
  sendActivitySummaryEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendContactEmail,
  sendWaitlistConfirmationEmail,
  sendCollaborationEmail,
  sendCompetitionWinnerEmail,
  sendCompetitionHostEmail,
  sendCompetitionNoEntriesEmail,
  sendCompetitionNoBackupWinnerEmail,
  sendProjectDeletionWarningEmail,
} from './services.js';
