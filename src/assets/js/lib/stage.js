// =============================================================================
// STAGE
// Maps AU to display units. Distances are compressed (r^0.6) so Mercury and
// Saturn share one screen; direction is preserved, so angles, timing, and
// the shape of each ellipse are true to the ephemeris.
// =============================================================================

export const COMPRESSION = 0.6;

export function toStage({ x, y, z }) {
  const r = Math.hypot(x, y, z);
  if (r === 0) return [0, 0, 0];
  const k = Math.pow(r, COMPRESSION) / r;
  return [x * k, y * k, z * k];
}

export const PALETTE = {
  mercury: [0.80, 0.77, 0.72],
  venus:   [0.98, 0.86, 0.62],
  earth:   [0.50, 0.72, 1.00],
  mars:    [1.00, 0.48, 0.34],
  jupiter: [0.93, 0.74, 0.54],
  saturn:  [0.96, 0.88, 0.68],
};

export const SIZES = {
  mercury: 0.55,
  venus: 0.75,
  earth: 0.8,
  mars: 0.65,
  jupiter: 1.25,
  saturn: 1.1,
};
