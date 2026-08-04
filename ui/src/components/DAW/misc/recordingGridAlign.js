/**
 * After recording, lightly snap region boundaries to nearby beat gridlines
 * so looping feels more grid-aligned (Logic Pro-style quantization assist).
 *
 * Audio content is never time-shifted: start snaps adjust offset by the same
 * delta; end snaps only move endTime (trim or pad with silence past buffer).
 */

/**
 * @param {{ startTime: number, endTime: number, offset?: number }} times
 * @param {Array<{ time: number }>} gridLines
 * @param {number} thresholdSeconds
 * @returns {{ startTime: number, endTime: number, offset: number }}
 */
export function alignRecordedRegionToGrid(times, gridLines, thresholdSeconds) {
  const startTime = times?.startTime ?? 0;
  let endTime = times?.endTime ?? startTime;
  let offset = times?.offset ?? 0;

  if (
    !Array.isArray(gridLines) ||
    gridLines.length === 0 ||
    !Number.isFinite(thresholdSeconds) ||
    thresholdSeconds <= 0
  ) {
    return { startTime, endTime, offset };
  }

  const nearest = (time) => {
    let best = null;
    let bestDist = Infinity;
    for (const line of gridLines) {
      if (!line || !Number.isFinite(line.time)) continue;
      const dist = Math.abs(line.time - time);
      if (dist < bestDist) {
        bestDist = dist;
        best = line.time;
      }
    }
    if (best == null || bestDist > thresholdSeconds) {
      return null;
    }
    return best;
  };

  let nextStart = startTime;
  const snappedStart = nearest(startTime);
  if (snappedStart != null) {
    const delta = snappedStart - startTime;
    const nextOffset = offset + delta;
    // Only snap start when it wouldn't require a negative buffer offset
    if (nextOffset >= 0) {
      nextStart = snappedStart;
      offset = nextOffset;
    }
  }

  const snappedEnd = nearest(endTime);
  if (snappedEnd != null && snappedEnd > nextStart) {
    endTime = snappedEnd;
  } else if (endTime <= nextStart) {
    endTime = nextStart + Math.max(0, (times?.endTime ?? 0) - startTime);
  }

  return { startTime: nextStart, endTime, offset };
}
