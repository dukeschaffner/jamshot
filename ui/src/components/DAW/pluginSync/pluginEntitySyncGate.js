export const PLUGIN_SYNC_GATE = {
  UNKNOWN: 'unknown',
  READY: 'ready',
  NOT_READY: 'not_ready',
};

/**
 * @typedef {object} PluginEntitySyncGateConfig
 * @property {string} entityIdField - Gate state field name (e.g. 'loadedProjectId')
 * @property {string} statusMessageType - e.g. 'plugin_project_status'
 * @property {string} loadCompleteType - e.g. 'project_load_complete'
 * @property {string} syncCompleteType - e.g. 'project_sync_complete'
 * @property {string} syncErrorType - e.g. 'project_sync_error'
 * @property {string} loadErrorType - e.g. 'project_load_error'
 * @property {(error: unknown) => boolean} isNotLoadedError
 */

export function createInitialPluginSyncGate(entityIdField = 'loadedEntityId') {
  return {
    status: PLUGIN_SYNC_GATE.UNKNOWN,
    [entityIdField]: null,
  };
}

function toNotReady(gate, entityIdField) {
  if (gate.status === PLUGIN_SYNC_GATE.NOT_READY && gate[entityIdField] == null) {
    return gate;
  }
  return {
    status: PLUGIN_SYNC_GATE.NOT_READY,
    [entityIdField]: null,
  };
}

function toReady(gate, entityIdField, entityId) {
  if (gate.status === PLUGIN_SYNC_GATE.READY && gate[entityIdField] === entityId) {
    return gate;
  }
  return {
    status: PLUGIN_SYNC_GATE.READY,
    [entityIdField]: entityId,
  };
}

/**
 * Pure reducer for whether the local plugin has a matching entity ready for sync.
 * UNKNOWN allows a single probe after (re)connect; NOT_READY blocks until a
 * matching status/load/sync-complete message arrives.
 *
 * @param {object} gate
 * @param {{ type?: string, entityId?: string|null, error?: string|null, status?: string }} event
 * @param {PluginEntitySyncGateConfig} config
 */
export function reducePluginEntitySyncGate(gate, event, config) {
  const {
    entityIdField,
    statusMessageType,
    loadCompleteType,
    syncCompleteType,
    syncErrorType,
    loadErrorType,
    isNotLoadedError,
  } = config;

  switch (event?.type) {
    case 'connection': {
      if (gate.status === PLUGIN_SYNC_GATE.UNKNOWN && gate[entityIdField] == null) {
        return gate;
      }
      return createInitialPluginSyncGate(entityIdField);
    }
    case statusMessageType: {
      const entityId = event.entityId || null;
      if (!entityId) {
        return toNotReady(gate, entityIdField);
      }
      return toReady(gate, entityIdField, entityId);
    }
    case loadCompleteType:
    case syncCompleteType: {
      const entityId = event.entityId || null;
      if (!entityId) {
        return createInitialPluginSyncGate(entityIdField);
      }
      return toReady(gate, entityIdField, entityId);
    }
    case syncErrorType: {
      if (!isNotLoadedError?.(event.error)) {
        return gate;
      }
      return toNotReady(gate, entityIdField);
    }
    case loadErrorType: {
      const failedId = event.entityId || null;
      if (failedId && gate[entityIdField] && gate[entityIdField] !== failedId) {
        return gate;
      }
      return toNotReady(gate, entityIdField);
    }
    default:
      return gate;
  }
}

export function canAutoSyncEntityToPlugin(gate, entityId, connectionStatus, entityIdField) {
  if (connectionStatus !== 'connected' || !entityId) return false;

  if (gate.status === PLUGIN_SYNC_GATE.NOT_READY) return false;

  if (gate.status === PLUGIN_SYNC_GATE.READY) {
    return gate[entityIdField] === entityId;
  }

  // UNKNOWN: allow one probe so a page refresh with the entity already loaded still works.
  return true;
}

export function isMatchingPluginEntityReady(gate, entityId, entityIdField) {
  return (
    Boolean(entityId) &&
    gate?.status === PLUGIN_SYNC_GATE.READY &&
    gate[entityIdField] === entityId
  );
}

/** Project-specific config + thin wrappers for existing callers. */
export const PROJECT_SYNC_GATE_CONFIG = {
  entityIdField: 'loadedProjectId',
  statusMessageType: 'plugin_project_status',
  loadCompleteType: 'project_load_complete',
  syncCompleteType: 'project_sync_complete',
  syncErrorType: 'project_sync_error',
  loadErrorType: 'project_load_error',
  isNotLoadedError: (error) =>
    typeof error === 'string' && error.includes('No matching project loaded in plugin'),
};

export const TRACK_SYNC_GATE_CONFIG = {
  entityIdField: 'loadedTrackId',
  statusMessageType: 'plugin_track_status',
  loadCompleteType: 'track_load_complete',
  syncCompleteType: 'stem_metadata_sync_complete',
  syncErrorType: 'stem_metadata_sync_error',
  loadErrorType: 'track_load_error',
  isNotLoadedError: (error) =>
    typeof error === 'string' && error.includes('No matching track loaded in plugin'),
};

export const PROJECT_NOT_LOADED_IN_PLUGIN_ERROR =
  'No matching project loaded in plugin. Open the project in the plugin first.';

export const TRACK_NOT_LOADED_IN_PLUGIN_ERROR =
  'No matching track loaded in plugin. Open the track in the plugin first.';
