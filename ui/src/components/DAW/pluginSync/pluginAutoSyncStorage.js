/**
 * Read/write localStorage auto-sync preference. Default is enabled (true)
 * unless the stored value is explicitly 'false'.
 */
export function readPluginAutoSyncEnabled(storageKey) {
  if (typeof window === 'undefined') return true;
  return localStorage.getItem(storageKey) !== 'false';
}

export function writePluginAutoSyncEnabled(storageKey, enabled) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(storageKey, enabled ? 'true' : 'false');
}
