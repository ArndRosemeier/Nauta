/**
 * The sea's foam (plan N1.4): where it forms and what it looks like. Whitecaps form where the surface bunches most
 * (the Jacobian of the waves' sideways shift, `stretch` in sea.ts, falls lowest on the steepest crests). How much of
 * the sea is white grows steeply with the wind (Monahan and O'Muircheartaigh 1980), so the level of bunching that
 * turns white is set per moment from the waves drawn: the share of the surface below it is the whitecap share for
 * the wind. The foam's pattern (bubbles, lace, streaks) is a small seeded texture that tiles, laid at two scales.
 * Pure.
 */
import { Rng, smoothstep } from '@futuremagic/core';
import { newCell, pgrad, worley } from '@futuremagic/texgen/core';
import { MORE_AT, SEA_WAVE_STRIDE, type SeaWaveTable } from './seaWaves';

/**
 * Whitecap share of the sea = MONAHAN_SCALE · (wind speed in m/s) ^ MONAHAN_POWER (Monahan and O'Muircheartaigh
 * 1980): 0.3 % at 7 m/s (force 4), 2.5 % at 14 m/s (force 6), 7 % at 19 m/s (force 8).
 */
const MONAHAN_SCALE = 3.84e-6;
const MONAHAN_POWER = 3.41;
/** Drawn foam is foam just made; how much more of the sea that is than Monahan's share, which counts thick foam only. */
const FOAM_SHOW = 2.5;
/** The most of the sea that is ever white (a storm's streaks). */
const FOAM_MOST = 0.35;
/** How far below the level the foam turns fully white, in deviations of the bunching. */
const FOAM_RAMP = 1.2;
/** Below this share there is no foam at all (the level is put out of reach). */
const FOAM_NONE = 1e-5;
/** Abramowitz and Stegun 7.1.26: erfc(x) ≈ t·e^(−x²)·Σ aₙtⁿ with t = 1 / (1 + p·x); accurate to 1.5e-7. */
const ERFC_P = 0.3275911;
const ERFC_A = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429] as const;
/** Bisection steps for the normal quantile, and the range searched (deviations). */
const QUANTILE_STEPS = 40;
const QUANTILE_TOP = 8;

/** The share of a standard normal variable above `z` (z ≥ 0). */
function upperTail(z: number): number {
  const x = z / Math.SQRT2, t = 1 / (1 + ERFC_P * x);
  let poly = 0;
  for (let i = ERFC_A.length - 1; i >= 0; i--) poly = poly * t + ERFC_A[i]!;
  return (t * poly * Math.exp(-x * x)) / 2;
}

/** The z above which a share `p` (0..½) of a standard normal variable lies. */
export function normalAbove(p: number): number {
  let lo = 0, hi = QUANTILE_TOP;
  for (let i = 0; i < QUANTILE_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (upperTail(mid) > p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** The share of the sea that turns white in a wind of `speed` m/s. */
export function whitecapShare(speed: number): number {
  return Math.min(FOAM_MOST, MONAHAN_SCALE * speed ** MONAHAN_POWER * FOAM_SHOW);
}

/** Where foam forms in the waves drawn: below `level` of stretch it starts, `ramp` further down it is fully white. */
export interface FoamLevels {
  level: number;
  ramp: number;
}

/**
 * The foam levels for the waves in `table` under a wind of `speed` m/s. The stretch's departure from 1 is close to
 * the sum of every wave's chop·amp·k·cos θ, a normal variable of deviation √(Σ (chop·amp·k)² / 2); the level is put
 * where the share of the sea below it is the whitecap share.
 */
export function foamLevels(table: SeaWaveTable, speed: number, out: FoamLevels = { level: 0, ramp: 0 }): FoamLevels {
  let variance = 0;
  for (let i = 0; i < table.count; i++) {
    const at = i * SEA_WAVE_STRIDE, k = table.more[at + MORE_AT.k]!;
    variance += (table.more[at + MORE_AT.reach]! * k * k) ** 2 / 2;
  }
  const deviation = Math.sqrt(variance), share = whitecapShare(speed);
  out.ramp = Math.max(deviation * FOAM_RAMP, Number.EPSILON);
  out.level = share < FOAM_NONE ? -1 : 1 - deviation * normalAbove(share);
  return out;
}

/** The foam's (and the ripples') patterns drift with the wind, wrapped every FOAM_WRAP m: a whole number of each of their tiles. */
export const FOAM_WRAP = 256;
/** The foam texture's side in texels, and how many lace cells and bubbles run across it. */
export const FOAM_TEXELS = 256;
const LACE_CELLS = 7;
const BUBBLE_CELLS = 31;
/** The breakup noise: its coarsest lattice across the tile, and its octaves. */
const BREAKUP_CELLS = 4;
const BREAKUP_OCTAVES = 4;
/**
 * The lace's strands are where a soft noise crosses zero (winding lines that branch and close, as old foam's do), at
 * two scales; how far from zero still counts as strand (noise units, about cells), and how bright the finer strands are.
 */
const LACE_WIDTH = 0.09;
const LACE_FINE = 0.6;
/** How far the lace's strands wander (cells) and on what lattice; how much their width swells, on what lattice. */
const WARP_CELLS = 6;
const WARP_REACH = 0.45;
const LACE_SWELL = 0.8;
const SWELL_CELLS = 12;
const BUBBLE_HOLE = 0.32;
/** Numbers per texel (RGBA bytes). */
export const FOAM_CHANNELS = 4;
/** A byte's largest value. */
const BYTE = 255;
/** Which channel holds what. */
export const FOAM_AT = { lace: 0, breakup: 1, bubbles: 2 } as const;

/**
 * The foam's pattern, seeded and tiling, as RGBA bytes row by row: red the lace that old foam thins to (strands
 * around open cells), green a soft breakup noise (where foam goes first), blue fine bubbles (fresh foam's grain).
 */
export function foamPattern(seed: number): Uint8Array {
  const rng = new Rng(seed);
  const laceSeed = rng.int(0, BYTE * BYTE), warpSeed = rng.int(0, BYTE * BYTE), bubbleSeed = rng.int(0, BYTE * BYTE), breakSeed = rng.int(0, BYTE * BYTE);
  const out = new Uint8Array(FOAM_TEXELS * FOAM_TEXELS * FOAM_CHANNELS), cell = newCell();
  for (let j = 0; j < FOAM_TEXELS; j++) for (let i = 0; i < FOAM_TEXELS; i++) {
    const u = (i + 1 / 2) / FOAM_TEXELS, v = (j + 1 / 2) / FOAM_TEXELS, at = (j * FOAM_TEXELS + i) * FOAM_CHANNELS;
    // The lace's strands wander (the noise warped by another) and swell and thin along their length.
    const wx = pgrad(warpSeed, u * WARP_CELLS, v * WARP_CELLS, WARP_CELLS, WARP_CELLS) * WARP_REACH;
    const wy = pgrad(warpSeed + 1, u * WARP_CELLS, v * WARP_CELLS, WARP_CELLS, WARP_CELLS) * WARP_REACH;
    const width = Math.max(LACE_WIDTH / 2, LACE_WIDTH * (1 + LACE_SWELL * pgrad(warpSeed + 2, u * SWELL_CELLS, v * SWELL_CELLS, SWELL_CELLS, SWELL_CELLS)));
    const x = u * LACE_CELLS + wx, y = v * LACE_CELLS + wy;
    const broad = pgrad(laceSeed, x, y, LACE_CELLS, LACE_CELLS), narrow = pgrad(laceSeed + 1, 2 * x, 2 * y, 2 * LACE_CELLS, 2 * LACE_CELLS);
    const lace = Math.max(1 - smoothstep(0, width, Math.abs(broad)), LACE_FINE * (1 - smoothstep(0, width, Math.abs(narrow))));
    worley(bubbleSeed, u * BUBBLE_CELLS, v * BUBBLE_CELLS, BUBBLE_CELLS, BUBBLE_CELLS, 1, cell);
    const bubbles = smoothstep(BUBBLE_HOLE / 2, BUBBLE_HOLE, cell.f1);
    let noise = 0, weight = 0, scale = BREAKUP_CELLS, amp = 1;
    for (let o = 0; o < BREAKUP_OCTAVES; o++, scale *= 2, amp /= 2) {
      noise += amp * pgrad(breakSeed + o, u * scale, v * scale, scale, scale);
      weight += amp;
    }
    out[at + FOAM_AT.lace] = Math.round(BYTE * lace);
    out[at + FOAM_AT.breakup] = Math.round(BYTE * Math.min(1, Math.max(0, (noise / weight + 1) / 2)));
    out[at + FOAM_AT.bubbles] = Math.round(BYTE * bubbles);
    out[at + FOAM_CHANNELS - 1] = BYTE;
  }
  return out;
}
