/**
 * The wind over the fight (N1.6): one true wind that drives the sea and fills the sails, a function of the wind's
 * state, the place and the time, so every machine computes the same wind without sending it. Pure.
 *
 * - The mean wind keeps its preset's speed and bearing on the whole, but veers slowly to and fro and freshens and
 *   eases a little: a sum of slow seeded swings whose reach is held to the preset's limits (rules/wind.ts).
 * - Gusts are moving patches. Each is born at a seeded place and time, swells and fades over its life, and drifts
 *   with the mean wind. Where it lies it adds to the speed (`windAt`); the sea draws it as darker ruffled water
 *   (`gustsNear`, read by N1.4).
 * - The mean speed of the preset holds over time and space with the gusts counted: the speed under the gusts is
 *   lowered by exactly what the gusts add on average.
 */
import { TAU, deriveSeed, hash3i, hashCombine, hashToFloat, lerp } from '@futuremagic/core';
import { beaufortSpeed } from './rules/beaufort';
import { FRESHEN_PERIOD, GUST_CHANCE, VEER_PERIOD, WIND_PRESETS, WIND_SWINGS, type WindPreset } from './rules/wind';
import { bearingDir, wrapBearing } from './units';

/** What makes the wind of a match: plain data, sent and saved as it is. Made by `makeWind`, changed by nothing else. */
export interface WindState {
  /** The seed of the wind's swings and gusts. */
  readonly windSeed: number;
  /** Its strength on the Beaufort scale: the row of rules/wind.ts. */
  readonly windForce: number;
  /** The mean compass bearing the wind blows from, rad (units.ts: 0 north, clockwise). */
  readonly windFrom: number;
}

/** The wind at one place and moment. */
export interface Wind {
  /** Speed, m/s, 10 m above the sea. */
  speed: number;
  /** The direction it blows toward as an angle on the water, rad: 0 is +x, a quarter turn is +z (the sea's angle). */
  toward: number;
  /** The unit direction it blows toward, x and z. */
  x: number;
  z: number;
  /** The compass bearing it blows from, rad (units.ts), as a sailor names a wind. */
  from: number;
  /** What the gusts here add to the mean speed, as a fraction of it (0 where none lies). */
  gust: number;
}

/** A gust patch on the water at one moment. */
export interface Gust {
  /** Its heart, m. */
  x: number;
  z: number;
  /** How far it reaches from its heart, m. */
  radius: number;
  /** What it adds to the mean speed at its heart now, as a fraction of the mean (rises from 0 and falls back to 0). */
  strength: number;
  /** What it adds at its heart at its peak. */
  peak: number;
}

/** One slow swing: amplitude (no unit), angular speed (rad/s) and phase (rad). */
interface Swing {
  readonly amp: number;
  readonly omega: number;
  readonly phase: number;
}

/** What the wind's state works out to; derived once per state and kept beside it (a cache of a pure function). */
interface Field {
  readonly preset: WindPreset;
  /** The mean speed before the gusts are added, m/s. */
  readonly base: number;
  /** Unit direction the mean wind blows toward (x, z), and the direction a quarter turn clockwise from it. */
  readonly ex: number;
  readonly ez: number;
  readonly px: number;
  readonly pz: number;
  readonly veers: readonly Swing[];
  readonly freshens: readonly Swing[];
  readonly gustSeed: number;
  /** Side of a gust's birth cell, m, and length of its birth slot, s (the longest life, so a gust spans two slots at most). */
  readonly cell: number;
  readonly slot: number;
}

/** The wind of a match: a seed, a force on the Beaufort scale (a row of rules/wind.ts) and the bearing it blows from. */
export function makeWind(seed: number, force: number, from: number): WindState {
  if (!Number.isInteger(force) || !WIND_PRESETS[force]) {
    throw new RangeError(`no wind preset for force ${force} (0 to ${WIND_PRESETS.length - 1})`);
  }
  return { windSeed: seed >>> 0, windForce: force, windFrom: wrapBearing(from) };
}

/** The mean wind at a moment, without gusts: what drives the sea. */
export function meanWind(state: WindState, t: number, out: Wind = blankWind()): Wind {
  return windWith(state, fieldOf(state), t, 0, out);
}

/** The true wind at a place (x, z, m) and moment (t, s): the mean wind with the gusts lying there. What fills the sails. */
export function windAt(state: WindState, x: number, z: number, t: number, out: Wind = blankWind()): Wind {
  const field = fieldOf(state);
  let gust = 0;
  forEachGust(field, x, z, t, 0, (gx, gz, radius, strength) => {
    gust += strength * gustShape(Math.hypot(x - gx, z - gz) / radius);
  });
  return windWith(state, field, t, gust, out);
}

/** The gusts on the water at a moment whose patches reach within `radius` (m) of (x, z): for the sea to draw. */
export function gustsNear(state: WindState, x: number, z: number, t: number, radius: number): Gust[] {
  const found: Gust[] = [];
  forEachGust(fieldOf(state), x, z, t, radius, (gx, gz, r, strength, peak) => {
    if (Math.hypot(x - gx, z - gz) < r + radius) found.push({ x: gx, z: gz, radius: r, strength, peak });
  });
  return found;
}

/**
 * A gust's shape across its patch: the share of its heart's strength at `d` radii from its heart, 1 at the heart,
 * falling smoothly to 0 at the rim and beyond. Its area is a third of the disc's (pi r² / 3). The sea draws the same shape.
 */
export function gustShape(d: number): number {
  return d < 1 ? (1 - d * d) ** 2 : 0;
}

function blankWind(): Wind {
  return { speed: 0, toward: 0, x: 0, z: 0, from: 0, gust: 0 };
}

function windWith(state: WindState, field: Field, t: number, gust: number, out: Wind): Wind {
  const veer = Math.atan(swing(field.veers, t));
  out.from = wrapBearing(state.windFrom + veer);
  [out.x, out.z] = bearingDir(out.from + Math.PI);
  out.toward = Math.atan2(out.z, out.x);
  out.speed = field.base * (1 + swing(field.freshens, t)) * (1 + gust);
  out.gust = gust;
  return out;
}

/** The sum of slow swings at time t. */
function swing(swings: readonly Swing[], t: number): number {
  let sum = 0;
  for (const s of swings) sum += s.amp * Math.sin(s.omega * t + s.phase);
  return sum;
}

/**
 * How far the air (and every gust in it) has drifted by time t, m: the mean wind's velocity added up from time 0.
 * The velocity is the speed under the gusts times (e + a(t) p), whose bearing is exactly the veered bearing, so a gust
 * drifts the way the wind blows. Its speed is that of the steady mean, within a few percent: the swings are slow.
 */
function drift(field: Field, t: number): [number, number] {
  let side = 0;
  for (const s of field.veers) side += (s.amp * (Math.cos(s.phase) - Math.cos(s.omega * t + s.phase))) / s.omega;
  return [field.base * (field.ex * t + field.px * side), field.base * (field.ez * t + field.pz * side)];
}

/** Every gust alive at time t whose patch may reach within `reach` m of (x, z): its heart, radius, strength now and peak. */
function forEachGust(
  field: Field, x: number, z: number, t: number, reach: number,
  visit: (x: number, z: number, radius: number, strength: number, peak: number) => void,
): void {
  const { preset, cell, slot, gustSeed } = field;
  const [dx, dz] = drift(field, t);
  // Gusts are fixed in the drifting air: look them up there.
  const u = x - dx, w = z - dz;
  const r = reach + preset.gustRadius[1];
  const now = Math.floor(t / slot);
  for (let i = Math.floor((u - r) / cell); i <= Math.floor((u + r) / cell); i++) {
    for (let j = Math.floor((w - r) / cell); j <= Math.floor((w + r) / cell); j++) {
      for (let k = now - 1; k <= now; k++) {
        const h = hash3i(gustSeed, i, j, k);
        if (draw(h, GustDraw.Chance) >= GUST_CHANCE) continue;
        const life = between(preset.gustLife, draw(h, GustDraw.Life));
        const age = t - (k + draw(h, GustDraw.Birth)) * slot;
        if (age < 0 || age >= life) continue;
        const peak = between(preset.gustStrength, draw(h, GustDraw.Strength));
        const strength = peak * Math.sin((Math.PI * age) / life) ** 2;
        const gx = (i + draw(h, GustDraw.X)) * cell + dx;
        const gz = (j + draw(h, GustDraw.Z)) * cell + dz;
        visit(gx, gz, between(preset.gustRadius, draw(h, GustDraw.Radius)), strength, peak);
      }
    }
  }
}

/** The seeded numbers a gust is drawn from, each its own stream of the gust's hash. */
const enum GustDraw { Chance, X, Z, Birth, Life, Radius, Strength }

/** A number in 0..1 drawn from a gust's hash, the `n`th of its draws. */
function draw(h: number, n: GustDraw): number {
  return hashToFloat(hashCombine(h, n));
}

/** The point a share `f` (0..1) of the way through a range. */
function between(range: readonly [number, number], f: number): number {
  return lerp(range[0], range[1], f);
}

/** The mean of the square of a number drawn evenly from a range. */
function meanSquare([a, b]: readonly [number, number]): number {
  return (a * a + a * b + b * b) / THIRDS;
}
/** The denominator of the mean square of an even draw, and of the area under a gust's shape (pi r² / 3). */
const THIRDS = 3;

/**
 * What the gusts add to the speed on average, as a fraction of the speed under them: the chance of a gust per cell
 * and slot, times its mean peak, times its shape's area (pi r² / 3), times its envelope's mean over its life (one
 * half), times its life, over the cell's area and the slot's length.
 */
function meanGust(preset: WindPreset, cell: number, slot: number): number {
  const peak = (preset.gustStrength[0] + preset.gustStrength[1]) / 2;
  const life = (preset.gustLife[0] + preset.gustLife[1]) / 2;
  const area = (Math.PI * meanSquare(preset.gustRadius)) / THIRDS;
  return (GUST_CHANCE * peak * area * (life / 2)) / (cell * cell * slot);
}

/** Slow swings whose amplitudes add up to `reach`, with periods in `period` (s): the largest they can sum to is `reach`. */
function swings(seed: number, reach: number, period: readonly [number, number]): Swing[] {
  const weights = Array.from({ length: WIND_SWINGS }, (_, n) => 1 + hashToFloat(hashCombine(seed, n)));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((wt, n) => ({
    amp: (reach * wt) / total,
    omega: TAU / between(period, hashToFloat(hashCombine(seed, n + WIND_SWINGS))),
    phase: TAU * hashToFloat(hashCombine(seed, n + WIND_SWINGS * 2)),
  }));
}

const fields = new WeakMap<WindState, Field>();

/** The derived wind of a state, worked out on first use. */
function fieldOf(state: WindState): Field {
  let field = fields.get(state);
  if (field) return field;
  const preset = WIND_PRESETS[state.windForce];
  if (!preset) throw new RangeError(`no wind preset for force ${state.windForce}`);
  const slot = preset.gustLife[1];
  const alive = (preset.gustLife[0] + preset.gustLife[1]) / 2 / slot;
  // Gusts alive at one moment: GUST_CHANCE * alive per cell. Their spacing is one over the root of their density.
  const cell = preset.gustSpacing * Math.sqrt(GUST_CHANCE * alive);
  const [ex, ez] = bearingDir(state.windFrom + Math.PI);
  const [px, pz] = bearingDir(state.windFrom + Math.PI + Math.PI / 2);
  field = {
    preset, ex, ez, px, pz, cell, slot,
    base: beaufortSpeed(state.windForce) / (1 + meanGust(preset, cell, slot)),
    veers: swings(deriveSeed(state.windSeed, 'veer'), Math.tan(preset.veer), VEER_PERIOD),
    freshens: swings(deriveSeed(state.windSeed, 'freshen'), preset.freshen, FRESHEN_PERIOD),
    gustSeed: deriveSeed(state.windSeed, 'gusts'),
  };
  fields.set(state, field);
  return field;
}
