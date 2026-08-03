/** Max bytes for persisted project asset audio cache (default 1 GB). Set to 0 to disable. */
export const PROJECT_ASSET_CACHE_MAX_BYTES = 1024 * 1024 * 1024;

export const PROCESSING_POLL_INTERVAL_MS = 3000;
export const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
export const CLIP_PERSIST_DEBOUNCE_MS = 500;
export const PLUGIN_AUTO_SYNC_DEBOUNCE_MS = 500;
export const PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY = 'project_plugin_auto_sync_enabled';
/** localStorage key prefix for per-project track mute/solo (client-only). */
export const PROJECT_TRACK_MUTE_SOLO_STORAGE_KEY = 'project_track_mute_solo';

/** Must match `api/lambda/src/projectWs/projectWsConfig.js`. */
export const PROJECT_WS_PROTOCOL_VERSION = 1;
export const PROJECT_WS_DEV_PORT = 5003;
export const PROJECT_PRESENCE_HEARTBEAT_MS = 30_000;
/** Debounced hover before acquiring destination track lock during cross-track drag. */
export const CROSS_TRACK_LOCK_DEBOUNCE_MS = 150;

export function getProjectWsUrl() {
  if (process.env.NEXT_PUBLIC_PROJECT_WS_URL) {
    return process.env.NEXT_PUBLIC_PROJECT_WS_URL;
  }
  if (process.env.NODE_ENV === 'development') {
    return `ws://localhost:${PROJECT_WS_DEV_PORT}`;
  }
  return '';
}
