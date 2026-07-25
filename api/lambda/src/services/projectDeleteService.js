import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import pool from '../config/db.js';
import { s3Client } from '../utils/trackUtils.js';
import { isProjectGuid, resolveProjectRef } from '../utils/projectAccess.js';
import {
  reconcileOwnerProjects,
  reconcileTeamProjects,
  reconcileCampProjects,
} from '../utils/projectRetention.js';

/**
 * Owner-only hard delete. Bypasses access_revoked lock so owners can free slots.
 *
 * @param {string|number} projectRef - guid or numeric id
 * @param {string} userId
 */
export async function deleteProjectAsOwner(projectRef, userId) {
  const resolved = await resolveProjectRef(projectRef);
  if (!resolved.ok) {
    return { ok: false, status: resolved.status, error: resolved.error };
  }

  const projectId = resolved.projectId;

  const projectResult = await pool.query(
    `SELECT id, owner_id, team_id, camp_id, guid
     FROM projects WHERE id = $1`,
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    if (isProjectGuid(String(projectRef))) {
      return {
        ok: false,
        status: 403,
        error: 'You do not have access to this project',
      };
    }
    return { ok: false, status: 404, error: 'Project not found' };
  }

  const project = projectResult.rows[0];

  if (project.owner_id !== userId) {
    return {
      ok: false,
      status: 403,
      error: 'Only the project owner can delete this project',
    };
  }

  const assetsResult = await pool.query(
    `SELECT storage_key, waveform_url FROM project_assets WHERE project_id = $1`,
    [projectId]
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // RESTRICT FKs require explicit child cleanup before assets/project
    await client.query(
      `DELETE FROM project_snapshot_assets
       WHERE snapshot_id IN (SELECT id FROM project_snapshots WHERE project_id = $1)`,
      [projectId]
    );
    await client.query(`DELETE FROM project_snapshots WHERE project_id = $1`, [
      projectId,
    ]);
    await client.query(
      `DELETE FROM project_clips
       WHERE project_track_id IN (SELECT id FROM project_tracks WHERE project_id = $1)`,
      [projectId]
    );
    await client.query(`DELETE FROM project_tracks WHERE project_id = $1`, [
      projectId,
    ]);
    await client.query(`DELETE FROM project_assets WHERE project_id = $1`, [
      projectId,
    ]);
    // Members, invites, locks, ws rows CASCADE from projects;
    // invite-linked notifications CASCADE from project_invites.
    await client.query(`DELETE FROM projects WHERE id = $1`, [projectId]);

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  const keys = [];
  for (const asset of assetsResult.rows) {
    if (
      asset.storage_key &&
      asset.storage_key !== 'pending' &&
      !String(asset.storage_key).startsWith('temp/')
    ) {
      keys.push({ Key: asset.storage_key });
    }
    if (asset.waveform_url) {
      keys.push({ Key: asset.waveform_url });
    }
  }

  for (let i = 0; i < keys.length; i += 1000) {
    const chunk = keys.slice(i, i + 1000);
    if (chunk.length === 0) continue;
    try {
      const result = await s3Client.send(
        new DeleteObjectsCommand({
          Bucket: process.env.R2_BUCKET,
          Delete: { Objects: chunk, Quiet: true },
        })
      );
      if (result.Errors?.length) {
        for (const error of result.Errors) {
          console.error(
            `Failed to delete R2 object ${error.Key}:`,
            error.Message
          );
        }
      }
    } catch (r2Err) {
      console.error('Project delete R2 cleanup failed:', r2Err.message);
    }
  }

  try {
    if (project.team_id) {
      await reconcileTeamProjects(project.team_id);
    } else if (project.camp_id) {
      await reconcileCampProjects(project.camp_id);
    } else {
      await reconcileOwnerProjects(project.owner_id);
    }
  } catch (reconcileErr) {
    console.error(
      'Project delete limit reconciliation failed:',
      reconcileErr.message
    );
  }

  return { ok: true, projectGuid: project.guid };
}
