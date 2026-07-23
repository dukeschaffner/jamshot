import { sendProjectCreatedFromTrackEmail } from '@sterio/email';
import pool from '../config/db.js';
import { getLineageContributorUserIds } from './projectImportService.js';

/**
 * Fire-and-forget emails to lineage contributors when a project is created from a track.
 */
export async function notifyLineageContributorsOfProject({
  sourceTrackId,
  sourceTrackGuid,
  sourceTrackTitle,
  projectName,
  creatorUserId,
}) {
  try {
    const contributorIds = await getLineageContributorUserIds(
      sourceTrackId,
      creatorUserId
    );
    if (!contributorIds.length) return;

    const creatorResult = await pool.query(
      'SELECT name, username FROM users WHERE id = $1',
      [creatorUserId]
    );
    const creator = creatorResult.rows[0];
    const creatorName = creator?.name || creator?.username || 'Someone';

    const recipientsResult = await pool.query(
      `SELECT u.id, u.email, u.email_verified, np.collab_email_enabled
       FROM users u
       LEFT JOIN notification_preferences np ON np.user_id = u.id
       WHERE u.id = ANY($1::text[])`,
      [contributorIds]
    );

    const frontendUrl = (process.env.FRONTEND_URL || 'https://sterio.fm').replace(
      /\/$/,
      ''
    );
    const trackUrl = `${frontendUrl}/track/${sourceTrackGuid}`;
    const settingsUrl = `${frontendUrl}/user/edit?tab=notifications`;

    await Promise.allSettled(
      recipientsResult.rows.map(async (recipient) => {
        if (!recipient.email || !recipient.email_verified) return;
        if (recipient.collab_email_enabled === false) return;

        await sendProjectCreatedFromTrackEmail(
          recipient.email,
          creatorName,
          sourceTrackTitle,
          projectName,
          trackUrl,
          settingsUrl
        );
      })
    );
  } catch (err) {
    console.error('notifyLineageContributorsOfProject failed:', err);
  }
}
