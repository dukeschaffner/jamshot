export const PLUGIN_SYNC_GATE = {
  UNKNOWN: 'unknown',
  READY: 'ready',
  NOT_READY: 'not_ready',
};

export const PROJECT_NOT_LOADED_IN_PLUGIN_ERROR =
  'No matching project loaded in plugin. Open the project in the plugin first.';

export function createInitialPluginSyncGate() {
  return {
    status: PLUGIN_SYNC_GATE.UNKNOWN,
    loadedProjectId: null,
  };
}

export function isProjectNotLoadedInPluginError(error) {
  if (!error || typeof error !== 'string') return false;
  return error.includes('No matching project loaded in plugin');
}

function toNotReady(gate) {
  if (gate.status === PLUGIN_SYNC_GATE.NOT_READY && gate.loadedProjectId == null) {
    return gate;
  }
  return {
    status: PLUGIN_SYNC_GATE.NOT_READY,
    loadedProjectId: null,
  };
}

function toReady(gate, projectId) {
  if (gate.status === PLUGIN_SYNC_GATE.READY && gate.loadedProjectId === projectId) {
    return gate;
  }
  return {
    status: PLUGIN_SYNC_GATE.READY,
    loadedProjectId: projectId,
  };
}

/**
 * Pure reducer for whether the local plugin currently has a project ready for project_sync.
 * UNKNOWN allows a single probe attempt after (re)connect; NOT_READY blocks auto-sync until
 * project_load_complete / project_sync_complete.
 */
export function reducePluginSyncGate(gate, event) {
  switch (event?.type) {
    case 'connection': {
      if (gate.status === PLUGIN_SYNC_GATE.UNKNOWN && gate.loadedProjectId == null) {
        return gate;
      }
      return createInitialPluginSyncGate();
    }
    case 'project_load_complete':
    case 'project_sync_complete': {
      const projectId = event.projectId || null;
      if (!projectId) {
        return createInitialPluginSyncGate();
      }
      return toReady(gate, projectId);
    }
    case 'project_sync_error': {
      if (!isProjectNotLoadedInPluginError(event.error)) {
        return gate;
      }
      return toNotReady(gate);
    }
    case 'project_load_error': {
      const failedId = event.projectId || null;
      if (failedId && gate.loadedProjectId && gate.loadedProjectId !== failedId) {
        return gate;
      }
      return toNotReady(gate);
    }
    default:
      return gate;
  }
}

export function canAutoSyncProjectToPlugin(gate, projectGuid, connectionStatus) {
  if (connectionStatus !== 'connected' || !projectGuid) return false;

  if (gate.status === PLUGIN_SYNC_GATE.NOT_READY) return false;

  if (gate.status === PLUGIN_SYNC_GATE.READY) {
    return gate.loadedProjectId === projectGuid;
  }

  // UNKNOWN: allow one probe so a page refresh with the project already loaded still works.
  return true;
}
