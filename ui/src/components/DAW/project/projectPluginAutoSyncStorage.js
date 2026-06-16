import { PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY } from './ProjectsConfig';

export function readProjectPluginAutoSyncEnabled() {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY) !== 'false';
}

export function writeProjectPluginAutoSyncEnabled(enabled) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY, enabled ? 'true' : 'false');
}
