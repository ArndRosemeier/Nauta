/**
 * A wind's sea as a set of wave components: the spectrum for the wind's force, sampled with a seed into a few
 * dozen long-crested waves (direction, length, height, phase; deep-water speed). Every machine that has the seed
 * and the wind computes the same set. Pure.
 */
import { Rng } from '@futuremagic/core';
import { BEAUFORT, beaufortSpeed } from '../rules/beaufort';
import { SEA_BAND_HIGH, SEA_BAND_LOW, SEA_BY_FORCE, SEA_CHOPPINESS, SEA_COMPONENTS, SEA_FOLD_LIMIT, SEA_SPREAD } from '../rules/sea';
import { GRAVITY } from '../units';
import { jonswap, quantiles, spread } from './spectrum';

/** Significant wave height is four standard deviations of the surface's height (Hs = 4 √m0). */
export const HEIGHT_PER_DEVIATION = 4;

/** The wind that drives a sea: its mean speed (m/s at 10 m) and the direction it blows to (rad, 0 = +x, π/2 = +z). */
export interface SeaWind {
  readonly speed: number;
  readonly toward: number;
}

/**
 * A set of wave components, one entry per wave in each list. A wave's surface at a point (x, z) of the calm
 * sea, time t: phase θ = kx·x + kz·z − omega·t + phase, height amp·cos θ, and the water there moves sideways by
 * chop·amp·sin θ against its direction of travel (a Gerstner wave).
 */
export interface WaveSet {
  /** Wavenumber along x and along z, rad/m: the wave runs along (kx, kz), its length is 2π / |k|. */
  readonly kx: readonly number[];
  readonly kz: readonly number[];
  /** Angular frequency, rad/s (deep water: omega² = g·|k|). */
  readonly omega: readonly number[];
  /** Height of the crest over the mean level, m. */
  readonly amp: readonly number[];
  /** Phase at x = z = t = 0, rad. */
  readonly phase: readonly number[];
  /** Gerstner choppiness of every wave of the set (0..SEA_CHOPPINESS). */
  readonly chop: number;
  /** How far the mean level rises to make up for the Gerstner troughs being wider than the crests, m. */
  readonly lift: number;
  /** Significant wave height the set was made for, m. */
  readonly height: number;
  /** The length of the waves at the spectrum's peak, m. */
  readonly peakLength: number;
  /** The shortest wave in the set, m: the renderer's short waves begin below it. */
  readonly shortest: number;
}

/**
 * Significant wave height (m) and peak period (s) for a wind speed (m/s at 10 m): the presets of SEA_BY_FORCE,
 * read between forces by the typical speed of each force.
 */
export function seaPreset(speed: number): { height: number; period: number } {
  const last = BEAUFORT.length - 1;
  if (speed <= beaufortSpeed(0)) return { ...SEA_BY_FORCE[0]! };
  if (speed >= beaufortSpeed(last)) return { ...SEA_BY_FORCE[last]! };
  let f = 0;
  while (beaufortSpeed(f + 1) < speed) f++;
  const a = beaufortSpeed(f), b = beaufortSpeed(f + 1), u = (speed - a) / (b - a);
  const lo = SEA_BY_FORCE[f]!, hi = SEA_BY_FORCE[f + 1]!;
  return { height: lo.height + (hi.height - lo.height) * u, period: lo.period + (hi.period - lo.period) * u };
}

/**
 * The wave set for `wind`, drawn with `seed`. Frequencies are stratified so that each wave carries an equal share
 * of the spectrum's energy and the set's significant height is exactly the preset's; directions are drawn from
 * the spread around the wind, stratified too, in shuffled order; phases are free. The frequencies are jittered
 * inside their strata, so no two waves share a length and the sea never repeats.
 */
export function makeWaves(seed: number, wind: SeaWind): WaveSet {
  const { height, period } = seaPreset(wind.speed);
  const rng = new Rng(seed);
  const n = SEA_COMPONENTS;
  const peak = (2 * Math.PI) / period;
  const strata = (r: Rng) => Array.from({ length: n }, (_, i) => (i + r.float()) / n);
  const omega = quantiles((w) => jonswap(w, peak), SEA_BAND_LOW * peak, SEA_BAND_HIGH * peak, strata(rng.fork('frequency')));
  const order = rng.fork('order').shuffle(Array.from({ length: n }, (_, i) => i));
  const spreadShares = strata(rng.fork('direction'));
  const turns = quantiles((a) => spread(a, SEA_SPREAD), -Math.PI, Math.PI, order.map((i) => spreadShares[i]!));
  const phases = rng.fork('phase');
  // Equal energy per wave: amp²/2 each, adding up to the variance (height / 4)².
  const deviation = height / HEIGHT_PER_DEVIATION;
  const a = Math.sqrt((2 * deviation * deviation) / n);
  const kx: number[] = [], kz: number[] = [], amp: number[] = [], phase: number[] = [];
  let steepness = 0, shortest = Infinity;
  omega.forEach((w, i) => {
    const k = (w * w) / GRAVITY, dir = wind.toward + turns[i]!;
    kx.push(k * Math.cos(dir));
    kz.push(k * Math.sin(dir));
    amp.push(a);
    phase.push(phases.range(0, 2 * Math.PI));
    steepness += k * a;
    shortest = Math.min(shortest, (2 * Math.PI) / k);
  });
  const chop = steepness > 0 ? Math.min(SEA_CHOPPINESS, SEA_FOLD_LIMIT / steepness) : SEA_CHOPPINESS;
  // The Eulerian mean of a Gerstner wave lies chop·k·amp²/2 below its calm level; lift it back so the sea keeps
  // its volume and a hull floats at the same mean level in calm and in a seaway.
  const lift = omega.reduce((sum, w) => sum + (chop * (w * w) / GRAVITY * a * a) / 2, 0);
  const peakLength = (2 * Math.PI * GRAVITY) / (peak * peak);
  return { kx, kz, omega, amp, phase, chop, lift, height, peakLength, shortest };
}
