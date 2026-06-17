import {
  getConnectionEditingTrack,
  getConnectionProjectId,
  touchConnectionLastSeen,
  updateConnectionPresence,
} from './projectWsConnections.js';
import {
  broadcastProjectPresence,
  getGatewayContextFromSendContext,
} from './projectWsPresence.js';

function parsePresenceMessage(body) {
  let parsed;
  try {
    parsed = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return { ok: false, error: 'Invalid JSON message' };
  }

  if (!parsed || parsed.type !== 'presence') {
    return { ok: false, error: 'Unsupported message type' };
  }

  const editingTrackIdRaw = parsed.editingTrackId ?? parsed.editing_track_id;
  let editingTrackId;
  if (editingTrackIdRaw === undefined) {
    editingTrackId = undefined;
  } else if (editingTrackIdRaw === null || editingTrackIdRaw === '') {
    editingTrackId = null;
  } else {
    const numeric = Number(editingTrackIdRaw);
    if (!Number.isFinite(numeric)) {
      return { ok: false, error: 'editingTrackId must be a number' };
    }
    editingTrackId = numeric;
  }

  return { ok: true, editingTrackId };
}

/**
 * Handle a `presence` heartbeat — touch last_seen_at and rebroadcast when editingTrackId changes.
 *
 * @param {object} params
 * @param {string} params.connectionId
 * @param {string|object|null} params.body
 * @param {import('./projectWsApiGateway.js').WsSendContext} params.sendContext
 */
export async function handlePresenceMessage({ connectionId, body, sendContext }) {
  const parsed = parsePresenceMessage(body);
  if (!parsed.ok) {
    return { statusCode: 400, body: parsed.error };
  }

  const projectId = await getConnectionProjectId(connectionId);
  if (projectId == null) {
    return { statusCode: 400, body: 'Join a project before sending presence' };
  }

  const previousEditingTrackId = await getConnectionEditingTrack(connectionId);

  if (parsed.editingTrackId !== undefined) {
    await updateConnectionPresence(connectionId, parsed.editingTrackId);

    if (previousEditingTrackId !== parsed.editingTrackId) {
      const gatewayContext = getGatewayContextFromSendContext(sendContext);
      await broadcastProjectPresence(projectId, gatewayContext);
    }
  } else {
    await touchConnectionLastSeen(connectionId);
  }

  return { statusCode: 200 };
}
