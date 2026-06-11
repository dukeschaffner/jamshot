import DAWConfig from '../misc/DAWConfig';

export function getProjectMaxImportDuration() {
  return DAWConfig.audio.maxRecordingDuration;
}

export function getAudioFileFromDataTransfer(dataTransfer) {
  if (!dataTransfer) return null;

  if (dataTransfer.files?.length > 0) {
    const file = dataTransfer.files[0];
    if (file.type.startsWith('audio/')) return file;
  }

  const items = dataTransfer.items ? [...dataTransfer.items] : [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file?.type.startsWith('audio/')) return file;
  }

  return null;
}

export async function decodeAudioFile(file, audioContext) {
  const arrayBuffer = await file.arrayBuffer();
  return audioContext.decodeAudioData(arrayBuffer);
}

export function getTimelineTimeFromEvent(event, trackElement, durationSeconds) {
  if (!trackElement || !durationSeconds) return 0;

  let container = trackElement.parentElement;
  while (
    container &&
    !container.className?.toString().includes('tracksAndTimelineContainer')
  ) {
    container = container.parentElement;
  }

  if (!container) return 0;

  const rect = container.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const time = (clickX / rect.width) * durationSeconds;
  return Math.max(0, Math.min(time, durationSeconds));
}

export function wouldClipOverlap(track, startTime, endTime, excludeRegionId = null) {
  for (const region of track.regions) {
    if (!region.active) continue;
    if (excludeRegionId && region.id === excludeRegionId) continue;
    if (startTime < region.endTime && region.startTime < endTime) {
      return true;
    }
  }
  return false;
}

export function validateClipPlacement({
  track,
  startTime,
  fileDuration,
  projectDuration,
  excludeRegionId = null,
}) {
  if (!Number.isFinite(fileDuration) || fileDuration <= 0) {
    return { valid: false, error: 'Audio file has no duration.' };
  }

  const clampedStart = Math.max(0, startTime);
  const maxEnd = Math.min(clampedStart + fileDuration, projectDuration);
  const clipDuration = maxEnd - clampedStart;

  if (clipDuration <= 0) {
    return {
      valid: false,
      error: `Clip extends beyond project duration (${projectDuration}s).`,
    };
  }

  const endTime = clampedStart + clipDuration;

  if (wouldClipOverlap(track, clampedStart, endTime, excludeRegionId)) {
    return { valid: false, error: 'Clip overlaps another clip on this track.' };
  }

  return {
    valid: true,
    startTime: clampedStart,
    endTime,
    clipDuration,
  };
}

export function computePlaceholderPlacement({
  track,
  startTime,
  fileDuration,
  projectDuration,
}) {
  const validation = validateClipPlacement({
    track,
    startTime,
    fileDuration,
    projectDuration,
  });

  if (!validation.valid || !projectDuration) {
    return {
      isValid: false,
      leftPercent: 0,
      widthPercent: 0,
      error: validation.error,
    };
  }

  return {
    isValid: true,
    startTime: validation.startTime,
    endTime: validation.endTime,
    clipDuration: validation.clipDuration,
    leftPercent: (validation.startTime / projectDuration) * 100,
    widthPercent: (validation.clipDuration / projectDuration) * 100,
  };
}
