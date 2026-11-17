/**
 * Sine and cosine together, built only from + and ×, which every engine rounds alike (Math.sin may differ in the
 * last bit between browsers), and without a branch on the quadrant, which the sea's hot loop cannot predict.
 * Accurate to 1e-9 for any argument the game meets (|t| up to about 1e6 rad). Pure.
 */

const TURNS_PER_HALF_RADIAN = 1 / Math.PI;
/** Taylor terms of sine and cosine on [−π/2, π/2] (error below (π/2)¹⁵/15! ≈ 7e-10). */
const SIN_3 = -1 / 6;
const SIN_5 = 1 / 120;
const SIN_7 = -1 / 5040;
const SIN_9 = 1 / 362880;
const SIN_11 = -1 / 39916800;
const SIN_13 = 1 / 6227020800;
const COS_2 = -1 / 2;
const COS_4 = 1 / 24;
const COS_6 = -1 / 720;
const COS_8 = 1 / 40320;
const COS_10 = -1 / 3628800;
const COS_12 = 1 / 479001600;
const COS_14 = -1 / 87178291200;

/** sin t into out[0], cos t into out[1]. */
export function sincos(t: number, out: [number, number]): void {
  // t = r + n·π with r in [−π/2, π/2]; each half turn flips both signs.
  const n = Math.round(t * TURNS_PER_HALF_RADIAN);
  const r = t - n * Math.PI, r2 = r * r;
  const sign = 1 - 2 * (n & 1);
  out[0] = sign * r * (1 + r2 * (SIN_3 + r2 * (SIN_5 + r2 * (SIN_7 + r2 * (SIN_9 + r2 * (SIN_11 + r2 * SIN_13))))));
  out[1] = sign * (1 + r2 * (COS_2 + r2 * (COS_4 + r2 * (COS_6 + r2 * (COS_8 + r2 * (COS_10 + r2 * (COS_12 + r2 * COS_14)))))));
}
