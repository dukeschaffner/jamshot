export const PROJECT_WS_PROTOCOL_VERSION = 1;

/** Default local dev port for the project sync WebSocket server. */
export const PROJECT_WS_DEV_PORT = 5003;

/**
 * Hard cap on live sockets per project room (infra safety valve).
 * Membership seats are enforced at invite/accept — not here.
 */
export const PROJECT_WS_MAX_CONNECTIONS_PER_PROJECT = 50;

/**
 * Drop connection rows whose last_seen_at is older than this.
 * Client presence heartbeat is 30s; allow a few missed beats before pruning.
 */
export const PROJECT_WS_CONNECTION_STALE_SECONDS = 120;
