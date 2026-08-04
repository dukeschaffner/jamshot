import { serializeProjectState } from '../utils/projectUtils.js';
import { sendWsMessage } from './projectWsApiGateway.js';

/**
 * Whether a joining client needs a full project snapshot (no op diff in MVP).
 *
 * Sends when the client revision is unknown or behind the server revision.
 *
 * @param {number|null|undefined} clientRevision
 * @param {number|null|undefined} serverRevision
 */
export function shouldSendFullStateOnJoin(clientRevision, serverRevision) {
  if (serverRevision == null || !Number.isFinite(Number(serverRevision))) {
    return false;
  }

  const server = Number(serverRevision);
  if (clientRevision == null || !Number.isFinite(Number(clientRevision))) {
    return true;
  }

  return Number(clientRevision) < server;
}

/**
 * Push full REST-shaped project state to a single connection after join.
 *
 * @param {number} projectId
 * @param {number} serverRevision
 * @param {import('./projectWsApiGateway.js').WsSendContext} sendContext
 */
export async function sendFullStateOnJoin(projectId, serverRevision, sendContext) {
  const project = await serializeProjectState(projectId, { variant: 'rest' });
  if (!project) {
    return;
  }

  await sendWsMessage(sendContext, {
    type: 'state',
    revision: serverRevision,
    project,
  });
}
