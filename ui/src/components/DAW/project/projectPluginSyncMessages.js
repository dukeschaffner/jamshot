export function buildSetProjectMessage(projectGuid, projectName, pluginPayload) {
  return {
    type: 'set_project',
    project_id: projectGuid,
    name: projectName,
    payload: {
      ...pluginPayload,
      name: pluginPayload?.name ?? projectName,
    },
  };
}

export function buildProjectSyncMessage(projectGuid, pluginPayload) {
  return {
    type: 'project_sync',
    project_id: projectGuid,
    payload: {
      clips: pluginPayload?.clips ?? [],
    },
  };
}
