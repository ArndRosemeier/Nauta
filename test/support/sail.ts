/**
 * Sailing a brig in a steady wind for tests and slow checks (N3.3): the sailing model alone (sailing.ts, her pose held
 * level), which is cheap enough to sail minutes of her in a test, and the speeds and times read off it; and whole
 * matches on the sea (`rolling`) for her roll and heel.
 */
import { beaufortSpeed } from '../../src/sim/rules/beaufort.ts';
import type { CanvasName } from '../../src/sim/rules/sailing.ts';
import { startMotion } from '../../src/sim/ship/motion.ts';
import { startSailing, stepSailing, type Sailing, type SailingEvent } from '../../src/sim/ship/sailing.ts';
import { startMatch, type SimState } from '../../src/sim/state.ts';
import { step } from '../../src/sim/step.ts';
import { DEGREE, STEPS_PER_SECOND, bearingDir } from '../../src/sim/units.ts';
import type { Wind } from '../../src/sim/wind.ts';

/** A steady true wind without gusts or veer: a force's mean speed, from a compass bearing (rad). */
export function steadyWind(force: number, from = 0): Wind {
  const [x, z] = bearingDir(from + Math.PI);
  return { speed: beaufortSpeed(force), x, z, toward: Math.atan2(z, x), from, gust: 0 };
}

/** Her pose held level and still (the sailing model reads only her roll and its rate). */
const LEVEL = startMotion(0, 0, 0).pose;

/** Sailing `s` on for `seconds` in `wind`; `each` sees every step's state, time since the start (s) and events. */
export function sail(s: Sailing, wind: Wind, seconds: number, each?: (s: Sailing, t: number, events: readonly SailingEvent[]) => void): Sailing {
  for (let i = 1; i <= seconds * STEPS_PER_SECOND; i++) {
    const r = stepSailing(s, LEVEL, wind);
    s = r.sailing;
    each?.(s, i / STEPS_PER_SECOND, r.events);
  }
  return s;
}

/** How long a run on one point of sail takes to settle to her speed there, s. */
export const SETTLE_SECONDS = 150;

/** Her settled speed through the water (m/s) with the true wind `angle` degrees off her bow, from a steady start. */
export function speedAt(angle: number, force: number, canvas: CanvasName, from = 0): number {
  const wind = steadyWind(force, from);
  return sail(startSailing({ heading: from + angle * DEGREE, canvas, speed: 2 }, wind, force), wind, SETTLE_SECONDS).ahead;
}

/** The time since the start of the first event of a kind in a run, s (Infinity if none). */
export function firstEvent(start: Sailing, wind: Wind, seconds: number, kind: SailingEvent): { at: number; end: Sailing; seen: SailingEvent[] } {
  let at = Infinity;
  const seen: SailingEvent[] = [];
  const end = sail(start, wind, seconds, (_s, t, events) => {
    for (const e of events) { seen.push(e); if (e === kind && at === Infinity) at = t; }
  });
  return { at, end, seen };
}

/** The seed and the wind's bearing (from the north) of the matches sailed on the sea. */
const SEA_SEED = 1805;
const SEA_FROM = 0;
/** Let her settle onto her point of sail and her roll build, s; then watch her, s. */
const SETTLE = 60;
const WATCH = 180;

/**
 * Her roll on a point of sail (the wind `angle` off her bow, rad) in a wind of `force`, under way (under bare poles she
 * lies still, a-hull): its mean, how far it swings about the mean (RMS), and its most, rad.
 */
export function rolling(force: number, canvas: CanvasName, angle: number): { mean: number; swing: number; most: number } {
  let s: SimState = startMatch({ seed: SEA_SEED, windForce: force, windFrom: SEA_FROM, ships: [{ x: 0, z: 0, heading: SEA_FROM + angle, canvas, speed: canvas === 'bare' ? 0 : 2 }] });
  let sum = 0, squares = 0, most = 0, n = 0;
  for (let i = 0; i < (SETTLE + WATCH) * STEPS_PER_SECOND; i++) {
    s = step(s).state;
    if (i < SETTLE * STEPS_PER_SECOND) continue;
    const roll = s.ships[0]!.motion.pose.roll;
    if (!Number.isFinite(roll)) throw new Error('her roll is no longer a number');
    sum += roll; squares += roll * roll; most = Math.max(most, Math.abs(roll)); n++;
  }
  const mean = sum / n;
  return { mean, swing: Math.sqrt(squares / n - mean * mean), most };
}

/** An angle in degrees, for messages. */
export const deg = (a: number) => `${(a / DEGREE).toFixed(1)}°`;
