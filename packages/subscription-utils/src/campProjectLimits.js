import { TEAM_CAMP_PROJECT_STORAGE_BYTES } from './projectConfig.js';

/**
 * Camp project counts differ from team plans (limits.md).
 * Keys match camps.product_version. 5_users is not in limits.md —
 * uses the same project count as the 5-user team row (20).
 */
export const CAMP_PROJECT_LIMITS = {
  '5_users': {
    max_projects: 20,
    max_snapshots: 10,
    max_project_storage_bytes: TEAM_CAMP_PROJECT_STORAGE_BYTES,
  },
  '10_users': {
    max_projects: 50,
    max_snapshots: 10,
    max_project_storage_bytes: TEAM_CAMP_PROJECT_STORAGE_BYTES,
  },
  '25_users': {
    max_projects: 150,
    max_snapshots: 10,
    max_project_storage_bytes: TEAM_CAMP_PROJECT_STORAGE_BYTES,
  },
  '50_users': {
    max_projects: 300,
    max_snapshots: 10,
    max_project_storage_bytes: TEAM_CAMP_PROJECT_STORAGE_BYTES,
  },
  '100_users': {
    max_projects: 600,
    max_snapshots: 10,
    max_project_storage_bytes: TEAM_CAMP_PROJECT_STORAGE_BYTES,
  },
};

/**
 * @param {string} productVersion
 * @returns {{ max_projects: number, max_snapshots: number, max_project_storage_bytes: number } | null}
 */
export function getCampProjectLimitsByVersion(productVersion) {
  return CAMP_PROJECT_LIMITS[productVersion] || null;
}
