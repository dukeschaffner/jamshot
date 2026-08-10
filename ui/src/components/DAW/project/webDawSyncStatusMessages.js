export function buildWebDawSyncStatusMessage({ syncing }) {
  return {
    type: 'web_daw_sync_status',
    syncing: Boolean(syncing),
  };
}
