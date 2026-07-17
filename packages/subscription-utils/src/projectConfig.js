// Project-wide constants (not tier-specific). Single source of truth for API and UI.

export const MAX_PROJECT_DURATION_SECONDS = 300;
export const MAX_PROJECT_TRACKS = 20;
export const MAX_TEAM_CAMP_COLLABORATORS = 25;
export const LOCK_TTL_SECONDS = 60;
export const LOCK_HEARTBEAT_INTERVAL_SECONDS = 15;
export const AUTO_SNAPSHOT_INTERVAL_SECONDS = 300;
export const SOFT_DELETE_CLIPS = true;
export const ASSET_UNUSED_WARNING_DAYS = 7;
export const ASSET_AUTO_DELETE_GRACE_DAYS = 30;
export const PROCESSING_ASSET_GRACE_SECONDS = 172800; // 48 hours
export const INVITE_DEFAULT_EXPIRY_DAYS = 7;

/** Bytes in one gigabyte (for storage limit conversions). */
export const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Team/camp project storage cap (30 GB). */
export const TEAM_CAMP_PROJECT_STORAGE_BYTES = 30 * BYTES_PER_GB;

/** Days after access revocation before hard-delete of excess/expired projects. */
export const PROJECT_RETENTION_GRACE_DAYS = 30;

/**
 * Minimum days from now until scheduled_deletion_at so both 7-day and 1-day
 * warning emails can always be sent.
 */
export const PROJECT_RETENTION_MIN_SCHEDULE_DAYS = 8;
