import {
  isClipInFlight,
  isFailedClipStatus,
} from './projectClipUpload';
import { validateRegionPlacement } from './projectClipPlacement';

/**
 * Whether a project region can be copied (needs a ready server asset).
 */
export function canCopyProjectRegion(region) {
  if (!region?.projectClipId || region.projectAssetId == null) {
    return false;
  }
  if (isClipInFlight(region.processingStatus)) {
    return false;
  }
  if (isFailedClipStatus(region.processingStatus)) {
    return false;
  }
  return true;
}

/**
 * Whether clipboard contents can be pasted as a project clip.
 */
export function isProjectClipboardPasteable(clipboard) {
  if (!clipboard?.region) return false;
  const assetId = clipboard.projectAssetId ?? clipboard.region.projectAssetId;
  return assetId != null;
}

export function getClipboardAssetId(clipboard) {
  if (!clipboard) return null;
  return clipboard.projectAssetId ?? clipboard.region?.projectAssetId ?? null;
}

/**
 * Map a region (or clipboard region) to asset trim bounds.
 */
export function getRegionClipboardTrims(region) {
  const trimStart = region?.offset ?? 0;
  const regionDuration = Math.max(
    0,
    (region?.endTime ?? 0) - (region?.startTime ?? 0)
  );
  return {
    trimStart,
    trimEnd: trimStart + regionDuration,
    regionDuration,
  };
}

/**
 * Clamp a paste/repeat placement to project duration (cuts overflowing end).
 */
export function computeClipboardPlacement({
  track,
  startTime,
  regionDuration,
  projectDuration,
  excludeRegionId = null,
}) {
  const clampedStart = Math.max(0, startTime);
  let endTime = clampedStart + regionDuration;

  if (endTime > projectDuration) {
    endTime = projectDuration;
  }

  if (endTime <= clampedStart) {
    return {
      valid: false,
      error: `Clip extends beyond project duration (${projectDuration}s).`,
    };
  }

  const placement = validateRegionPlacement({
    track,
    startTime: clampedStart,
    endTime,
    projectDuration,
    excludeRegionId,
  });

  if (!placement.valid) {
    return placement;
  }

  return {
    valid: true,
    startTime: clampedStart,
    endTime,
    clipDuration: endTime - clampedStart,
  };
}

export function buildPlaceClipFromTrimsPayload({
  revision,
  trackId,
  startTime,
  trimStart,
  trimEnd,
}) {
  return {
    revision,
    track_id: trackId,
    start_time_seconds: startTime,
    trim_start_seconds: trimStart,
    trim_end_seconds: trimEnd,
  };
}

/**
 * Compute left-trim + right-place specs for a split at playhead.
 */
export function computeSplitClipboardSpecs(region, playheadTime) {
  if (
    !region ||
    playheadTime <= region.startTime ||
    playheadTime >= region.endTime
  ) {
    return { valid: false, error: 'Playhead must be inside the selected region.' };
  }

  const { trimStart, trimEnd } = getRegionClipboardTrims(region);
  const splitOffset = playheadTime - region.startTime;
  const leftTrimEnd = trimStart + splitOffset;
  const rightTrimStart = leftTrimEnd;

  if (leftTrimEnd <= trimStart || rightTrimStart >= trimEnd) {
    return { valid: false, error: 'Split would create an empty clip.' };
  }

  return {
    valid: true,
    left: {
      startTime: region.startTime,
      endTime: playheadTime,
      offset: trimStart,
      trimStart,
      trimEnd: leftTrimEnd,
    },
    right: {
      startTime: playheadTime,
      trimStart: rightTrimStart,
      trimEnd,
      regionDuration: trimEnd - rightTrimStart,
    },
  };
}
