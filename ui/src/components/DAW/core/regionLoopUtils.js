/**
 * Helpers for Logic Pro-style region looping.
 *
 * A region with loopEnd > endTime tiles its audible window
 * [offset, offset + (endTime - startTime)] across [endTime, loopEnd].
 */

/**
 * Effective timeline end of a region including any loop area.
 * @param {{ startTime: number, endTime: number, loopEnd?: number|null }} region
 * @returns {number}
 */
export function getRegionEffectiveEnd(region) {
  if (!region) return 0;
  const loopEnd = region.loopEnd;
  if (loopEnd != null && loopEnd > region.endTime) {
    return loopEnd;
  }
  return region.endTime;
}

/**
 * Whether a region has an active loop area.
 * @param {{ endTime: number, loopEnd?: number|null }} region
 * @returns {boolean}
 */
export function isRegionLooped(region) {
  return region?.loopEnd != null && region.loopEnd > region.endTime;
}

/**
 * Audible (source-window) length of a region in seconds.
 * @param {{ startTime: number, endTime: number }} region
 * @returns {number}
 */
export function getRegionAudibleLength(region) {
  return Math.max(0, (region?.endTime ?? 0) - (region?.startTime ?? 0));
}

/**
 * Normalize a loopEnd value: null/undefined/<=endTime clears the loop.
 * @param {number} endTime
 * @param {number|null|undefined} loopEnd
 * @returns {number|null}
 */
export function normalizeLoopEnd(endTime, loopEnd) {
  if (loopEnd == null || !Number.isFinite(loopEnd) || loopEnd <= endTime) {
    return null;
  }
  return loopEnd;
}

/**
 * Expand a (possibly looped) region into timeline segments that fall within
 * [windowStart, windowEnd]. Each segment maps to one continuous source-window
 * tile (or a partial tile at the end).
 *
 * @param {{ id?: string, startTime: number, endTime: number, offset?: number, loopEnd?: number|null, buffer?: AudioBuffer, active?: boolean }} region
 * @param {number} windowStart
 * @param {number} windowEnd
 * @returns {Array<{ startTime: number, endTime: number, offset: number }>}
 */
export function getLoopedSegments(region, windowStart, windowEnd) {
  if (!region) return [];

  const audibleLength = getRegionAudibleLength(region);
  if (audibleLength <= 0) return [];

  const effectiveEnd = getRegionEffectiveEnd(region);
  const regionStart = region.startTime;
  const regionOffset = region.offset ?? 0;

  // No overlap with the scheduling window
  if (regionStart >= windowEnd || effectiveEnd <= windowStart) {
    return [];
  }

  const segStart = Math.max(regionStart, windowStart);
  const segEnd = Math.min(effectiveEnd, windowEnd);
  if (segStart >= segEnd) return [];

  const segments = [];
  // Position of segStart relative to the region's repeating cycle
  let cursor = segStart;

  // Cycle boundaries from `n * audibleLength` often aren't exact in IEEE-754
  // (e.g. 6.6/1.1 === 5.999... → floor stays on the previous cycle). Without
  // an epsilon, the loop hits tileEnd <= cursor and bails early, leaving a
  // silent gap until the next ChunkScheduler window (~up to segmentDuration).
  const CYCLE_EPS = 1e-9;

  while (cursor < segEnd) {
    const elapsed = cursor - regionStart;
    let cycleIndex = Math.floor((elapsed + CYCLE_EPS) / audibleLength);
    let cycleStart = regionStart + cycleIndex * audibleLength;

    // If FP put the computed cycle start slightly after cursor, snap it back
    // so we don't invent a negative offsetIntoCycle.
    if (cycleStart > cursor) {
      cycleStart = cursor;
    }

    let cycleEnd = Math.min(cycleStart + audibleLength, effectiveEnd);
    // Still stuck on a spent cycle (boundary equality / drift) — advance.
    if (cycleEnd <= cursor + CYCLE_EPS) {
      cycleIndex += 1;
      cycleStart = regionStart + cycleIndex * audibleLength;
      if (cycleStart > cursor) {
        cycleStart = cursor;
      }
      cycleEnd = Math.min(cycleStart + audibleLength, effectiveEnd);
    }

    const tileEnd = Math.min(cycleEnd, segEnd);

    if (tileEnd <= cursor) break;

    const offsetIntoCycle = Math.max(0, cursor - cycleStart);
    segments.push({
      startTime: cursor,
      endTime: tileEnd,
      offset: regionOffset + offsetIntoCycle,
    });

    cursor = tileEnd;
  }

  return segments;
}

/**
 * Build absolute timeline times for each loop-tile boundary between endTime and loopEnd.
 * Used for drawing boundary ticks in the UI.
 *
 * @param {{ startTime: number, endTime: number, loopEnd?: number|null }} region
 * @returns {number[]} absolute times at the start of each loop tile (including first loop after the original)
 */
export function getLoopTileBoundaryTimes(region) {
  if (!isRegionLooped(region)) return [];

  const audibleLength = getRegionAudibleLength(region);
  if (audibleLength <= 0) return [];

  const boundaries = [];
  let t = region.endTime;
  // Cap iterations to avoid runaway for pathological loopEnds
  const maxTiles = 10000;
  let i = 0;
  while (t < region.loopEnd && i < maxTiles) {
    boundaries.push(t);
    t += audibleLength;
    i += 1;
  }
  return boundaries;
}
