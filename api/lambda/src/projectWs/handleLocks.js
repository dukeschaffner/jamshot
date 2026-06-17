import {
  acquireTrackLock,
  getProjectTrackLocks,
  releaseTrackLock,
  renewTrackLocks,
} from '../utils/projectTrackLocks.js';
import {
  getConnectionAuthUserId,
  getConnectionEditingTrack,
  getConnectionProjectId,
  updateConnectionPresence,
} from './projectWsConnections.js';
import { sendWsMessage } from './projectWsApiGateway.js';
import {
  broadcastProjectLockEvent,
  buildLockMessage,
} from './projectWsLockBroadcast.js';
import { getGatewayContextFromSendContext } from './projectWsPresence.js';

function parseLockResource(body) {
  const resource = body?.resource;
  if (!resource || resource.type !== 'track') {
    return { ok: false, error: 'resource.type must be "track"' };
  }
  const trackId = Number(resource.id);
  if (!Number.isFinite(trackId)) {
    return { ok: false, error: 'resource.id must be a number' };
  }
  return { ok: true, trackId };
}

function parseTrackIdsList(body) {
  const raw = body?.trackIds ?? body?.track_ids;
  if (!Array.isArray(raw)) {
    return { ok: false, error: 'trackIds must be an array' };
  }
  const trackIds = raw.map((id) => Number(id)).filter(Number.isFinite);
  return { ok: true, trackIds };
}

async function requireJoinedConnection(connectionId) {
  const userId = await getConnectionAuthUserId(connectionId);
  if (!userId) {
    return { ok: false, statusCode: 401, error: 'Authentication required' };
  }

  const projectId = await getConnectionProjectId(connectionId);
  if (projectId == null) {
    return { ok: false, statusCode: 400, error: 'Join a project before sending lock messages' };
  }

  return { ok: true, userId, projectId };
}

/**
 * @param {object} params
 * @param {string} params.connectionId
 * @param {string|object|null} params.body
 * @param {import('./projectWsApiGateway.js').WsSendContext} params.sendContext
 */
export async function handleLockAcquireMessage({ connectionId, body, sendContext }) {
  let parsedBody = body;
  if (typeof body === 'string') {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return { statusCode: 400, body: 'Invalid JSON' };
    }
  }

  const resource = parseLockResource(parsedBody);
  if (!resource.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'VALIDATION_ERROR',
      message: resource.error,
    });
    return { statusCode: 400 };
  }

  const joined = await requireJoinedConnection(connectionId);
  if (!joined.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: joined.statusCode === 401 ? 'AUTHENTICATION_REQUIRED' : 'VALIDATION_ERROR',
      message: joined.error,
    });
    return { statusCode: joined.statusCode };
  }

  const result = await acquireTrackLock({
    projectId: joined.projectId,
    trackId: resource.trackId,
    userId: joined.userId,
    connectionId,
  });

  if (!result.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: result.code,
      message: result.message,
      resource: { type: 'track', id: resource.trackId },
    });
    return { statusCode: result.code === 'NOT_FOUND' ? 404 : 403 };
  }

  await updateConnectionPresence(connectionId, resource.trackId);

  const lockPayload = buildLockMessage(resource.trackId, joined.userId, 'acquired');
  const gatewayContext = getGatewayContextFromSendContext(sendContext);
  await broadcastProjectLockEvent(joined.projectId, lockPayload, gatewayContext);

  return { statusCode: 200 };
}

/**
 * @param {object} params
 * @param {string} params.connectionId
 * @param {string|object|null} params.body
 * @param {import('./projectWsApiGateway.js').WsSendContext} params.sendContext
 */
export async function handleLockReleaseMessage({ connectionId, body, sendContext }) {
  let parsedBody = body;
  if (typeof body === 'string') {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return { statusCode: 400, body: 'Invalid JSON' };
    }
  }

  const resource = parseLockResource(parsedBody);
  if (!resource.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'VALIDATION_ERROR',
      message: resource.error,
    });
    return { statusCode: 400 };
  }

  const joined = await requireJoinedConnection(connectionId);
  if (!joined.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: joined.statusCode === 401 ? 'AUTHENTICATION_REQUIRED' : 'VALIDATION_ERROR',
      message: joined.error,
    });
    return { statusCode: joined.statusCode };
  }

  const result = await releaseTrackLock({
    projectId: joined.projectId,
    trackId: resource.trackId,
    userId: joined.userId,
    connectionId,
  });

  if (result.released) {
    const lockPayload = buildLockMessage(resource.trackId, joined.userId, 'released');
    const gatewayContext = getGatewayContextFromSendContext(sendContext);
    await broadcastProjectLockEvent(joined.projectId, lockPayload, gatewayContext);
  }

  const editingTrackId = await getConnectionEditingTrack(connectionId);
  await updateConnectionPresence(connectionId, editingTrackId);

  return { statusCode: 200 };
}

/**
 * @param {object} params
 * @param {string} params.connectionId
 * @param {string|object|null} params.body
 */
export async function handleLockHeartbeatMessage({ connectionId, body }) {
  let parsedBody = body;
  if (typeof body === 'string') {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return { statusCode: 400, body: 'Invalid JSON' };
    }
  }

  const trackIdsParsed = parseTrackIdsList(parsedBody);
  if (!trackIdsParsed.ok) {
    return { statusCode: 400, body: trackIdsParsed.error };
  }

  const joined = await requireJoinedConnection(connectionId);
  if (!joined.ok) {
    return { statusCode: joined.statusCode, body: joined.error };
  }

  await renewTrackLocks({
    projectId: joined.projectId,
    connectionId,
    userId: joined.userId,
    trackIds: trackIdsParsed.trackIds,
  });

  return { statusCode: 200 };
}

/**
 * Send active lock snapshots to a single connection after join.
 *
 * @param {number} projectId
 * @param {import('./projectWsApiGateway.js').WsSendContext} sendContext
 */
export async function sendActiveLocksToConnection(projectId, sendContext) {
  const locks = await getProjectTrackLocks(projectId);
  for (const lock of locks) {
    await sendWsMessage(
      sendContext,
      buildLockMessage(lock.trackId, lock.userId, 'acquired')
    );
  }
}
