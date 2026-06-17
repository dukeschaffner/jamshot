export const PROCESSING_POLL_INTERVAL_MS = 3000;
export const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
export const CLIP_PERSIST_DEBOUNCE_MS = 500;
export const PLUGIN_AUTO_SYNC_DEBOUNCE_MS = 500;
export const PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY = 'project_plugin_auto_sync_enabled';

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
