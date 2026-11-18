/**
 * The ambience of sea and wind (plan N1.7): from the sea's state, the wind at the listener and the water under them,
 * the level of every bed. Pure: it decides what is heard; `seaSound.ts` plays it.
 *
 * - The sea's beds crossfade by the force of the sea, which follows the wave layers as they fade in and out over
 *   minutes, so the sound changes with the sea and never ahead of it.
 * - The wind's beds crossfade by the wind's speed at the listener, gusts included.
 * - Each bed is two takes blended by a slow seeded swing, so no loop is heard.
 * - A deep surge swells as the water under the listener rises and falls.
 */
import { TAU, clamp, deriveSeed, hashToFloat, lerp, smoothstep } from '@futuremagic/core';
import { beaufortForce } from '../sim/rules/beaufort';
import { layerWeights, type SeaState } from '../sim/sea/sea';
import {
  SEA_BEDS, SEA_GLIDE, SWELL_GAIN, SWELL_SPEED_FULL, TAKE_SWING, WIND_BEDS, WIND_FULL, WIND_GLIDE, WIND_SILENT, type BedAnchor,
} from './tuning';

/** The two takes of every bed are named with these letters (`bed/sea-calm-a`). */
export const TAKES = ['a', 'b'] as const;
/** The swell's surge: one take. */
export const SWELL_BED = 'bed/swell';

/** What the ambience is made from at one moment. */
export interface Hearing {
  /** The force of the sea (`seaForce`). */
  readonly seaForce: number;
  /** The wind's speed at the listener, gusts included, m/s. */
  readonly windSpeed: number;
  /** The water's vertical speed under the listener, m/s. */
  readonly rise: number;
  /** The clock, s. */
  readonly t: number;
}

/** One bed's level now, and how fast it should glide there (s). */
export interface BedLevel {
  id: string;
  level: number;
  glide: number;
}

const weights: number[] = [];

/**
 * The force of the sea at time `t`, on the Beaufort scale with fractions: each wave layer's wind as a force, weighted by
 * its share of the sea's energy (the squares of `layerWeights`, which add up to 1), so it moves only as the waves do.
 */
export function seaForce(sea: SeaState, t: number): number {
  layerWeights(sea, t, weights);
  let f = 0;
  for (let i = 0; i < weights.length; i++) f += weights[i]! * weights[i]! * beaufortForce(sea.seaLayers[i]!.wind.speed);
  return f;
}

/**
 * Each anchor's weight at `x` on its scale, into `out`: the two neighbours around `x` share it at equal power (their
 * squares add up to 1); below the first anchor or above the last, that one alone.
 */
export function anchorWeights(anchors: readonly BedAnchor[], x: number, out: number[] = []): number[] {
  out.length = anchors.length;
  out.fill(0);
  const last = anchors.length - 1;
  if (x <= anchors[0]!.at) { out[0] = 1; return out; }
  if (x >= anchors[last]!.at) { out[last] = 1; return out; }
  let i = 0;
  while (x > anchors[i + 1]!.at) i++;
  const u = (x - anchors[i]!.at) / (anchors[i + 1]!.at - anchors[i]!.at), angle = (u * Math.PI) / 2;
  out[i] = Math.cos(angle);
  out[i + 1] = Math.sin(angle);
  return out;
}

/**
 * How the level of a bed is shared between its two takes at time `t`: the angle whose cosine is take a's share and whose
 * sine is take b's (equal power), swinging slowly between 0 and a quarter turn over a period seeded per bed.
 */
export function takeAngle(seed: number, id: string, t: number): number {
  const period = lerp(TAKE_SWING[0], TAKE_SWING[1], hashToFloat(deriveSeed(seed, id, 'swing')));
  const phase = TAU * hashToFloat(deriveSeed(seed, id, 'phase'));
  return ((Math.PI / 2) * (1 + Math.sin((TAU * t) / period + phase))) / 2;
}

const share: number[] = [];

/** Push the two takes of every anchor of `anchors` at `x`, scaled by `scale`, onto `out`. */
export function pushBeds(out: BedLevel[], anchors: readonly BedAnchor[], x: number, scale: number, glide: number, seed: number, t: number): void {
  anchorWeights(anchors, x, share);
  anchors.forEach((a, i) => {
    const level = share[i]! * a.gain * scale, angle = takeAngle(seed, a.id, t);
    out.push({ id: `${a.id}-${TAKES[0]}`, level: level * Math.cos(angle), glide }, { id: `${a.id}-${TAKES[1]}`, level: level * Math.sin(angle), glide });
  });
}

/** How loud the wind is heard at a speed, 0..1 of its beds' gain: nothing in a calm, all from a light breeze on. */
export function windPresence(speed: number): number {
  return smoothstep(WIND_SILENT, WIND_FULL, speed);
}

/** The swell's surge for the water's vertical speed under the listener. */
export function swellLevel(rise: number): number {
  return lerp(SWELL_GAIN[0], SWELL_GAIN[1], clamp(Math.abs(rise) / SWELL_SPEED_FULL, 0, 1));
}

/**
 * The level of every bed now, into `out` (cleared first): the sea's beds, the wind's beds and the swell's surge. A bed
 * with level 0 is listed too, so the player fades it out.
 */
export function bedLevels(h: Hearing, seed: number, out: BedLevel[] = []): BedLevel[] {
  out.length = 0;
  pushBeds(out, SEA_BEDS, h.seaForce, 1, SEA_GLIDE, seed, h.t);
  pushBeds(out, WIND_BEDS, h.windSpeed, windPresence(h.windSpeed), WIND_GLIDE, seed, h.t);
  out.push({ id: SWELL_BED, level: swellLevel(h.rise), glide: SEA_GLIDE });
  return out;
}

/** Every sound id the beds may ask for (for the tests and for loading ahead). */
export function bedIds(): string[] {
  return [...SEA_BEDS, ...WIND_BEDS].flatMap((a) => TAKES.map((k) => `${a.id}-${k}`)).concat(SWELL_BED);
}
