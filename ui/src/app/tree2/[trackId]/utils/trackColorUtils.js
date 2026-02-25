/**
 * Track Color Utilities
 * Calculates node colors based on popularity score and saturation
 */

// ============================================================================
// POPULARITY CALCULATION CONSTANTS
// ============================================================================
const CONFIDENCE_CONSTANT = 50; // α - confidence constant (range: 50-100)
const GLOBAL_LIKE_RATE = 0.05; // Global average like rate

// ============================================================================
// COLOR THRESHOLDS (Popularity Score Ranges)
// ============================================================================
const COLOR_THRESHOLDS = {
  BLUE: { min: 0.00, max: 0.06 },      // 0-50% percentile
  GREEN: { min: 0.06, max: 0.075 },    // 50-75% percentile
  YELLOW: { min: 0.075, max: 0.09 },   // 75-90% percentile
  ORANGE: { min: 0.09, max: 0.15 },    // 90-99% percentile
  RED: { min: 0.15, max: Infinity },   // 99%+ percentile
};

// ============================================================================
// COLOR STOPS (Popularity Score -> Hue/Lightness mapping for interpolation)
// Format: { score, hue, lightness }
// ============================================================================
const COLOR_STOPS = [
  { score: 0.00, hue: 210, lightness: 50 },   // Blue start
  { score: 0.06, hue: 120, lightness: 50 },   // Blue->Green boundary
  { score: 0.075, hue: 60, lightness: 50 },   // Green->Yellow boundary
  { score: 0.09, hue: 30, lightness: 50 },    // Yellow->Orange boundary
  { score: 0.15, hue: 0, lightness: 50 },     // Orange->Red boundary
];

// ============================================================================
// SATURATION THRESHOLDS (Plays -> Saturation Percentage)
// ============================================================================
const SATURATION_THRESHOLDS = [
  { plays: 0, saturation: 0 },
  { plays: 100, saturation: 50 },
  { plays: 1000, saturation: 60 },
  { plays: 10000, saturation: 70 },
  { plays: 100000, saturation: 80 },
  { plays: 1000000, saturation: 90 },
  { plays: 10000000, saturation: 100 },
];

/**
 * Calculate popularity score for a track
 * Formula: (likes + α * globalLikeRate) / (streams + α)
 * 
 * @param {Object} track - Track object with like_count and play_count
 * @returns {number} Popularity score (0 < popularity < 1)
 */
function calculatePopularityScore(track) {
  const likes = track?.like_count || 0;
  const streams = track?.play_count || 0;
  
  const numerator = likes + CONFIDENCE_CONSTANT * GLOBAL_LIKE_RATE;
  const denominator = streams + CONFIDENCE_CONSTANT;
  
  // Ensure result is between 0 and 1
  const popularity = numerator / denominator;
  return Math.max(0, Math.min(1, popularity));
}

/**
 * Interpolate hue and lightness based on popularity score
 * Uses linear interpolation between color stops
 * 
 * @param {number} popularityScore - Popularity score (0-1)
 * @returns {Object} Object with hue and lightness values
 */
function interpolateColor(popularityScore) {
  // Clamp score to valid range
  const clampedScore = Math.max(0, Math.min(popularityScore, COLOR_STOPS[COLOR_STOPS.length - 1].score));
  
  // If score exceeds the last stop, return the last stop's values
  if (popularityScore >= COLOR_STOPS[COLOR_STOPS.length - 1].score) {
    const lastStop = COLOR_STOPS[COLOR_STOPS.length - 1];
    return { hue: lastStop.hue, lightness: lastStop.lightness };
  }
  
  // Find the two stops to interpolate between
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const currentStop = COLOR_STOPS[i];
    const nextStop = COLOR_STOPS[i + 1];
    
    if (clampedScore >= currentStop.score && clampedScore < nextStop.score) {
      // Calculate interpolation factor (0 to 1)
      const scoreRange = nextStop.score - currentStop.score;
      const position = clampedScore - currentStop.score;
      const t = position / scoreRange;
      
      // Interpolate hue (handle wraparound for hue if needed)
      let hue;
      const hueDiff = nextStop.hue - currentStop.hue;
      // Check if we need to go the shorter way around the color wheel
      if (Math.abs(hueDiff) > 180) {
        // Take the shorter path
        const adjustedDiff = hueDiff > 0 ? hueDiff - 360 : hueDiff + 360;
        hue = currentStop.hue + adjustedDiff * t;
        // Normalize to 0-360 range
        hue = hue < 0 ? hue + 360 : hue;
      } else {
        hue = currentStop.hue + hueDiff * t;
      }
      
      // Interpolate lightness
      const lightnessDiff = nextStop.lightness - currentStop.lightness;
      const lightness = currentStop.lightness + lightnessDiff * t;
      
      return { hue, lightness };
    }
  }
  
  // Fallback (shouldn't reach here)
  const firstStop = COLOR_STOPS[0];
  return { hue: firstStop.hue, lightness: firstStop.lightness };
}

/**
 * Calculate saturation percentage based on track plays
 * Uses linear interpolation between thresholds
 * 
 * @param {number} plays - Number of plays
 * @returns {number} Saturation percentage (0-100)
 */
function calculateSaturation(plays) {
  // Find the two thresholds to interpolate between
  for (let i = 0; i < SATURATION_THRESHOLDS.length - 1; i++) {
    const current = SATURATION_THRESHOLDS[i];
    const next = SATURATION_THRESHOLDS[i + 1];
    
    if (plays >= current.plays && plays < next.plays) {
      // Linear interpolation
      const range = next.plays - current.plays;
      const position = plays - current.plays;
      const saturationRange = next.saturation - current.saturation;
      
      return current.saturation + (position / range) * saturationRange;
    }
  }
  
  // If plays exceed the highest threshold, return max saturation
  return SATURATION_THRESHOLDS[SATURATION_THRESHOLDS.length - 1].saturation;
}

/**
 * Get color for a track based on popularity and saturation
 * 
 * @param {Object} track - Track object with like_count and play_count
 * @returns {string} HSL color string (e.g., "hsl(210, 50%, 50%)")
 */
export function getTrackColor(track) {
  // Calculate popularity score
  const popularityScore = calculatePopularityScore(track);
  
  // Interpolate hue and lightness based on popularity score
  const { hue, lightness } = interpolateColor(popularityScore);
  
  // Calculate saturation based on plays
  const plays = track?.play_count || 0;
  const saturationPercent = calculateSaturation(plays);
  
  // Return HSL color with interpolated hue, saturation, and lightness
  return `hsl(${Math.round(hue)}, ${saturationPercent}%, ${lightness}%)`;
}

/**
 * Get popularity score for a track (for debugging/testing)
 * 
 * @param {Object} track - Track object with like_count and play_count
 * @returns {number} Popularity score
 */
export function getPopularityScore(track) {
  return calculatePopularityScore(track);
}

