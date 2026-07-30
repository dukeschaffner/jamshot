/**
 * Expand looped regions into tiled placements for FFmpeg stem rendering.
 * Each tile plays from the start of the audible region (region.offset).
 */
export function expandLoopedRegions(regions = []) {
  const expandedRegions = [];

  for (const region of regions) {
    const audibleLength = region.endTime - region.startTime;
    if (!(audibleLength > 0)) continue;

    const loopEnd =
      region.loopEnd != null && region.loopEnd > region.endTime
        ? region.loopEnd
        : region.endTime;

    const baseOffset = region.offset ?? 0;
    let t = region.startTime;
    let guard = 0;

    while (t < loopEnd && guard < 10000) {
      const tileDuration = Math.min(audibleLength, loopEnd - t);
      if (!(tileDuration > 0)) break;

      expandedRegions.push({
        startTime: t,
        endTime: t + tileDuration,
        // Full cycles always restart at the audible region's source offset.
        // Avoid `(t - start) % length` — float residue breaks FFmpeg -ss.
        offset: baseOffset,
      });
      t += audibleLength;
      guard += 1;
    }
  }

  return expandedRegions;
}

/**
 * Format a time value for FFmpeg -ss / -t (no scientific notation, clamp tiny floats).
 */
export function formatFfmpegTime(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 1e-9) return '0';
  // Fixed decimals avoid 1.77e-15 style strings that FFmpeg rejects.
  return n.toFixed(6).replace(/\.?0+$/, '') || '0';
}
