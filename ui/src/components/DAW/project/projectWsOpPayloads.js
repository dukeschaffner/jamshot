/**
 * Build WS `op` payloads from REST-shaped clip PATCH bodies and transport fields.
 */

export function buildClipOpPayload({
  clipId,
  trackId,
  sourceTrackId,
  patchPayload,
}) {
  const startTime = patchPayload.start_time_seconds;
  const trimStart = patchPayload.trim_start_seconds;
  const trimEnd = patchPayload.trim_end_seconds;
  const destTrackId = patchPayload.project_track_id;

  if (destTrackId != null && destTrackId !== sourceTrackId) {
    return {
      kind: 'clip.move_to_track',
      clipId,
      sourceTrackId,
      destTrackId,
      startTime,
      trimStart,
      trimEnd,
    };
  }

  return {
    kind: 'clip.trim',
    clipId,
    trackId: trackId ?? sourceTrackId,
    startTime,
    trimStart,
    trimEnd,
  };
}

export function buildTransportOpPayload(fields) {
  const payload = { kind: 'project.transport' };

  if (fields.bpm !== undefined) {
    payload.bpm = fields.bpm;
  }
  if (fields.timeSignature !== undefined) {
    payload.timeSignature = fields.timeSignature;
  }
  if (fields.metronomeOffset !== undefined) {
    payload.metronomeOffset = fields.metronomeOffset;
  }
  if (fields.duration !== undefined) {
    payload.durationSeconds = fields.duration;
  }

  return payload;
}
