/**
 * The sea (implementation plan N1.1): one function of seed, wind and the shared clock, the same on every machine.
 * `seaAt` is the surface as the renderer displaces it (a point of the calm sea and where its water is now);
 * `surfaceAt` is the water under a point of the world, what a hull feels. A change of wind fades the old waves
 * out and the new ones in over SEA_CHANGE_SECONDS, without a jump. Pure; the state is plain data.
 */
import { deriveSeed, smoothstep } from '@futuremagic/core';
import { SEA_CHANGE_SECONDS, SEA_FOLLOW_ANGLE, SEA_FOLLOW_SPEED } from '../rules/sea';
import { sincos } from '../trig';
import { makeSwell } from './swell';
import { makeWaves, type SeaWind, type WaveSet } from './waves';

/** One wave set and when it fades in (s of the shared clock); the first layer of a sea is there from the start. */
export interface SeaLayer {
  readonly wind: SeaWind;
  readonly waves: WaveSet;
  readonly start: number;
  readonly end: number;
}

/**
 * The sea's state: its seed, its swell and its wind's wave layers, oldest first. Each layer fades in over its
 * [start, end] while every layer before it fades out, keeping the sea's energy: the share of layer i is
 * w_i·Π(1 − w_j) over the later layers j. The swell is always there at full strength and never changes.
 * Changed only here (rules.json `owners`).
 */
export interface SeaState {
  readonly seaSeed: number;
  /** The swell from elsewhere (N1.10): drawn once with the sea, the same whatever the wind does later. */
  readonly seaSwell: WaveSet;
  /** How many wave sets this sea has made; each gets its own seed, so no two layers are alike. */
  readonly setsMade: number;
  readonly seaLayers: readonly SeaLayer[];
}

/** The sea at one point and time. Reused through the `out` argument, so sampling allocates nothing. */
export interface SeaSample {
  /** Height of the surface over the calm sea's level, m. */
  height: number;
  /** Unit normal of the surface, pointing up: [x, y, z]. */
  readonly normal: [number, number, number];
  /** How far the surface point has moved sideways from its calm place, m: [x, z]. */
  readonly shift: [number, number];
  /** Velocity of the water at the surface, m/s: [x, y, z]. */
  readonly velocity: [number, number, number];
  /**
   * How the surface is stretched sideways (the Jacobian of calm place to place now): 1 flat, below 1 where
   * the water bunches into a crest, above 1 in a trough. Never reaches 0: the simulated sea does not fold.
   */
  stretch: number;
}

/** Most Newton steps of `surfaceAt`: each squares the error, so a gale's metres of shift fall below a millimetre in three. */
const SURFACE_STEPS = 4;
/** `surfaceAt` stops early once the point it found is this close to the one asked for, m. */
const SURFACE_TOLERANCE = 1e-4;

/** A fresh sample to pass as `out`. */
export function seaSample(): SeaSample {
  return { height: 0, normal: [0, 1, 0], shift: [0, 0], velocity: [0, 0, 0], stretch: 1 };
}

/** A sea under `wind` from time `t` on, with its swell coming from well off that wind. */
export function startSea(seed: number, wind: SeaWind, t: number): SeaState {
  const waves = makeWaves(deriveSeed(seed, 'sea', 0), wind);
  const seaSwell = makeSwell(deriveSeed(seed, 'swell'), wind.toward);
  return { seaSeed: seed, seaSwell, setsMade: 1, seaLayers: [{ wind, waves, start: t, end: t }] };
}

/**
 * The sea after its wind changes to `wind` at time `t`: the new waves fade in over SEA_CHANGE_SECONDS. A change
 * while an earlier one is still fading waits for it to finish; a change that is still waiting is replaced, as it
 * has not shown yet. Layers that are fully faded out are dropped.
 */
export function changeWind(sea: SeaState, wind: SeaWind, t: number): SeaState {
  let layers = sea.seaLayers.filter((l, i) => i === 0 || l.start <= t);
  // Everything before the last layer that has fully faded in is gone.
  let done = 0;
  layers.forEach((l, i) => { if (l.end <= t) done = i; });
  layers = layers.slice(done);
  const start = Math.max(t, layers[layers.length - 1]!.end);
  const waves = makeWaves(deriveSeed(sea.seaSeed, 'sea', sea.setsMade), wind);
  return { ...sea, setsMade: sea.setsMade + 1, seaLayers: [...layers, { wind, waves, start, end: start + SEA_CHANGE_SECONDS }] };
}

/**
 * The sea following a wind that moves all the time (the wind's mean, `meanWind` in src/sim/wind.ts): unchanged
 * while `wind` is within SEA_FOLLOW_SPEED and SEA_FOLLOW_ANGLE of the wind the sea last took, else `changeWind`.
 * Call it every step; the sea takes a new wave set only now and then.
 */
export function followWind(sea: SeaState, wind: SeaWind, t: number): SeaState {
  const last = sea.seaLayers[sea.seaLayers.length - 1]!.wind;
  const turned = Math.abs(Math.atan2(Math.sin(wind.toward - last.toward), Math.cos(wind.toward - last.toward)));
  return Math.abs(wind.speed - last.speed) < SEA_FOLLOW_SPEED && turned < SEA_FOLLOW_ANGLE ? sea : changeWind(sea, wind, t);
}

/** The wind the sea is following at time `t`: that of the newest layer that has begun to fade in. */
export function seaWind(sea: SeaState, t: number): SeaWind {
  let wind = sea.seaLayers[0]!.wind;
  for (const l of sea.seaLayers) if (l.start <= t) wind = l.wind;
  return wind;
}

/** How far a layer has faded in at time `t`, as the angle whose sine is its amplitude factor (0..π/2), eased. */
function fadeAngle(layer: SeaLayer, t: number): number {
  return t >= layer.end ? Math.PI / 2 : (Math.PI / 2) * smoothstep(layer.start, layer.end, t);
}

/** Running sums of every wave's terms at one point: the surface, its slopes and its sideways stretch. */
interface Sums {
  h: number; dx: number; dz: number; vx: number; vy: number; vz: number;
  hx: number; hz: number; xx: number; xz: number; zz: number;
}
const sums: Sums = { h: 0, dx: 0, dz: 0, vx: 0, vy: 0, vz: 0, hx: 0, hz: 0, xx: 0, xz: 0, zz: 0 };
const sc: [number, number] = [0, 0];

/** Add one wave set, weighted by `f`, at calm point (x, z), time t. */
function addWaves(s: Sums, w: WaveSet, f: number, x: number, z: number, t: number): void {
  const { kx, kz, omega, amp, phase, reach } = w;
  let h = 0, dx = 0, dz = 0, vx = 0, vy = 0, vz = 0, hx = 0, hz = 0, xx = 0, xz = 0, zz = 0;
  for (let i = 0; i < kx.length; i++) {
    const ax = kx[i]!, az = kz[i]!, om = omega[i]!, a = amp[i]!;
    sincos(ax * x + az * z - om * t + phase[i]!, sc);
    const sn = sc[0], c = sc[1], q = reach[i]!, qs = q * sn, qc = q * c, as = a * sn;
    h += a * c;
    dx -= ax * qs;
    dz -= az * qs;
    vx += ax * om * qc;
    vy += om * as;
    vz += az * om * qc;
    hx -= ax * as;
    hz -= az * as;
    xx -= ax * ax * qc;
    xz -= ax * az * qc;
    zz -= az * az * qc;
  }
  s.h += f * h + f * f * w.lift;
  s.dx += f * dx; s.dz += f * dz;
  s.vx += f * vx; s.vy += f * vy; s.vz += f * vz;
  s.hx += f * hx; s.hz += f * hz;
  s.xx += f * xx; s.xz += f * xz; s.zz += f * zz;
}

/**
 * How strongly each layer shows at time `t`, into `out` (one factor per layer, oldest first): the amplitude
 * factor of every wave of that layer. The newest layer fades in as sin, every older one fades out by the cos of
 * each later one's fade, so the squares (the energy shares) add up to 1 and nothing jumps.
 */
export function layerWeights(sea: SeaState, t: number, out: number[] = []): number[] {
  const layers = sea.seaLayers;
  out.length = layers.length;
  let later = 1;
  for (let i = layers.length - 1; i >= 0; i--) {
    const angle = i === 0 ? Math.PI / 2 : fadeAngle(layers[i]!, t);
    out[i] = later * Math.sin(angle);
    later *= Math.cos(angle);
  }
  return out;
}

const weights: number[] = [];

/**
 * Every wave set that shows at time `t`, passed to `visit` with its factor: the swell at 1, then each wind layer
 * whose factor from `layerWeights` is above 0. What `seaAt` sums, and what the renderer draws (render/seaWaves.ts).
 */
export function forEachShownSet(sea: SeaState, t: number, visit: (waves: WaveSet, factor: number) => void): void {
  visit(sea.seaSwell, 1);
  layerWeights(sea, t, weights);
  for (let i = 0; i < weights.length; i++) if (weights[i]! > 0) visit(sea.seaLayers[i]!.waves, weights[i]!);
}

/**
 * The highest the water can stand anywhere at time `t`, m above the calm level: every shown wave's amplitude and lift
 * at their crests together. Above it nothing meets the sea (a ball in flight need not sample it there).
 */
export function highestWater(sea: SeaState, t: number): number {
  let most = 0;
  forEachShownSet(sea, t, (w, f) => { most += f * w.amp.reduce((a, b) => a + b, 0) + f * f * w.lift; });
  return most;
}

/** The calm point and time `sumAt` sums at, for `addHere` (kept here so a sample allocates nothing). */
const here = { x: 0, z: 0, t: 0 };
const addHere = (waves: WaveSet, factor: number): void => addWaves(sums, waves, factor, here.x, here.z, here.t);

/** Sum the swell and every layer at calm point (x, z), time t, into `sums`. */
function sumAt(sea: SeaState, x: number, z: number, t: number): Sums {
  sums.h = sums.dx = sums.dz = sums.vx = sums.vy = sums.vz = sums.hx = sums.hz = sums.xx = sums.xz = sums.zz = 0;
  here.x = x; here.z = z; here.t = t;
  forEachShownSet(sea, t, addHere);
  return sums;
}

/**
 * The sea at the calm point (x, z), time t (s of the shared clock): how high it stands there, how far its water
 * has moved sideways, its normal and the water's velocity. This is the surface exactly as the renderer displaces
 * it: the vertex of the calm sea at (x, z) is drawn at (x + shift[0], height, z + shift[1]). It sums the swell
 * (`seaSwell`, factor 1) and every wind layer (factor from `layerWeights`) alike.
 */
export function seaAt(sea: SeaState, x: number, z: number, t: number, out: SeaSample = seaSample()): SeaSample {
  return fill(out, sumAt(sea, x, z, t));
}

/**
 * The sea under the world point (x, z) at time t: finds the calm point whose water has moved to (x, z) (Newton's
 * method on the sideways shift) and returns the sea there. Its `height` is the water's height at (x, z), what a
 * hull at (x, z) is pushed by.
 */
export function surfaceAt(sea: SeaState, x: number, z: number, t: number, out: SeaSample = seaSample()): SeaSample {
  let cx = x, cz = z;
  for (let step = 0; step < SURFACE_STEPS; step++) {
    const s = sumAt(sea, cx, cz, t);
    const rx = cx + s.dx - x, rz = cz + s.dz - z;
    if (rx * rx + rz * rz < SURFACE_TOLERANCE * SURFACE_TOLERANCE) return fill(out, s);
    // Solve [[1 + xx, xz], [xz, 1 + zz]] · d = r.
    const a = 1 + s.xx, b = s.xz, d = 1 + s.zz, det = a * d - b * b;
    cx -= (d * rx - b * rz) / det;
    cz -= (a * rz - b * rx) / det;
  }
  return fill(out, sumAt(sea, cx, cz, t));
}

/** Turn the summed terms into a sample. */
function fill(out: SeaSample, s: Sums): SeaSample {
  out.height = s.h;
  out.shift[0] = s.dx;
  out.shift[1] = s.dz;
  out.velocity[0] = s.vx;
  out.velocity[1] = s.vy;
  out.velocity[2] = s.vz;
  // Tangents of the surface along calm x and calm z, and their cross product (z × x points up).
  const txx = 1 + s.xx, txy = s.hx, txz = s.xz;
  const tzx = s.xz, tzy = s.hz, tzz = 1 + s.zz;
  const nx = tzy * txz - tzz * txy, ny = tzz * txx - tzx * txz, nz = tzx * txy - tzy * txx;
  const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
  out.normal[0] = nx / len;
  out.normal[1] = ny / len;
  out.normal[2] = nz / len;
  out.stretch = txx * tzz - txz * tzx;
  return out;
}
