/**
 * The sea's ripples (plan N1.4): the shortest waves, from FINE_SHORTEST down to RIPPLE_SHORTEST, as a small tiling
 * texture of slopes that the sea's material lays twice over the water at two sizes, turned a quarter to each other,
 * each drifting its own way. Summed as single waves a few at each size would cross in a regular weave right under the
 * eye; the texture holds a hundred of them, and its mipmaps filter them where a pixel is too coarse to show them
 * (what is lost there is roughness instead: the material's share of `rippleShare`). Pure.
 */
import { Rng } from '@futuremagic/core';
import { FOAM_WRAP } from './seaFoam';

/** The shortest ripple, m: shorter ones are smaller than a pixel from the deck. */
export const RIPPLE_SHORTEST = 0.035;
/** The longest ripple, m; above it the fine waves take over (seaFine.ts). */
export const RIPPLE_LONGEST = 0.5;
/** The texture's side in texels. */
export const RIPPLE_TEXELS = 256;
/** How many times each layer repeats across 256 m (the foam's wrap, seaView.ts): 1.6 m, and 0.97 m (a prime: no beat with the first). */
export const RIPPLE_REPEATS = 160;
export const RIPPLE_REPEATS_SECOND = 263;
/** The tile of the first layer, m. */
export const RIPPLE_TILE = FOAM_WRAP / RIPPLE_REPEATS;
/** Ripples drawn into the texture. */
const RIPPLE_WAVES = 96;
/** Numbers per texel: the slope along the texture's u (red) and v (green), as bytes. */
export const RIPPLE_CHANNELS = 2;
/** The slopes stored run over ± this many deviations; a byte's largest value. */
export const RIPPLE_RANGE = 3.5;
const BYTE = 255;
/** Slope is measured along both axes together. */
const AXES = 2;

const TURN = 2 * Math.PI;

/** The share of the slope of everything from RIPPLE_SHORTEST up to `longest` (m) that the ripples carry (equal per octave). */
export function rippleShare(longest: number): number {
  return Math.min(1, Math.log(RIPPLE_LONGEST / RIPPLE_SHORTEST) / Math.log(Math.max(longest, RIPPLE_LONGEST) / RIPPLE_SHORTEST));
}

/**
 * The ripples' slopes, seeded and tiling, as bytes row by row (u along a row): every ripple a whole number of times
 * across the tile in each direction, so the texture repeats seamlessly; lengths spread evenly on a log scale and
 * directions every way, each with the same slope, scaled so the slope along either axis has a deviation of 1.
 */
export function ripplePattern(seed: number): Uint8Array {
  const rng = new Rng(seed), lengths = rng.fork('length'), turns = rng.fork('direction'), phases = rng.fork('phase');
  const n = RIPPLE_WAVES, ku = new Float64Array(n), kv = new Float64Array(n), phase = new Float64Array(n);
  const top = Math.log(RIPPLE_LONGEST / RIPPLE_TILE), bottom = Math.log(RIPPLE_SHORTEST / RIPPLE_TILE);
  for (let i = 0; i < n; i++) {
    const length = Math.exp(top + (bottom - top) * ((i + lengths.float()) / n)), dir = turns.range(0, TURN);
    // Whole numbers of crests across the tile (in tiles⁻¹), never both zero.
    const m = Math.round(Math.cos(dir) / length), k = Math.round(Math.sin(dir) / length);
    ku[i] = m === 0 && k === 0 ? 1 : m;
    kv[i] = k;
    phase[i] = phases.range(0, TURN);
  }
  // Equal slope per ripple, (amp · k)² / 2 the same; both axes together 2 (a deviation of 1 along each).
  const each = Math.sqrt((2 * AXES) / n);
  const out = new Uint8Array(RIPPLE_TEXELS * RIPPLE_TEXELS * RIPPLE_CHANNELS);
  for (let j = 0; j < RIPPLE_TEXELS; j++) for (let i = 0; i < RIPPLE_TEXELS; i++) {
    const u = i / RIPPLE_TEXELS, v = j / RIPPLE_TEXELS;
    let su = 0, sv = 0;
    for (let w = 0; w < n; w++) {
      const k = Math.hypot(ku[w]!, kv[w]!), s = -each * Math.sin(TURN * (ku[w]! * u + kv[w]! * v) + phase[w]!) / k;
      su += s * ku[w]!;
      sv += s * kv[w]!;
    }
    const at = (j * RIPPLE_TEXELS + i) * RIPPLE_CHANNELS;
    out[at] = toByte(su);
    out[at + 1] = toByte(sv);
  }
  return out;
}

function toByte(slope: number): number {
  return Math.round((BYTE * (Math.max(-1, Math.min(1, slope / RIPPLE_RANGE)) + 1)) / 2);
}
