import pool from '../config/db.js';
import {
  LOCK_DISCONNECT_GRACE_SECONDS,
  shortenLocksOnDisconnect,
} from '../utils/projectTrackLocks.js';
import { shortenMetadataLockOnDisconnect } from '../utils/projectMetadataLocks.js';
import { PROJECT_WS_CONNECTION_STALE_SECONDS } from './projectWsConfig.js';

/**
 * Remove project room rows that missed disconnect (server restart, crash, etc.).
 * Also shortens any locks held by those connections and drops orphan auth rows.
 *
 * @param {number} projectId
 * @returns {Promise<string[]>} pruned connection ids
 */
export async function pruneStaleProjectConnections(projectId) {
  const result = await pool.query(
    `DELETE FROM project_ws_connections
     WHERE project_id = $1
       AND last_seen_at < NOW() - ($2::int * INTERVAL '1 second')
     RETURNING connection_id`,
    [projectId, PROJECT_WS_CONNECTION_STALE_SECONDS]
  );

  const connectionIds = result.rows.map((row) => row.connection_id);
  if (connectionIds.length === 0) {
    return [];
  }

  await Promise.all(
    connectionIds.map(async (connectionId) => {
      await shortenLocksOnDisconnect(connectionId);
      await shortenMetadataLockOnDisconnect(connectionId, LOCK_DISCONNECT_GRACE_SECONDS);
    })
  );

  await pool.query(
    `DELETE FROM project_ws_connection_auth WHERE connection_id = ANY($1::varchar[])`,
    [connectionIds]
  );

  return connectionIds;
}
