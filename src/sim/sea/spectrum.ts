/**
 * The shape of a wind sea's spectrum: how its energy is spread over wave frequency (JONSWAP) and over direction
 * around the wind (cos-2s), and drawing values from such a spread. Pure.
 */
import { SEA_PEAK_SHARPNESS } from '../rules/sea';

/** Width of the JONSWAP peak below the peak frequency (Hasselmann et al. 1973). */
const PEAK_WIDTH_BELOW = 0.07;
/** Width of the JONSWAP peak above the peak frequency (Hasselmann et al. 1973). */
const PEAK_WIDTH_ABOVE = 0.09;
/** The spectrum's high-frequency tail falls as frequency to this power (Pierson-Moskowitz). */
const TAIL_POWER = 5;
/** Pierson-Moskowitz: the low-frequency side rises as exp(-5/4 (peak / frequency)^4). */
const RISE_RATE = 5 / 4;
const RISE_POWER = 4;
/** Steps of the table a spread is drawn from: fine enough that the drawn values are within 0.1 % of the band. */
const TABLE_STEPS = 1024;

/** JONSWAP energy density at angular frequency `w` (rad/s) for the peak `peak` (rad/s), unnormalised. */
export function jonswap(w: number, peak: number): number {
  if (w <= 0) return 0;
  const width = w <= peak ? PEAK_WIDTH_BELOW : PEAK_WIDTH_ABOVE;
  const r = Math.exp(-((w - peak) ** 2) / (2 * width * width * peak * peak));
  return Math.pow(w, -TAIL_POWER) * Math.exp(-RISE_RATE * Math.pow(peak / w, RISE_POWER)) * Math.pow(SEA_PEAK_SHARPNESS, r);
}

/** Directional spread at `angle` (rad) from the wind, exponent `s`: cos^(2s)(angle / 2), unnormalised. */
export function spread(angle: number, s: number): number {
  return Math.pow(Math.abs(Math.cos(angle / 2)), 2 * s);
}

/**
 * The values at which the cumulative share of `density` over [lo, hi] reaches each of `shares` (0..1): drawing
 * with evenly spread shares gives values spread as the density is.
 */
export function quantiles(density: (v: number) => number, lo: number, hi: number, shares: readonly number[]): number[] {
  const step = (hi - lo) / TABLE_STEPS;
  const sums = [0];
  for (let i = 1; i <= TABLE_STEPS; i++) {
    sums.push(sums[i - 1]! + ((density(lo + (i - 1) * step) + density(lo + i * step)) * step) / 2);
  }
  const total = sums[TABLE_STEPS]!;
  return shares.map((share) => {
    const want = share * total;
    let a = 0, b = TABLE_STEPS;
    while (b - a > 1) {
      const m = (a + b) >> 1;
      if (sums[m]! < want) a = m;
      else b = m;
    }
    const part = sums[b]! > sums[a]! ? (want - sums[a]!) / (sums[b]! - sums[a]!) : 0;
    return lo + (a + part) * step;
  });
}
