import {
  MAX_PROJECT_DURATION_SECONDS,
  MAX_PROJECT_TRACKS,
  MAX_TEAM_CAMP_COLLABORATORS,
  TEAM_CAMP_PROJECT_STORAGE_BYTES,
} from './projectConfig.js';
import { getCampProjectLimitsByVersion } from './campProjectLimits.js';

/**
 * Team/camp projects: min(actual member count, global cap).
 * @param {number} memberCount
 */
export function getEffectiveMaxMembers(memberCount) {
  return Math.min(memberCount, MAX_TEAM_CAMP_COLLABORATORS);
}

/**
 * Project limits for personal, team, or camp context.
 *
 * @param {Object} context
 * @param {'personal'|'team'|'camp'} context.type
 * @param {Object} [context.user] - required when type is 'personal'
 * @param {string} [context.productVersion] - team/camp product_version (e.g. '25_users')
 * @param {number} [context.memberCount] - active team/camp members (for effective_max_members)
 * @param {Object} deps - plan resolvers (avoids circular import with index.js)
 * @param {Function} deps.getUserPlan
 * @param {Function} deps.getTeamPlan
 */
export function resolveProjectLimits(context, { getUserPlan, getTeamPlan }) {
  const base = {
    max_tracks: MAX_PROJECT_TRACKS,
    max_duration_seconds: MAX_PROJECT_DURATION_SECONDS,
  };

  if (context.type === 'personal') {
    if (!context.user) {
      throw new Error('getProjectLimits: user is required for personal context');
    }
    const {
      max_projects,
      max_project_members,
      max_snapshots,
      max_project_storage_bytes,
    } = getUserPlan(context.user).limits;
    return {
      ...base,
      max_projects,
      max_project_members,
      max_snapshots,
      max_project_storage_bytes,
      effective_max_members: max_project_members,
    };
  }

  if (context.type === 'team') {
    const plan = getTeamPlan(context.productVersion);
    if (!plan) {
      throw new Error(`getProjectLimits: invalid product version "${context.productVersion}"`);
    }
    const memberCount = context.memberCount ?? 0;
    return {
      ...base,
      max_projects: plan.limits.max_projects,
      max_snapshots: plan.limits.max_snapshots,
      max_project_storage_bytes:
        plan.limits.max_project_storage_bytes ?? TEAM_CAMP_PROJECT_STORAGE_BYTES,
      max_project_members: null,
      effective_max_members: getEffectiveMaxMembers(memberCount),
    };
  }

  if (context.type === 'camp') {
    const campLimits = getCampProjectLimitsByVersion(context.productVersion);
    if (!campLimits) {
      throw new Error(`getProjectLimits: invalid camp product version "${context.productVersion}"`);
    }
    const memberCount = context.memberCount ?? 0;
    return {
      ...base,
      max_projects: campLimits.max_projects,
      max_snapshots: campLimits.max_snapshots,
      max_project_storage_bytes: campLimits.max_project_storage_bytes,
      max_project_members: null,
      effective_max_members: getEffectiveMaxMembers(memberCount),
    };
  }

  throw new Error(`getProjectLimits: unknown context type "${context.type}"`);
}

/**
 * Camp product_version → project limits (distinct from team plans).
 * @param {string} productVersion
 */
export function getCampProjectLimits(productVersion) {
  return getCampProjectLimitsByVersion(productVersion);
}
