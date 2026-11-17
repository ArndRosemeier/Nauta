/**
 * Sine and cosine together, about three times faster than Math.sin plus Math.cos and built only from + and ×,
 * which every engine rounds alike (Math.sin may differ in the last bit between browsers). Accurate to 2e-9 for
 * any argument the game meets (|t| up to about 1e6 rad). Pure.
 */

const HALF_PI = Math.PI / 2;
const QUADRANTS_PER_RADIAN = 2 / Math.PI;
/** Taylor terms of sine and cosine on [−π/4, π/4], highest first in use (error below r¹¹/11! ≈ 2e-9). */
const SIN_3 = -1 / 6;
const SIN_5 = 1 / 120;
const SIN_7 = -1 / 5040;
const SIN_9 = 1 / 362880;
const COS_2 = -1 / 2;
const COS_4 = 1 / 24;
const COS_6 = -1 / 720;
const COS_8 = 1 / 40320;
const COS_10 = -1 / 3628800;
/** The quarter turns of an angle, taken modulo 4 by masking. */
const QUADRANT_MASK = 3;

/** sin t into out[0], cos t into out[1]. */
export function sincos(t: number, out: [number, number]): void {
  const q = Math.round(t * QUADRANTS_PER_RADIAN);
  const r = t - q * HALF_PI, r2 = r * r;
  const s = r * (1 + r2 * (SIN_3 + r2 * (SIN_5 + r2 * (SIN_7 + r2 * SIN_9))));
  const c = 1 + r2 * (COS_2 + r2 * (COS_4 + r2 * (COS_6 + r2 * (COS_8 + r2 * COS_10))));
  switch (q & QUADRANT_MASK) {
    case 0: out[0] = s; out[1] = c; break;
    case 1: out[0] = c; out[1] = -s; break;
    case 2: out[0] = -s; out[1] = -c; break;
    default: out[0] = -c; out[1] = s;
  }
}
