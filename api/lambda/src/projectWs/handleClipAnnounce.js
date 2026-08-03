import pool from '../config/db.js';
import {
  getConnectionAuthUserId,
  getConnectionProjectId,
  removeProjectConnection,
} from './projectWsConnections.js';
import { checkProjectAccess, hasMinimumProjectRole } from '../utils/projectAccess.js';
import { sendWsMessage } from './projectWsApiGateway.js';
import { broadcastProjectOpEvent } from './projectWsOpBroadcast.js';
import { getGatewayContextFromSendContext } from './projectWsPresence.js';

function parseClipAnnounceMessage(body) {
  let parsedBody = body;
  if (typeof body === 'string') {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return { ok: false, error: 'Invalid JSON message' };
    }
  }

  if (!parsedBody || parsedBody.type !== 'clip_announce') {
    return { ok: false, error: 'Unsupported message type' };
  }

  const clipIdRaw = parsedBody.clipId ?? parsedBody.clip_id;
  const revisionRaw = parsedBody.revision;

  const clipId = typeof clipIdRaw === 'string' ? parseInt(clipIdRaw, 10) : Number(clipIdRaw);
  if (!Number.isInteger(clipId) || clipId < 1) {
    return { ok: false, error: 'clipId must be a positive integer' };
  }

  const revision =
    typeof revisionRaw === 'string' ? parseInt(revisionRaw, 10) : Number(revisionRaw);
  if (!Number.isInteger(revision) || revision < 1) {
    return { ok: false, error: 'revision must be a positive integer' };
  }

  return { ok: true, clipId, revision };
}

/**
 * Rebroadcast a REST-created clip to project peers as a `clip.create` op.
 *
 * The clip row and revision bump already happened via REST; this only notifies
 * other windows so their remote-op queues can catch up.
 *
 * @param {object} params
 * @param {string} params.connectionId
 * @param {string|object|null} params.body
 * @param {import('./projectWsApiGateway.js').WsSendContext} params.sendContext
 */
export async function handleClipAnnounceMessage({ connectionId, body, sendContext }) {
  const parsed = parseClipAnnounceMessage(body);
  if (!parsed.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'VALIDATION_ERROR',
      message: parsed.error,
    });
    return { statusCode: 400 };
  }

  const userId = await getConnectionAuthUserId(connectionId);
  if (!userId) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });
    return { statusCode: 401 };
  }

  const projectId = await getConnectionProjectId(connectionId);
  if (projectId == null) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'VALIDATION_ERROR',
      message: 'Join a project before announcing clips',
    });
    return { statusCode: 400 };
  }

  const access = await checkProjectAccess(projectId, userId);
  if (!access.hasAccess) {
    await removeProjectConnection(connectionId);
    await sendWsMessage(sendContext, {
      type: 'error',
      code: access.status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_REVOKED',
      message: access.error,
    });
    return { statusCode: access.status };
  }

  if (!hasMinimumProjectRole(access.role, 'editor')) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'ACCESS_DENIED',
      message: 'Editor access required',
    });
    return { statusCode: 403 };
  }

  const clipResult = await pool.query(
    `SELECT pc.id,
            pc.project_track_id,
            pc.asset_id,
            pa.processing_status,
            p.revision AS project_revision
     FROM project_clips pc
     JOIN project_tracks pt ON pt.id = pc.project_track_id
     JOIN project_assets pa ON pa.id = pc.asset_id
     JOIN projects p ON p.id = pt.project_id
     WHERE pc.id = $1
       AND pt.project_id = $2
       AND pc.deleted_at IS NULL`,
    [parsed.clipId, projectId]
  );

  if (clipResult.rows.length === 0) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'NOT_FOUND',
      message: 'Clip not found',
    });
    return { statusCode: 404 };
  }

  const clip = clipResult.rows[0];
  const projectRevision = Number(clip.project_revision);

  if (parsed.revision > projectRevision) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'VALIDATION_ERROR',
      message: 'revision is ahead of the project',
    });
    return { statusCode: 400 };
  }

  if (clip.processing_status !== 'completed') {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'NOT_READY',
      message: 'Clip asset is not ready yet',
    });
    return { statusCode: 409 };
  }

  const gatewayContext = getGatewayContextFromSendContext(sendContext);
  await broadcastProjectOpEvent(
    projectId,
    {
      type: 'op',
      fromUserId: userId,
      revision: parsed.revision,
      payload: {
        kind: 'clip.create',
        clipId: Number(clip.id),
        trackId: Number(clip.project_track_id),
        assetId: Number(clip.asset_id),
      },
    },
    gatewayContext,
    { excludeConnectionId: connectionId }
  );

  return { statusCode: 200 };
}
