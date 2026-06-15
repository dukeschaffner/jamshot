/**
 * Maps local transport setting keys to PATCH /projects/:id body fields.
 */
export function mapProjectSettingsToApiPayload(fields) {
  const payload = {};

  if (fields.bpm !== undefined) {
    payload.bpm = fields.bpm;
  }
  if (fields.timeSignature !== undefined) {
    payload.time_signature = fields.timeSignature;
  }
  if (fields.metronomeOffset !== undefined) {
    payload.metronome_offset = fields.metronomeOffset;
  }
  if (fields.duration !== undefined) {
    payload.duration_seconds = fields.duration;
  }

  return payload;
}
