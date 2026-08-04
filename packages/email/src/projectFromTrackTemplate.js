/**
 * Email template: someone created a project from your track / collab lineage.
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
 * @param {string} creatorName
 * @param {string} trackTitle
 * @param {string} projectName
 * @param {string} trackUrl
 * @param {string} [settingsUrl]
 * @returns {string}
 */
export function generateProjectFromTrackTemplate(
  creatorName,
  trackTitle,
  projectName,
  trackUrl,
  settingsUrl
) {
  const safeCreator = escapeHtml(creatorName || 'Someone');
  const safeTrack = escapeHtml(trackTitle || 'your track');
  const safeProject = escapeHtml(projectName || 'a project');
  const settingsBlock = settingsUrl
    ? `<p style="color: #737373; font-size: 0.875rem; line-height: 1.5; margin-top: 24px;">
        You can manage email notifications in your
        <a href="${settingsUrl}" style="color: #737373;">account settings</a>.
      </p>`
    : '';

  return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #ffffff;">
      <h2 style="color: #171717; font-size: 1.8rem; font-weight: 700; margin-bottom: 16px;">Your track is in a new project</h2>
      <p style="color: #171717; font-size: 1rem; line-height: 1.6;">
        <strong>${safeCreator}</strong> started a project
        (<strong>${safeProject}</strong>) using
        <strong>${safeTrack}</strong>.
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${trackUrl}" style="background: linear-gradient(90deg, #93E9BE, #E9A9A1); color: #171717; padding: 12px 24px; text-decoration: none; border-radius: 24px; font-weight: 600; display: inline-block;">View track</a>
      </div>
      ${settingsBlock}
    </div>
  `;
}
