const MAX_TRACK_NAME_LENGTH = 200;

export function validateProjectTrackName(name) {
  if (name == null || typeof name !== 'string') {
    return { valid: false, error: 'Track name is required' };
  }

  const trimmed = name.trim();
  if (!trimmed) {
    return { valid: false, error: 'Track name is required' };
  }

  if (trimmed.length > MAX_TRACK_NAME_LENGTH) {
    return {
      valid: false,
      error: `Track name must be ${MAX_TRACK_NAME_LENGTH} characters or less`,
    };
  }

  return { valid: true, name: trimmed };
}

export function buildTrackReorderOrders(trackIdsInOrder) {
  return trackIdsInOrder.map((trackId, index) => ({
    trackId,
    sortOrder: index,
  }));
}

export function mergeTrackUpdateIntoProjectState(currentState, opPayload) {
  if (!currentState || opPayload?.kind !== 'track.update') {
    return currentState;
  }

  const trackId = opPayload.trackId;
  const patch = {};

  if (opPayload.name !== undefined) {
    patch.name = opPayload.name;
  }
  if (opPayload.gain !== undefined) {
    patch.gain = opPayload.gain;
  }
  if (opPayload.muted !== undefined) {
    patch.muted = opPayload.muted;
  }
  if (opPayload.solo !== undefined) {
    patch.solo = opPayload.solo;
  }
  if (opPayload.color !== undefined) {
    patch.color = opPayload.color;
  }

  if (Object.keys(patch).length === 0) {
    return currentState;
  }

  return {
    ...currentState,
    tracks: (currentState.tracks || []).map((track) =>
      track.id === trackId ? { ...track, ...patch } : track
    ),
  };
}

export function mergeTrackReorderIntoProjectState(currentState, opPayload) {
  if (!currentState || opPayload?.kind !== 'track.reorder') {
    return currentState;
  }

  const orderById = new Map(
    (opPayload.orders || []).map((entry) => [entry.trackId, entry.sortOrder])
  );

  const tracks = [...(currentState.tracks || [])].map((track) =>
    orderById.has(track.id)
      ? { ...track, sortOrder: orderById.get(track.id) }
      : track
  );

  tracks.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  return { ...currentState, tracks };
}
