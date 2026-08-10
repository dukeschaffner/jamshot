/**
 * Project-specific thin wrappers over the shared entity sync gate.
 */
import {
  PLUGIN_SYNC_GATE,
  PROJECT_NOT_LOADED_IN_PLUGIN_ERROR,
  PROJECT_SYNC_GATE_CONFIG,
  canAutoSyncEntityToPlugin,
  createInitialPluginSyncGate as createInitialSharedGate,
  isMatchingPluginEntityReady,
  reducePluginEntitySyncGate,
} from '@/components/DAW/pluginSync/pluginEntitySyncGate';

export { PLUGIN_SYNC_GATE, PROJECT_NOT_LOADED_IN_PLUGIN_ERROR };

export function createInitialPluginSyncGate() {
  return createInitialSharedGate(PROJECT_SYNC_GATE_CONFIG.entityIdField);
}

export function isProjectNotLoadedInPluginError(error) {
  return PROJECT_SYNC_GATE_CONFIG.isNotLoadedError(error);
}

export function reducePluginSyncGate(gate, event) {
  return reducePluginEntitySyncGate(
    gate,
    {
      type: event?.type,
      entityId: event?.projectId ?? null,
      error: event?.error ?? null,
      status: event?.status,
    },
    PROJECT_SYNC_GATE_CONFIG
  );
}

export function canAutoSyncProjectToPlugin(gate, projectGuid, connectionStatus) {
  return canAutoSyncEntityToPlugin(
    gate,
    projectGuid,
    connectionStatus,
    PROJECT_SYNC_GATE_CONFIG.entityIdField
  );
}

export function isMatchingPluginProjectReady(gate, projectGuid) {
  return isMatchingPluginEntityReady(
    gate,
    projectGuid,
    PROJECT_SYNC_GATE_CONFIG.entityIdField
  );
}
