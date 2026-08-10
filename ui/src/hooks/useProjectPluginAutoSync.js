'use client';

import { useCallback } from 'react';
import { usePluginWebSocket } from '@/contexts/PluginWebSocketContext';
import { PLUGIN_AUTO_SYNC_DEBOUNCE_MS, PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY } from '@/components/DAW/project/ProjectsConfig';
import { fetchProjectPluginPayload } from '@/components/DAW/project/projectPluginSyncApi';
import { buildProjectSyncMessage } from '@/components/DAW/project/projectPluginSyncMessages';
import { PROJECT_SYNC_GATE_CONFIG } from '@/components/DAW/pluginSync/pluginEntitySyncGate';
import { usePluginEntityAutoSync } from '@/hooks/usePluginEntityAutoSync';

/**
 * Debounced project_sync to the local plugin after REST saves (Step 31).
 * Default auto-sync on; manual sync always available via syncToPluginNow.
 */
export function useProjectPluginAutoSync({ projectGuid, canEdit }) {
  const { send } = usePluginWebSocket();

  const runSync = useCallback(
    async ({ silentSuccess = false } = {}) => {
      if (!projectGuid) return false;
      const payload = await fetchProjectPluginPayload(projectGuid);
      const message = buildProjectSyncMessage(projectGuid, payload);
      return send(JSON.stringify(message), { silentSuccess });
    },
    [projectGuid, send]
  );

  const getEntityIdFromMessage = useCallback((parsed) => parsed.project_id ?? null, []);

  const {
    autoSyncEnabled,
    setAutoSyncEnabled,
    isPluginStale,
    clearPluginStale,
    notifyEntityMutated,
    syncToPluginNow,
    pluginStatus,
  } = usePluginEntityAutoSync({
    entityId: projectGuid,
    canEdit,
    storageKey: PROJECT_PLUGIN_AUTO_SYNC_STORAGE_KEY,
    debounceMs: PLUGIN_AUTO_SYNC_DEBOUNCE_MS,
    gateConfig: PROJECT_SYNC_GATE_CONFIG,
    getEntityIdFromMessage,
    runSync,
    syncCompleteType: PROJECT_SYNC_GATE_CONFIG.syncCompleteType,
    enabled: true,
  });

  return {
    autoSyncEnabled,
    setAutoSyncEnabled,
    isPluginStale,
    clearPluginStale,
    notifyProjectMutated: notifyEntityMutated,
    syncToPluginNow,
    pluginStatus,
  };
}
