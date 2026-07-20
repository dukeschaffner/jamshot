/**
 * Project invite email template
 */

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {string} inviterName
 * @param {string} projectName
 * @param {string} role
 * @param {string} inviteUrl
 * @returns {string}
 */
export function generateProjectInviteTemplate(
  inviterName,
  projectName,
  role,
  inviteUrl
) {
  const safeInviter = escapeHtml(inviterName || 'Someone');
  const safeProject = escapeHtml(projectName || 'a project');
  const safeRole = escapeHtml(role || 'editor');

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <h2 style="color: #171717; font-size: 1.8rem; font-weight: 700; margin-bottom: 16px;">You're invited to a project</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">
        <strong>${safeInviter}</strong> invited you to join
        <strong>${safeProject}</strong> as a <strong>${safeRole}</strong>.
      </p>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">
        This invite expires in 7 days.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${inviteUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">View invite</a>
      </div>
      <p style="color: #737373; font-size: 0.875rem; line-height: 1.5;">
        If you weren't expecting this invite, you can ignore this email.
      </p>
    </div>
  `;
}
