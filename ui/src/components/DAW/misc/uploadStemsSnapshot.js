import { buildStemsObject } from './DAWUtils';

export const RECORDING_STEM_ID = 'recording';

export const UPLOAD_STEM_ERRORS = {
  editorUnavailable:
    'The editor is no longer available. Please reload the page and try again.',
  noRecording:
    'No recording found to upload. Please record or import audio and try again.',
  missingParentStems:
    'The original track could not be found in the editor. Please reload the page and try again.',
};

/**
 * Builds the stems payload for an upload *before* any async work (S3 PUT, etc.).
 *
 * The DAW's TrackManager can be destroyed while an upload is in flight (e.g. the DAW
 * unmounts because the viewport flipped to "mobile"). After destroy(), getAllTracks()
 * returns [] and the API rejects the upload with an empty stems array. Capturing the
 * stems up front, and validating them client-side, prevents that failure mode.
 *
 * @param {import('../core/TrackManager').default | null} trackManager
 * @param {{ isCollab?: boolean }} options
 * @returns {{ stems: Array<object> | null, error: string | null }}
 */
export function snapshotUploadStems(trackManager, { isCollab = false } = {}) {
  if (!trackManager) {
    return { stems: null, error: UPLOAD_STEM_ERRORS.editorUnavailable };
  }

  const stems = buildStemsObject(trackManager.getAllTracks());

  if (!stems.some((stem) => stem.track_id === RECORDING_STEM_ID)) {
    return { stems: null, error: UPLOAD_STEM_ERRORS.noRecording };
  }

  // A collab must carry at least one parent stem alongside the recording.
  if (isCollab && stems.length < 2) {
    return { stems: null, error: UPLOAD_STEM_ERRORS.missingParentStems };
  }

  return { stems, error: null };
}
