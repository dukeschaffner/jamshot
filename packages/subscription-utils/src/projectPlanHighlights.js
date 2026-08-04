import { BYTES_PER_GB, MAX_TEAM_CAMP_COLLABORATORS } from './projectConfig.js';

function formatCountLimit(limit) {
  if (limit === -1) return 'Unlimited';
  return String(limit);
}

function formatStorageLimit(bytes) {
  if (bytes === -1) return 'Unlimited';
  if (bytes == null) return '—';
  const gb = bytes / BYTES_PER_GB;
  return gb % 1 === 0 ? `${gb} GB` : `${gb.toFixed(1)} GB`;
}

function getCollaboratorLimit(plan) {
  if (plan.limits?.max_project_members != null) {
    return plan.limits.max_project_members;
  }
  const teamSize = plan.max_users ?? plan.limits?.max_users;
  if (teamSize === -1) return MAX_TEAM_CAMP_COLLABORATORS;
  return Math.min(teamSize, MAX_TEAM_CAMP_COLLABORATORS);
}

/**
 * Project feature rows for pricing / subscribe UI.
 * @param {Object} plan - SUBSCRIPTION_PLANS or TEAM_PLANS entry
 * @returns {Array<{ label: string, included: boolean }>}
 */
export function getProjectPlanFeatures(plan) {
  const limits = plan.limits || {};
  const features = plan.features || {};
  const maxProjects = limits.max_projects;
  const maxMembers = getCollaboratorLimit(plan);
  const storageBytes = limits.max_project_storage_bytes;

  const ownedLabel =
    maxProjects === -1
      ? 'Unlimited owned projects'
      : `${formatCountLimit(maxProjects)} owned project${maxProjects === 1 ? '' : 's'}`;

  return [
    { label: ownedLabel, included: true },
    {
      label: `Up to ${formatCountLimit(maxMembers)} collaborators per project`,
      included: true,
    },
    {
      label: `${formatStorageLimit(storageBytes)} storage per project`,
      included: true,
    },
    { label: 'Live collaboration', included: true },
    { label: 'Version history', included: Boolean(features.version_history) },
    { label: 'File export', included: Boolean(features.file_export) },
  ];
}
