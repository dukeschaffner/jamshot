/**
 * Client-side helpers for snapshot preview mode in the project DAW.
 * Preview loads hydrated snapshot state into the timeline without mutating the live project.
 */

/**
 * Build a REST-shaped project state suitable for TrackManager from a GET snapshot response.
 * @param {Object} snapshotResponse - API response from getProjectSnapshot
 * @param {Object} liveProject - current live projectData (for role/guid fallbacks)
 */
export function buildSnapshotPreviewState(snapshotResponse, liveProject) {
  const state = snapshotResponse?.state;
  if (!state) return null;

  return {
    ...liveProject,
    ...state,
    guid: state.guid ?? liveProject?.guid,
    role: liveProject?.role ?? state.role,
    // Keep live revision so exiting preview does not look like a newer server version.
    revision: liveProject?.revision,
    _snapshotPreview: {
      snapshotId: snapshotResponse.id,
      label: snapshotResponse.label,
      snapshotKind: snapshotResponse.snapshotKind,
      createdAt: snapshotResponse.createdAt,
    },
  };
}

export function getSnapshotPreviewLabel(previewMeta) {
  if (!previewMeta) return 'Snapshot preview';
  if (previewMeta.label) return previewMeta.label;
  return 'Untitled snapshot';
}
