import { audioBufferToWav } from '@/lib/utils';
import {
  PROCESSING_POLL_INTERVAL_MS,
  PROCESSING_TIMEOUT_MS,
} from './ProjectsConfig';

export const CLIP_PROCESSING_STATUS = {
  UPLOADING: 'uploading',
  UPLOAD_FAILED: 'upload_failed',
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

export function sanitizeProjectProcessingError(errorMessage) {
  if (!errorMessage || typeof errorMessage !== 'string') {
    return 'Audio processing failed. Please try again.';
  }
  return 'Audio processing failed. Please try again.';
}

export function audioBufferToWavBlob(buffer) {
  const wavArrayBuffer = audioBufferToWav(buffer, buffer.sampleRate);
  return new Blob([wavArrayBuffer], { type: 'audio/wav' });
}

export function buildClipUploadFormData({
  file,
  revision,
  startTimeSeconds,
  trimStartSeconds = 0,
  trimEndSeconds,
  clipId,
}) {
  const formData = new FormData();
  formData.append('file', file, 'recording.wav');
  formData.append('revision', String(revision));
  formData.append('start_time_seconds', String(startTimeSeconds));
  formData.append('trim_start_seconds', String(trimStartSeconds));
  if (trimEndSeconds != null) {
    formData.append('trim_end_seconds', String(trimEndSeconds));
  }
  if (clipId != null) {
    formData.append('clip_id', String(clipId));
  }
  return formData;
}

export function pollProjectAssetStatus({
  projectApi,
  projectGuid,
  assetId,
  startTime = Date.now(),
  onStatus,
}) {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        if (Date.now() - startTime > PROCESSING_TIMEOUT_MS) {
          reject(new Error('Processing timed out after 5 minutes'));
          return;
        }

        const response = await projectApi.getProjectAssetProcessingStatus(
          projectGuid,
          assetId
        );
        const { status, error } = response.data;

        onStatus?.(status, error);

        if (status === 'completed') {
          resolve({ status, error: null });
          return;
        }

        if (status === 'failed') {
          resolve({
            status,
            error: sanitizeProjectProcessingError(error),
          });
          return;
        }

        setTimeout(poll, PROCESSING_POLL_INTERVAL_MS);
      } catch (err) {
        reject(err);
      }
    };

    poll();
  });
}

export function isClipInFlight(status) {
  return (
    status === CLIP_PROCESSING_STATUS.UPLOADING ||
    status === CLIP_PROCESSING_STATUS.PENDING ||
    status === CLIP_PROCESSING_STATUS.PROCESSING
  );
}

export function isFailedClipStatus(status) {
  return (
    status === CLIP_PROCESSING_STATUS.FAILED ||
    status === CLIP_PROCESSING_STATUS.UPLOAD_FAILED
  );
}

export function mapServerProcessingStatus(status) {
  if (status === 'processing') {
    return CLIP_PROCESSING_STATUS.PROCESSING;
  }
  if (status === 'pending') {
    return CLIP_PROCESSING_STATUS.PENDING;
  }
  return null;
}
