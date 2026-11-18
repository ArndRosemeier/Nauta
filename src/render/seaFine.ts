/**
 * The sea's fine waves (plans N1.4, N1.2): the short waves below the simulated set's shortest, from tens of metres
 * down to the half-metre ripples, as a spectrum the GPU turns into waves each frame (seaBands.ts). Pure.
 *
 * How rough the water is comes from Cox and Munk's measurements of sun glitter (1954): the mean square slope of the
 * sea grows with the wind. The simulated waves carry part of it; the fine waves carry the rest, an equal share per
 * octave of wavelength (the saturation range of a wind sea, the tail of the same JONSWAP spectrum the simulated set
 * is drawn from: height density k⁻³ over wavenumber), and the ripples (seaRipples.ts) the share below half a metre.
 *
 * The spectrum is laid out in bands (Tessendorf's FFT ocean, in cascades): each band is a square tile of the sea,
 * `texels` a side, that holds a range of wavelengths a few texels long and up to an eighth of the tile, so a band's
 * tile never shows its repeat; the bands' ranges meet without a gap. This file makes each band's wavenumbers,
 * frequencies, the spectrum's fixed part and the seeded noise once, and for each moment the few numbers that change
 * with the wind (`fineFrame`): the GPU multiplies them out. Each wind layer of the sea weights its fine waves as its
 * simulated waves are weighted, so a change of wind changes the ripples without a jump. Never touches the
 * simulation (it is drawn only).
 */
import { Rng, deriveSeed, smoothstep } from '@futuremagic/core';
import { layerWeights, type SeaState } from '../sim/sea/sea';
import { spread } from '../sim/sea/spectrum';
import type { WaveSet } from '../sim/sea/waves';
import { GRAVITY } from '../sim/units';
import { RIPPLE_LONGEST, rippleShare } from './seaRipples';

/** The shortest fine wave, m: shorter ones are the ripples' (seaRipples.ts). */
export const FINE_SHORTEST = RIPPLE_LONGEST;
/**
 * The longest fine wave any wind needs, m: the simulated set's shortest is 46 m in a gale (force 8) and the fine
 * waves begin at FINE_OVERLAP of it. The bands are laid out from here down to FINE_SHORTEST.
 */
export const FINE_LONGEST = 48;
/** The longest fine wave as a share of the simulated set's shortest: a little overlap, so no length is left empty. */
const FINE_OVERLAP = 0.9;
/** The fine waves fade in over this much of ln k past their longest (about a third of an octave): no seam shows. */
export const FINE_FADE_IN = 0.23;
/** The fine waves run more across the wind than the long ones (their spread's exponent at FINE_LONGEST), the ripples nearly every way (at FINE_SHORTEST). */
const FINE_SPREAD_LONG = 2;
const FINE_SPREAD_SHORT = 0.5;
/** Ripples shorter than this are held up by surface tension and run faster (capillary waves): rad/m (Phillips 1977). */
const CAPILLARY_K = 363;
/** How far the fine waves move their water sideways toward their crests (Tessendorf's λ): what makes them bunch and fold. */
export const FINE_CHOP = 1;

/** A band's tile holds this many of its longest waves: enough that its repeat never shows ... */
const BAND_TILE_WAVES = 8;
/** ... unless its shortest wave would then span fewer texels than this (two bands of 128², the lowest level). */
export const BAND_TEXELS_LEAST = 4;
/** Each band's tile is a little smaller than its share, by this much per band, so no two bands' tiles share a period. */
const BAND_TILE_NUDGE = 0.0618;
/**
 * The fine waves' frequencies sit on whole multiples of 2π / FINE_REPEAT (s), so their phases come round after this
 * long and the GPU's clock can wrap (single floats lose the time hours into a match); the shift is under 1 %.
 */
export const FINE_REPEAT = 4096;
/** The most bands a quality level may ask for (plan N1.2: two to four). */
export const MOST_BANDS = 4;
/** The wind layers whose fine waves the GPU draws at once: the two strongest (one fading into the other). */
export const FINE_LAYERS = 2;

/**
 * Cox and Munk (1954), a clean sea: mean square slope (both directions together) = COX_BASE + COX_PER_SPEED · wind
 * speed in m/s. At a force 4 that is about 0.04 (slopes of about 11°), in a gale about 0.1.
 */
export const COX_BASE = 0.003;
export const COX_PER_SPEED = 0.00512;
/** In a near calm the ripples die away (Cox and Munk's glassy patches): the slope fades in between these speeds, m/s. */
const GLASSY_SPEED = 0.6;
const RIPPLED_SPEED = 3.2;
/** What a glassy sea keeps of slope: a long swell's own and the faintest ripple. */
const GLASSY_SLOPE = 0.0001;
/** The least slope the fine waves carry, so their share never falls to nothing when the simulated waves carry it all. */
const FINE_SLOPE_FLOOR = 0.00005;

/** Gusts roughen the short waves first: fully below GUST_FULL_LENGTH, not at all above GUST_NONE_LENGTH (m). */
const GUST_FULL_LENGTH = 0.4;
const GUST_NONE_LENGTH = 3;

/** The spread's normalisation is tabled over its exponent at this many steps, each integrated over this many angles. */
const SPREAD_TABLE_STEPS = 32;
const SPREAD_ANGLES = 256;

/** Numbers per entry of a band table's `waves`: kx, kz (rad/m), omega (rad/s), the spread's exponent. */
export const BAND_WAVE_STRIDE = 4;
/** Numbers per entry of a band table's `noise`: a complex normal number. */
export const BAND_NOISE_STRIDE = 2;

const TURN = 2 * Math.PI;

/** The mean square slope of the sea in a wind of `speed` m/s (both directions together): Cox and Munk's, glassy in a calm. */
export function seaRoughness(speed: number): number {
  return (COX_BASE + COX_PER_SPEED * speed) * smoothstep(GLASSY_SPEED, RIPPLED_SPEED, speed) + GLASSY_SLOPE;
}

/** The mean square slope a wave set carries (both directions, its waves' (amp · k)² / 2 added up). */
export function slopeVariance(w: WaveSet): number {
  let sum = 0;
  for (let i = 0; i < w.kx.length; i++) sum += (w.amp[i]! * Math.hypot(w.kx[i]!, w.kz[i]!)) ** 2 / 2;
  return sum;
}

/** What the fine waves (and the ripples) carry in a wind of `speed` m/s when the simulated waves carry `coarse` of the slope. */
export function fineSlope(speed: number, coarse: number): number {
  return Math.max(seaRoughness(speed) - coarse, FINE_SLOPE_FLOOR);
}

/**
 * How much a gust that adds `gust` (a share of the mean speed) to a wind of `speed` m/s scales the fine waves' height,
 * when the simulated waves carry `coarse` of the slope: the square root of how much their slope grows (Cox and Munk).
 * In a light air a gust turns a glassy sea rough, so its patch shows dark; in a gale it adds little.
 */
export function gustRoughening(speed: number, coarse: number, gust: number): number {
  return Math.sqrt(fineSlope(speed * (1 + gust), coarse) / fineSlope(speed, coarse));
}

/** A short wave's angular frequency, rad/s, at wavenumber `k` rad/m: deep water, and surface tension for the shortest. */
export function fineOmega(k: number): number {
  return Math.sqrt(GRAVITY * k * (1 + (k / CAPILLARY_K) ** 2));
}

/** One band of the fine sea. */
export interface Band {
  /** The side of its tile, m. */
  readonly tile: number;
  /** The longest and the shortest wave it holds, m. */
  readonly longest: number;
  readonly shortest: number;
  /** How much a gust roughens its waves, 0..1 (by the length in the middle of its range). */
  readonly gust: number;
}

/** The fine sea's bands, coarsest first, each `texels` a side. */
export interface BandLayout {
  readonly texels: number;
  readonly bands: readonly Band[];
}

/** `count` bands of `texels`² from FINE_LONGEST down to FINE_SHORTEST, their ranges equal on a log scale. */
export function bandLayout(count: number, texels: number): BandLayout {
  const ratio = (FINE_LONGEST / FINE_SHORTEST) ** (1 / count), bands: Band[] = [];
  for (let b = 0; b < count; b++) {
    const longest = FINE_LONGEST / ratio ** b, shortest = longest / ratio;
    bands.push({
      tile: Math.min(longest * BAND_TILE_WAVES, (shortest * texels) / BAND_TEXELS_LEAST) * (1 - BAND_TILE_NUDGE * b), longest, shortest,
      gust: smoothstep(GUST_NONE_LENGTH, GUST_FULL_LENGTH, Math.sqrt(longest * shortest)),
    });
  }
  return { texels, bands };
}

/**
 * The fixed part of the bands, for the GPU: per band, per texel (row by row) the wavenumber it stands for, its
 * frequency and spread, the spectrum's part that does not change with the wind (`base`), and the seeded noise.
 */
export interface BandTables {
  /** kx, kz (rad/m), omega (rad/s, on FINE_REPEAT's whole multiples), the spread's exponent. */
  readonly waves: Float32Array;
  /**
   * √(C(s)·Δk² / 2) / k²: a wave's height is `noise · base · √(level · window · D)`, D = ((1 + cos of its angle to
   * the wind) / 2)^s (spectrum.ts `spread`), so its expected square is the spectrum level·k⁻⁴·C(s)·D·Δk² / 2 (half
   * for k, half for −k). Zero outside the band's range and for k = 0.
   */
  readonly base: Float32Array;
  /** A complex normal number per texel, each part of variance ½. */
  readonly noise: Float32Array;
}

/** The share of a full turn's spread at exponent `s` that is 1 at the wind: 1 / ∫ cos^(2s)(θ/2) dθ. */
const spreadNorms = (() => {
  const t: number[] = [];
  for (let i = 0; i <= SPREAD_TABLE_STEPS; i++) {
    const s = FINE_SPREAD_SHORT + ((FINE_SPREAD_LONG - FINE_SPREAD_SHORT) * i) / SPREAD_TABLE_STEPS, step = TURN / SPREAD_ANGLES;
    let sum = 0;
    for (let j = 0; j < SPREAD_ANGLES; j++) sum += spread(-Math.PI + (j + 1 / 2) * step, s) * step;
    t.push(1 / sum);
  }
  return t;
})();

/** The spread's normalisation C(s) for `s` within FINE_SPREAD_SHORT..FINE_SPREAD_LONG. */
export function spreadNorm(s: number): number {
  const u = ((s - FINE_SPREAD_SHORT) / (FINE_SPREAD_LONG - FINE_SPREAD_SHORT)) * SPREAD_TABLE_STEPS;
  const i = Math.max(0, Math.min(SPREAD_TABLE_STEPS - 1, Math.floor(u))), f = Math.max(0, Math.min(1, u - i));
  return spreadNorms[i]! + (spreadNorms[i + 1]! - spreadNorms[i]!) * f;
}

/** The spread's exponent for a wave `length` m long: FINE_SPREAD_LONG at FINE_LONGEST to FINE_SPREAD_SHORT at FINE_SHORTEST. */
function spreadAt(length: number): number {
  const share = Math.max(0, Math.min(1, Math.log(FINE_LONGEST / length) / Math.log(FINE_LONGEST / FINE_SHORTEST)));
  return FINE_SPREAD_LONG + (FINE_SPREAD_SHORT - FINE_SPREAD_LONG) * share;
}

/** The frequency index a texel stands for along one side: 0..texels/2 − 1, then the negative ones. */
const frequency = (i: number, n: number) => (i < n / 2 ? i : i - n);

/** The fixed tables of `layout`, its noise drawn from `seed`. */
export function bandTables(layout: BandLayout, seed: number): BandTables {
  const n = layout.texels, per = n * n, count = layout.bands.length;
  const waves = new Float32Array(count * per * BAND_WAVE_STRIDE), base = new Float32Array(count * per), noise = new Float32Array(count * per * BAND_NOISE_STRIDE);
  const omega0 = TURN / FINE_REPEAT, kBottom = TURN / FINE_SHORTEST;
  layout.bands.forEach((band, b) => {
    const dk = TURN / band.tile, kLo = TURN / band.longest, kHi = b === count - 1 ? kBottom : TURN / band.shortest;
    const rng = new Rng(deriveSeed(seed, 'fine band', count, b));
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = b * per + y * n + x, kx = frequency(x, n) * dk, kz = frequency(y, n) * dk, k = Math.hypot(kx, kz);
      const s = spreadAt(k > 0 ? TURN / k : FINE_LONGEST);
      waves.set([kx, kz, Math.round(fineOmega(k) / omega0) * omega0, s], i * BAND_WAVE_STRIDE);
      base[i] = k >= kLo && k < kHi ? Math.sqrt((spreadNorm(s) * dk * dk) / 2) / (k * k) : 0;
      noise[i * BAND_NOISE_STRIDE] = rng.gaussian(0, Math.SQRT1_2);
      noise[i * BAND_NOISE_STRIDE + 1] = rng.gaussian(0, Math.SQRT1_2);
    }
  });
  return { waves, base, noise };
}

/**
 * The integral over ln k from `a` to `b` of the fine waves' window: 0 above their longest wave (ln k below `top`),
 * rising as a smoothstep over FINE_FADE_IN, then 1 down to FINE_SHORTEST.
 */
function windowIntegral(top: number, a: number, b: number): number {
  const bottom = Math.log(TURN / FINE_SHORTEST);
  const upTo = (u: number) => {
    const v = Math.min(u, bottom) - top;
    if (v <= 0) return 0;
    if (v >= FINE_FADE_IN) return FINE_FADE_IN / 2 + v - FINE_FADE_IN;
    const x = v / FINE_FADE_IN;
    return FINE_FADE_IN * (x * x * x - (x * x * x * x) / 2);
  };
  return Math.max(0, upTo(b) - upTo(a));
}

/** What one wind layer's fine waves are, for any moment it shows. */
export interface FineLayer {
  /** The spectrum's level: height density = level · k⁻³ (over k, all directions) where the window is 1. */
  readonly level: number;
  /** Where its waves begin, ln of the wavenumber (rad/m) of its longest. */
  readonly top: number;
  /** The direction its wind blows toward, as a unit vector. */
  readonly dirX: number;
  readonly dirZ: number;
  /** The mean square slope each band carries of it, and the ripples'. */
  readonly slope: readonly number[];
  readonly ripples: number;
}

/**
 * A wind layer's fine waves: `wind` drives them (m/s, rad), `longest` (m) is where they begin below the simulated
 * waves, and `slope` is the mean square slope they and the ripples carry together, shared among `layout`'s bands.
 */
export function fineLayer(layout: BandLayout, speedToward: { readonly toward: number }, longest: number, slope: number): FineLayer {
  const ripples = slope * rippleShare(longest), waves = slope - ripples;
  const top = Math.log(TURN / Math.min(longest, FINE_LONGEST)), bottom = Math.log(TURN / FINE_SHORTEST);
  const whole = windowIntegral(top, top, bottom);
  // Height density level·k⁻³ carries slope level per unit of ln k (k² · level·k⁻³ · k).
  const level = whole > 0 ? waves / whole : 0;
  const slopes = layout.bands.map((b, i) => level * windowIntegral(top, Math.log(TURN / b.longest), i === layout.bands.length - 1 ? bottom : Math.log(TURN / b.shortest)));
  return { level, top, dirX: Math.cos(speedToward.toward), dirZ: Math.sin(speedToward.toward), slope: slopes, ripples: whole > 0 ? ripples : slope };
}

/** The fine sea of one moment, as the GPU and the sea's material read it. */
export interface FineFrame {
  /** The layers drawn (up to FINE_LAYERS), each with its weight (the factor of its waves' height). */
  readonly layers: { weight: number; layer: FineLayer | null }[];
  /** The mean square slope each band carries now, its layers weighted. */
  readonly slope: number[];
  /** The slope the ripples carry now. */
  ripples: number;
}

/** An empty frame for `layout`, to fill with `fineFrame`. */
export function fineFrameFor(layout: BandLayout): FineFrame {
  return { layers: Array.from({ length: FINE_LAYERS }, () => ({ weight: 0, layer: null })), slope: layout.bands.map(() => 0), ripples: 0 };
}

/** Every layer's fine waves, made when the layer first shows (for a layout) and kept while it lives. */
const made = new WeakMap<WaveSet, { layout: BandLayout; layer: FineLayer }>();
const weights: number[] = [];
const order: number[] = [];

/** A sea layer's fine waves under `layout`. */
function layerOf(sea: SeaState, i: number, layout: BandLayout): FineLayer {
  const l = sea.seaLayers[i]!;
  let m = made.get(l.waves);
  if (!m || m.layout !== layout) {
    const coarse = slopeVariance(l.waves) + slopeVariance(sea.seaSwell);
    m = { layout, layer: fineLayer(layout, l.wind, l.waves.shortest * FINE_OVERLAP, fineSlope(l.wind.speed, coarse)) };
    made.set(l.waves, m);
  }
  return m.layer;
}

/** Fill `out` with the sea's fine waves at time `t` (s) under `layout`: its strongest layers, weighted as their simulated waves are. */
export function fineFrame(sea: SeaState, t: number, layout: BandLayout, out: FineFrame): FineFrame {
  layerWeights(sea, t, weights);
  order.length = weights.length;
  for (let i = 0; i < weights.length; i++) order[i] = i;
  order.sort((a, b) => weights[b]! - weights[a]!);
  out.slope.fill(0);
  out.ripples = 0;
  for (let j = 0; j < FINE_LAYERS; j++) {
    const i = order[j], f = i === undefined ? 0 : weights[i]!, slot = out.layers[j]!;
    slot.weight = f > 0 ? f : 0;
    slot.layer = f > 0 ? layerOf(sea, i!, layout) : null;
    if (!slot.layer) continue;
    for (let b = 0; b < out.slope.length; b++) out.slope[b]! += f * f * slot.layer.slope[b]!;
    out.ripples += f * f * slot.layer.ripples;
  }
  return out;
}
