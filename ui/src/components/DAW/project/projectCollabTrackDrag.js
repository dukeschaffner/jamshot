export const COLLAB_TRACK_DRAG_MIME = 'application/x-jamshot-collab-track';

let activeCollabDrag = null;

export function buildCollabTrackDragPayload(track) {
  return {
    trackId: track.trackId,
    durationSeconds: track.durationSeconds,
    name: track.title,
  };
}

export function parseCollabTrackDragPayload(raw) {
  if (!raw) return null;

  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    const trackId = Number(parsed.trackId);
    const durationSeconds =
      parsed.durationSeconds != null ? Number(parsed.durationSeconds) : null;

    if (!Number.isFinite(trackId)) return null;

    return {
      trackId,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
      name: parsed.name || 'Collab stem',
    };
  } catch {
    return null;
  }
}

export function getActiveCollabTrackDrag() {
  return activeCollabDrag;
}

export function clearCollabTrackDrag() {
  activeCollabDrag = null;
}

export function getCollabTrackFromDataTransfer(dataTransfer) {
  if (activeCollabDrag) return activeCollabDrag;
  if (!dataTransfer) return null;
  const raw = dataTransfer.getData(COLLAB_TRACK_DRAG_MIME);
  return parseCollabTrackDragPayload(raw);
}

export function setCollabTrackDragData(dataTransfer, track) {
  if (!dataTransfer || !track) return;
  const payload = buildCollabTrackDragPayload(track);
  activeCollabDrag = payload;
  dataTransfer.setData(COLLAB_TRACK_DRAG_MIME, JSON.stringify(payload));
  dataTransfer.effectAllowed = 'copy';
}
