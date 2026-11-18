/**
 * Slow check (docs/CHECKS.md, implementation plan N3.3): the brig sailed through whole matches (the sea, the wind with
 * its gusts and swings, her sailing and her floating) in every wind the game sails in, from a light breeze to the gale,
 * under battle and plain sail. Prints her speed on four points of sail and how long a tack from a beam reach takes, and
 * fails if a state stops being a number, a steady heel passes the limit, a tack in a working wind (force 3 and up) takes
 * a minute or more, or her speeds under plain sail in a fresh breeze stray from the table by more than half again its
 * tolerance (the test's steady wind has no gusts or sea; here she has both).
 *
 *   npm run check:sailing
 */
import { angleDiff } from '@futuremagic/core';
import {
  CLOSE_HAULED, HEEL_LIMIT, SPEED_CANVAS, SPEED_TABLE, SPEED_TOLERANCE, SPEED_WIND_FORCE, type CanvasName,
} from '../../src/sim/rules/sailing.ts';
import { WIND_PRESETS } from '../../src/sim/rules/wind.ts';
import { startMatch, type SimState } from '../../src/sim/state.ts';
import { step, type SimEvent } from '../../src/sim/step.ts';
import { DEGREE, KNOT, STEPS_PER_SECOND } from '../../src/sim/units.ts';

const SEED = 1805;
const FROM = 0;
/** Settling onto a point of sail, then measuring, s. */
const SETTLE = 60;
const MEASURE = 60;
/** A tack must be through within this, s. */
const TACK_LIMIT = 60;
/** The lightest wind a tack is held to the limit in (a light breeze carries too little way through the wind). */
const WORKING_FORCE = 3;
const FORCES = [2, 3, 4, 5, 6, 7, WIND_PRESETS.length - 1];
const CANVASES: readonly CanvasName[] = ['battle', 'plain'];
const POINTS = [CLOSE_HAULED / DEGREE, 90, 135, 180];
/** How far her speed in the fresh breeze may stray here from the table, as a share more than the test's tolerance. */
const SEAWAY_SLACK = 1.5;

const problems: string[] = [];

function match(force: number, canvas: CanvasName, angle: number): SimState {
  return startMatch({ seed: SEED, windForce: force, windFrom: FROM, ships: [{ x: 0, z: 0, heading: FROM + angle * DEGREE, canvas, speed: 2 }] });
}

/** Stepped on for `seconds`; `each` sees each state and its events. */
function run(s: SimState, seconds: number, each?: (s: SimState, events: readonly SimEvent[]) => void): SimState {
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) {
    const r = step(s);
    s = r.state;
    const p = s.ships[0]!.motion.pose, sl = s.ships[0]!.sailing;
    if (![p.x, p.z, p.roll, p.heave, sl.ahead, sl.heading, sl.turnRate].every(Number.isFinite)) throw new Error('a state is no longer a number');
    each?.(s, r.events);
  }
  return s;
}

/** Her mean speed (kn) and mean heel (rad) on a point of sail. */
function pointOfSail(force: number, canvas: CanvasName, angle: number): { knots: number; heel: number } {
  let speed = 0, heel = 0, n = 0;
  run(run(match(force, canvas, angle), SETTLE), MEASURE, (s) => { speed += s.ships[0]!.sailing.ahead; heel += s.ships[0]!.motion.pose.roll; n++; });
  return { knots: speed / n / KNOT, heel: heel / n };
}

/** How long a tack from a beam reach to close-hauled on the other tack takes, s (Infinity if she does not come through). */
function tack(force: number, canvas: CanvasName): number {
  const s = run(match(force, canvas, 90), SETTLE);
  const sl = s.ships[0]!.sailing, side = Math.sign(angleDiff(sl.heading, FROM));
  let at = Infinity, t = 0;
  run(step(s, [{ kind: 'course', ship: 0, heading: FROM + side * CLOSE_HAULED, turn: side }]).state, TACK_LIMIT * 2, (_s, events) => {
    t += 1 / STEPS_PER_SECOND;
    if (at === Infinity && events.some((e) => e.kind === 'tacked')) at = t;
  });
  return at;
}

const t0 = performance.now();
console.log(`force canvas  ${POINTS.map((a) => `${a.toFixed(0).padStart(5)}°`).join('')}   heel (most)  tack`);
for (const force of FORCES) {
  for (const canvas of CANVASES) {
    const rows = POINTS.map((a) => pointOfSail(force, canvas, a));
    const heel = Math.max(...rows.map((r) => Math.abs(r.heel)));
    const tackTime = tack(force, canvas);
    console.log(`${String(force).padStart(5)} ${canvas.padEnd(7)} ${rows.map((r) => r.knots.toFixed(1).padStart(6)).join('')}   ${(heel / DEGREE).toFixed(1).padStart(5)}°      ${tackTime === Infinity ? 'missed' : `${tackTime.toFixed(0)} s`}`);
    if (heel >= HEEL_LIMIT) problems.push(`force ${force}, ${canvas} sail: steady heel ${(heel / DEGREE).toFixed(1)}° passes the limit`);
    if (force >= WORKING_FORCE && !(tackTime < TACK_LIMIT)) problems.push(`force ${force}, ${canvas} sail: the tack took ${tackTime.toFixed(0)} s`);
  }
}
for (const [angle, knots] of SPEED_TABLE) {
  const v = pointOfSail(SPEED_WIND_FORCE, SPEED_CANVAS, angle).knots, slack = SPEED_TOLERANCE * SEAWAY_SLACK;
  if (knots === 0 ? v > slack : Math.abs(v - knots) > slack) problems.push(`the table in a seaway: ${angle}° made ${v.toFixed(1)} kn against ${knots} kn`);
}
console.log(`sailing: ${FORCES.length} winds × ${CANVASES.length} canvases, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
for (const p of problems) console.log(`PROBLEM: ${p}`);
process.exit(problems.length ? 1 : 0);
