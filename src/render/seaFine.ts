/**
 * The sea's fine waves (plan N1.4): the many short waves below the simulated set's shortest, from metres down to the
 * ripples a breath of wind raises, that the sea's material sums per pixel for its normal. Each wind layer of the sea
 * gets its own seeded set, faded in and out with the layer, so a change of wind changes the ripples without a jump.
 *
 * How rough the water is comes from Cox and Munk's measurements of sun glitter (1954): the mean square slope of the
 * sea grows with the wind. The simulated waves carry part of it; the fine waves carry the rest, an equal share per
 * wave over lengths spread evenly on a log scale (the slope of a wind sea's short waves is about equal per octave).
 * The sum of so many waves in different directions never repeats, so no tile shows. Never touches the simulation
 * (it is drawn only); the GPU's fine sea (N1.2) will take over its waves. Pure.
 */
import { Rng, deriveSeed, smoothstep } from '@futuremagic/core';
import { layerWeights, type SeaState } from '../sim/sea/sea';
import { quantiles, spread } from '../sim/sea/spectrum';
import type { SeaWind, WaveSet } from '../sim/sea/waves';
import { GRAVITY } from '../sim/units';

/** Fine waves per wind layer: every one costs a sine and a cosine per pixel near the eye (a quality knob, N1.8). */
export const SEA_FINE_PER_LAYER = 28;
/** Room for fine waves drawn at once: two wind layers while one fades into the other, with one to spare. */
export const SEA_FINE_DRAWN = 3 * SEA_FINE_PER_LAYER;
/** The shortest fine wave, m: shorter ripples are smaller than a pixel from the deck. */
export const FINE_SHORTEST = 0.035;
/** The longest fine wave as a share of the simulated set's shortest: a little overlap, so no band is left empty. */
const FINE_OVERLAP = 0.9;
/** The fine waves run more across the wind than the long ones (their spread's exponent, long end), the ripples nearly every way (short end). */
const FINE_SPREAD_LONG = 2;
const FINE_SPREAD_SHORT = 0.5;
/** Ripples shorter than this are held up by surface tension and run faster (capillary waves): rad/m (Phillips 1977). */
const CAPILLARY_K = 363;

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

/** Numbers per wave in each of the table's lists (one vec4 each). */
export const SEA_FINE_STRIDE = 4;
/** Where each number of a fine wave sits in its entry of `wave`: kx, kz, phase now at the origin, height. */
export const FINE_AT = { kx: 0, kz: 1, phase: 2, height: 3 } as const;
/** And in `more`: |k|, the slope variance of this wave and every shorter one, how much gusts roughen it (0..1). */
export const FINE_MORE_AT = { k: 0, tail: 1, gust: 2 } as const;

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

/** What the fine waves carry in a wind of `speed` m/s when the simulated waves carry `coarse` of the slope. */
export function fineSlope(speed: number, coarse: number): number {
  return Math.max(seaRoughness(speed) - coarse, FINE_SLOPE_FLOOR);
}

/** One wind layer's fine waves. */
export interface FineSet {
  readonly kx: Float64Array;
  readonly kz: Float64Array;
  readonly omega: Float64Array;
  readonly amp: Float64Array;
  readonly phase: Float64Array;
  /** How much a gust roughens each wave, 0..1. */
  readonly gust: Float64Array;
}

/**
 * The fine waves of a wind layer: `wind` drives them, `longest` (m) is where they begin below the simulated waves,
 * and `slope` is the mean square slope they carry together. Drawn with `seed`.
 */
export function makeFineWaves(seed: number, wind: SeaWind, longest: number, slope: number): FineSet {
  const n = SEA_FINE_PER_LAYER, rng = new Rng(seed);
  const set: FineSet = {
    kx: new Float64Array(n), kz: new Float64Array(n), omega: new Float64Array(n), amp: new Float64Array(n),
    phase: new Float64Array(n), gust: new Float64Array(n),
  };
  const lengths = rng.fork('length'), turns = rng.fork('direction'), phases = rng.fork('phase');
  const top = Math.log(Math.max(longest, FINE_SHORTEST)), bottom = Math.log(FINE_SHORTEST);
  // Equal slope per wave: (amp · k)² / 2 = slope / n.
  const each = Math.sqrt((2 * slope) / n);
  for (let i = 0; i < n; i++) {
    // Lengths stratified on a log scale, longest first, each jittered inside its stratum.
    const share = (i + lengths.float()) / n, length = Math.exp(top + (bottom - top) * share);
    const k = TURN / length;
    const s = FINE_SPREAD_LONG + (FINE_SPREAD_SHORT - FINE_SPREAD_LONG) * share;
    const [turn] = quantiles((a) => spread(a, s), -Math.PI, Math.PI, [turns.float()]);
    const dir = wind.toward + turn!;
    set.kx[i] = k * Math.cos(dir);
    set.kz[i] = k * Math.sin(dir);
    set.omega[i] = Math.sqrt(GRAVITY * k * (1 + (k / CAPILLARY_K) ** 2));
    set.amp[i] = each / k;
    set.phase[i] = phases.range(0, TURN);
    set.gust[i] = smoothstep(GUST_NONE_LENGTH, GUST_FULL_LENGTH, length);
  }
  return set;
}

/** The fine waves of one moment as the sea's material reads them: ordered from long to short. */
export interface FineTable {
  /** Per wave: kx, kz (rad/m), the phase now at the table's origin (rad, −π..π), height (m, weighted by its layer). */
  readonly wave: Float32Array;
  /** Per wave: |k| (rad/m), the slope variance of it and every shorter wave, its gust share, one unused. */
  readonly more: Float32Array;
  count: number;
}

/** An empty table, to fill with `fillFineWaves`. */
export function fineTable(): FineTable {
  return { wave: new Float32Array(SEA_FINE_DRAWN * SEA_FINE_STRIDE), more: new Float32Array(SEA_FINE_DRAWN * SEA_FINE_STRIDE), count: 0 };
}

/** Every layer's fine set, made when the layer first shows and kept while it lives. */
const made = new WeakMap<WaveSet, FineSet>();
/** Scratch for one moment: the waves gathered from every layer, then their order by length. */
const gathered = { kx: new Float64Array(SEA_FINE_DRAWN), kz: new Float64Array(SEA_FINE_DRAWN), phase: new Float64Array(SEA_FINE_DRAWN), amp: new Float64Array(SEA_FINE_DRAWN), gust: new Float64Array(SEA_FINE_DRAWN), k: new Float64Array(SEA_FINE_DRAWN) };
const order: number[] = [];
const weights: number[] = [];

/** A layer's fine set: its seed from the sea's and the moment the layer began. */
function fineOf(sea: SeaState, i: number): FineSet {
  const layer = sea.seaLayers[i]!;
  let set = made.get(layer.waves);
  if (!set) {
    const coarse = slopeVariance(layer.waves) + slopeVariance(sea.seaSwell);
    set = makeFineWaves(deriveSeed(sea.seaSeed, 'fine', Math.round(layer.start)), layer.wind, layer.waves.shortest * FINE_OVERLAP, fineSlope(layer.wind.speed, coarse));
    made.set(layer.waves, set);
  }
  return set;
}

/**
 * Fill `table` with the sea's fine waves at time `t` (s), their phases for x and z measured from the calm point
 * (ox, oz), every wind layer weighted as its simulated waves are (`layerWeights`), ordered from long to short.
 */
export function fillFineWaves(sea: SeaState, t: number, ox: number, oz: number, table: FineTable): FineTable {
  layerWeights(sea, t, weights);
  const g = gathered;
  let n = 0;
  for (let i = 0; i < weights.length; i++) {
    const f = weights[i]!;
    if (f <= 0) continue;
    const set = fineOf(sea, i);
    for (let j = 0; j < set.kx.length && n < SEA_FINE_DRAWN; j++, n++) {
      const kx = set.kx[j]!, kz = set.kz[j]!, phase = kx * ox + kz * oz - set.omega[j]! * t + set.phase[j]!;
      g.kx[n] = kx; g.kz[n] = kz; g.amp[n] = f * set.amp[j]!; g.gust[n] = set.gust[j]!;
      g.phase[n] = phase - TURN * Math.round(phase / TURN);
      g.k[n] = Math.hypot(kx, kz);
    }
  }
  order.length = n;
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => g.k[a]! - g.k[b]!);
  // From the shortest up: each wave's slope variance with that of every shorter one (what a pixel too coarse to
  // draw them gets as roughness instead).
  let tail = 0;
  for (let i = n - 1; i >= 0; i--) {
    const w = order[i]!, at = i * SEA_FINE_STRIDE;
    tail += (g.amp[w]! * g.k[w]!) ** 2 / 2;
    table.wave[at + FINE_AT.kx] = g.kx[w]!;
    table.wave[at + FINE_AT.kz] = g.kz[w]!;
    table.wave[at + FINE_AT.phase] = g.phase[w]!;
    table.wave[at + FINE_AT.height] = g.amp[w]!;
    table.more[at + FINE_MORE_AT.k] = g.k[w]!;
    table.more[at + FINE_MORE_AT.tail] = tail;
    table.more[at + FINE_MORE_AT.gust] = g.gust[w]!;
  }
  table.count = n;
  return table;
}

/**
 * How much a gust that adds `gust` (a share of the mean speed) to a wind of `speed` m/s scales the fine waves' height,
 * when the simulated waves carry `coarse` of the slope: the square root of how much their slope grows (Cox and Munk).
 * In a light air a gust turns a glassy sea rough, so its patch shows dark; in a gale it adds little.
 */
export function gustRoughening(speed: number, coarse: number, gust: number): number {
  return Math.sqrt(fineSlope(speed * (1 + gust), coarse) / fineSlope(speed, coarse));
}
