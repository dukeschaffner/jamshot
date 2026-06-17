import {
  getConnectionAuthUserId,
  getConnectionProjectId,
} from './projectWsConnections.js';
import { checkProjectAccess, hasMinimumProjectRole } from '../utils/projectAccess.js';
import { executeProjectOp } from '../utils/projectOpMutations.js';
import {
  getDedupedOpRevision,
  pruneOldOpDedupRows,
  recordDedupedOp,
} from '../utils/projectWsOpDedup.js';
import { sendWsMessage } from './projectWsApiGateway.js';
import { broadcastProjectOpEvent } from './projectWsOpBroadcast.js';
import { getGatewayContextFromSendContext } from './projectWsPresence.js';

function parseOpMessage(body) {
  let parsedBody = body;
  if (typeof body === 'string') {
    try {
      parsedBody = JSON.parse(body);
    } catch {
      return { ok: false, error: 'Invalid JSON message' };
    }
  }

  if (!parsedBody || parsedBody.type !== 'op') {
    return { ok: false, error: 'Unsupported message type' };
  }

  const opId = parsedBody.opId ?? parsedBody.op_id;
  const baseRevisionRaw = parsedBody.baseRevision ?? parsedBody.base_revision;
  const payload = parsedBody.payload;

  if (opId == null || String(opId).trim() === '') {
    return { ok: false, error: 'opId is required' };
  }

  const baseRevision =
    typeof baseRevisionRaw === 'string' ? parseInt(baseRevisionRaw, 10) : Number(baseRevisionRaw);
  if (!Number.isInteger(baseRevision) || baseRevision < 1) {
    return { ok: false, error: 'baseRevision must be a positive integer' };
  }

  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'payload is required' };
  }

  return {
    ok: true,
    opId: String(opId).trim(),
    baseRevision,
    payload,
  };
}

async function requireEditorJoinedConnection(connectionId) {
  const userId = await getConnectionAuthUserId(connectionId);
  if (!userId) {
    return { ok: false, statusCode: 401, error: 'Authentication required' };
  }

  const projectId = await getConnectionProjectId(connectionId);
  if (projectId == null) {
    return { ok: false, statusCode: 400, error: 'Join a project before sending ops' };
  }

  const access = await checkProjectAccess(projectId, userId);
  if (!access.hasAccess) {
    return {
      ok: false,
      statusCode: access.status,
      error: access.error,
      code: access.status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
    };
  }

  if (!hasMinimumProjectRole(access.role, 'editor')) {
    return {
      ok: false,
      statusCode: 403,
      error: 'Editor access required',
      code: 'ACCESS_DENIED',
    };
  }

  return { ok: true, userId, projectId, role: access.role };
}

/**
 * @param {object} params
 * @param {string} params.connectionId
 * @param {string|object|null} params.body
 * @param {import('./projectWsApiGateway.js').WsSendContext} params.sendContext
 */
export async function handleOpMessage({ connectionId, body, sendContext }) {
  const parsed = parseOpMessage(body);
  if (!parsed.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: 'VALIDATION_ERROR',
      message: parsed.error,
    });
    return { statusCode: 400 };
  }

  const joined = await requireEditorJoinedConnection(connectionId);
  if (!joined.ok) {
    await sendWsMessage(sendContext, {
      type: 'error',
      code: joined.code ?? 'VALIDATION_ERROR',
      message: joined.error,
    });
    return { statusCode: joined.statusCode };
  }

  await pruneOldOpDedupRows();

  const existingRevision = await getDedupedOpRevision(connectionId, parsed.opId);
  if (existingRevision != null) {
    await sendWsMessage(sendContext, {
      type: 'op_ack',
      opId: parsed.opId,
      revision: existingRevision,
    });
    return { statusCode: 200 };
  }

  const result = await executeProjectOp({
    projectId: joined.projectId,
    userId: joined.userId,
    connectionId,
    baseRevision: parsed.baseRevision,
    payload: parsed.payload,
  });

  if (!result.ok) {
    await sendWsMessage(sendContext, {
      type: 'op_nack',
      opId: parsed.opId,
      code: result.code,
      message: result.message,
      ...(result.currentRevision != null ? { currentRevision: result.currentRevision } : {}),
    });
    const statusCode =
      result.code === 'REVISION_MISMATCH'
        ? 409
        : result.code === 'LOCK_DENIED'
          ? 403
          : result.code === 'NOT_FOUND'
            ? 404
            : 400;
    return { statusCode };
  }

  await recordDedupedOp({
    connectionId,
    opId: parsed.opId,
    revision: result.revision,
  });

  await sendWsMessage(sendContext, {
    type: 'op_ack',
    opId: parsed.opId,
    revision: result.revision,
  });

  const gatewayContext = getGatewayContextFromSendContext(sendContext);
  await broadcastProjectOpEvent(
    joined.projectId,
    {
      type: 'op',
      fromUserId: joined.userId,
      revision: result.revision,
      payload: result.broadcastPayload,
    },
    gatewayContext
  );

  return { statusCode: 200 };
}
