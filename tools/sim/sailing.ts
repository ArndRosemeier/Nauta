/**
 * Slow check (docs/CHECKS.md, implementation plan N3.3): the brig sailed through whole matches (the sea, the wind with
 * its gusts and swings, her sailing and her floating) in every wind the game sails in, from a light breeze to the gale,
 * under battle and plain sail. Prints her speed on four points of sail and how long a tack from a beam reach takes, and
 * fails if a state stops being a number, a steady heel passes the limit, a tack in a working wind (force 3 and up) takes
 * a minute or more (from the helm put over), heaving to in a working wind does not take her way off within five minutes
 * (it prints how long it takes in each wind), or her speeds under plain sail in a fresh breeze stray from the table by more than half again its
 * tolerance (the test's steady wind has no gusts or sea; here she has both).
 *
 * Then the orders as the captain gives them (N3.4, N3.5), each a scenario that first asserts she was doing what it
 * names: a course on the other tack reached by wearing (and the master saying so), a course too near the wind steered
 * full and by instead, a tack ordered with the hands at their stations first, heaving to until she lies still and
 * filling to get under way again, and the order panel's eight compass points from a start under way, each reached
 * or answered with full and by.
 *
 *   npm run check:sailing
 */
import {
  CLOSE_HAULED, HEEL_LIMIT, SPEED_CANVAS, SPEED_TABLE, SPEED_TOLERANCE, SPEED_WIND_FORCE, type CanvasName,
} from '../../src/sim/rules/sailing.ts';
import { WIND_PRESETS } from '../../src/sim/rules/wind.ts';
import { startMatch, type SimState } from '../../src/sim/state.ts';
import type { Order } from '../../src/sim/orders.ts';
import { NO_WAY } from '../../src/sim/rules/orders.ts';
import { JOBS, PASSED } from '../../src/sim/rules/crew.ts';
import { rigPlan } from '../../src/sim/ship/rig.ts';
import { canvasFor } from '../../src/sim/ship/sailing.ts';
import { meanWind } from '../../src/sim/wind.ts';
import { simTime } from '../../src/sim/state.ts';
import { STEER_POINTS, steerPoint } from '../../src/app/orderReport.ts';
import { angleDiff } from '@futuremagic/core';
import { step, type SimEvent } from '../../src/sim/step.ts';
import { DEGREE, KNOT, STEPS_PER_SECOND } from '../../src/sim/units.ts';

const SEED = 1805;
const FROM = 0;
/** Settling onto a point of sail, then measuring, s. */
const SETTLE = 60;
const MEASURE = 60;
/** Hove to, her way must be off within this, s (in a working wind). */
const HEAVE_LIMIT = 300;
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
function run(s: SimState, seconds: number, each?: (s: SimState, events: readonly SimEvent[]) => void, first: readonly Order[] = []): SimState {
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) {
    const r = step(s, i === 0 ? first : []);
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

/** How long a tack from a beam reach takes, from the helm put over to her head through the wind, s (Infinity if she does not come through). */
function tack(force: number, canvas: CanvasName): number {
  const s = run(match(force, canvas, 90), SETTLE);
  let at = Infinity, t = 0;
  // Timed from the helm put over (the order's `done`): the hands' time before it is the order table's (rules/orders.ts).
  let from = Infinity;
  run(s, TACK_LIMIT * 2, (_s, events) => {
    t += 1 / STEPS_PER_SECOND;
    if (from === Infinity && events.some((e) => e.kind === 'done' && e.order.kind === 'tack')) from = t;
    if (at === Infinity && events.some((e) => e.kind === 'tacked')) at = t - from;
  }, [{ kind: 'tack', ship: 0 }]);
  return at;
}

/** How long heaving to from a beam reach under battle sail takes to take her way off, s (Infinity if not within `HEAVE_LIMIT`). */
function heaveTo(force: number): number {
  let at = Infinity, t = 0;
  run(run(match(force, 'battle', 90), SETTLE), HEAVE_LIMIT, (st) => {
    t += 1 / STEPS_PER_SECOND;
    if (at === Infinity && st.ships[0]!.sailing.ahead < NO_WAY) at = t;
  }, [{ kind: 'heave', ship: 0 }]);
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
console.log(`hove to from a beam reach, battle sail, her way off after: ${FORCES.map((f) => {
  const at = heaveTo(f);
  if (f >= WORKING_FORCE && at === Infinity) problems.push(`force ${f}: hove to, her way was not off within ${HEAVE_LIMIT} s`);
  return `force ${f} ${at === Infinity ? 'never' : `${at.toFixed(0)} s`}`;
}).join(', ')}`);
// The orders as the captain gives them: each scenario checks it did what it names before its result counts.
/** Every event of a run, with its time from the order, s. */
function events(s: SimState, seconds: number, order: Order): { state: SimState; seen: { t: number; e: SimEvent }[] } {
  const seen: { t: number; e: SimEvent }[] = [];
  let t = 0;
  const state = run(s, seconds, (_s, es) => { t += 1 / STEPS_PER_SECOND; for (const e of es) seen.push({ t, e }); }, [order]);
  return { state, seen };
}
const fromOf = (s: SimState) => meanWind(s.wind, simTime(s)).from;
const kindsOf = (seen: { e: SimEvent }[]) => seen.map(({ e }) => e.kind);
const answers = (seen: { e: SimEvent }[]) => seen.flatMap(({ e }) => (e.kind === 'answered' ? [e.reason] : []));
const she = (s: SimState) => s.ships[0]!.sailing;
const degrees = (a: number) => `${(a / DEGREE).toFixed(0)}°`;
/** How near a course she must come, rad, and how fast she must be going to count as under way, m/s. */
const ON_COURSE = 6 * DEGREE;
const UNDER_WAY = 2 * KNOT;
/** The working breeze the order scenarios sail in, and the fresh one heaving to is held to a couple of minutes in. */
const ORDERS_FORCE = 4;
const HEAVE_FORCE = 5;
const HEAVE_FRESH_LIMIT = 120;
/** Hove to, she must then lie within this of still, m/s. */
const LIE_STILL = 1 * KNOT;
/** Each scenario's time, s: a wear round, a course up, a tack, heaving to, filling, a compass point from the start. */
const WEAR_SECONDS = 120;
const UP_SECONDS = 60;
const TACK_SECONDS = 90;
const HOVE_SECONDS = 240;
const FILL_SECONDS = 90;
const POINT_SECONDS = 120;
/** A start like the first `?sail`'s (N3.5; the page now starts N3.7's duel): heading north at 5 knots, the wind from west-south-west. */
const PAGE_START = { windFrom: 247.5 * DEGREE, heading: 0, speed: 5 * KNOT };

function orderScenarios(): string[] {
  const out: string[] = [];
  const beam = run(match(ORDERS_FORCE, 'battle', 90), SETTLE), from = fromOf(beam);
  if (she(beam).ahead < UNDER_WAY) problems.push(`orders: she was not under way on the beam (${(she(beam).ahead / KNOT).toFixed(1)} kn)`);
  // A course on the other tack: she wears round, never tacks, and the master says so.
  const wear = events(beam, WEAR_SECONDS, { kind: 'steer', ship: 0, heading: 270 * DEGREE });
  const worn = kindsOf(wear.seen);
  if (!worn.includes('wore') || worn.includes('tacked')) problems.push(`orders: steering 270 she did not wear round (${worn.join(', ')})`);
  if (!answers(wear.seen).some((a) => /wearing round, sir/.test(a))) problems.push('orders: steering 270 the master did not say "wearing round"');
  const wearMiss = Math.abs(angleDiff(she(wear.state).heading, 270 * DEGREE));
  if (wearMiss > ON_COURSE) problems.push(`orders: worn round she heads ${degrees(she(wear.state).heading)}, not 270°`);
  out.push(`wore to 270 in ${(wear.seen.find(({ e }) => e.kind === 'wore')?.t ?? NaN).toFixed(0)} s`);
  // A course too near the wind: answered, and steered full and by on the nearer tack.
  const up = events(beam, UP_SECONDS, { kind: 'steer', ship: 0, heading: from + 30 * DEGREE });
  const upMiss = Math.abs(angleDiff(she(up.state).heading, fromOf(up.state) + CLOSE_HAULED));
  if (!answers(up.seen).some((a) => /will not lie/.test(a))) problems.push('orders: a course 30° off the wind was not answered');
  if (upMiss > ON_COURSE || kindsOf(up.seen).some((k) => k === 'tacked' || k === 'wore')) problems.push(`orders: told 30° off the wind she heads ${degrees(she(up.state).heading)}, not full and by`);
  out.push(`full and by instead of 30° off the wind: within ${degrees(upMiss)}`);
  // A tack from close-hauled in a fresh breeze: the hands at their stations first, then through the wind, full and by on the other tack.
  const close = run(match(HEAVE_FORCE, 'battle', CLOSE_HAULED / DEGREE + 2), SETTLE);
  if (she(close).ahead < UNDER_WAY) problems.push('orders: she was not under way close-hauled before the tack');
  const tacked = events(close, TACK_SECONDS, { kind: 'tack', ship: 0 });
  const through = tacked.seen.find(({ e }) => e.kind === 'tacked');
  if (!through || through.t <= PASSED.master + (JOBS.stations.work as number)) problems.push(`orders: the tack came through at ${through?.t.toFixed(1)} s, before the hands could be at their stations`);
  const tackMiss = Math.abs(angleDiff(she(tacked.state).heading, fromOf(tacked.state) - CLOSE_HAULED));
  if (tackMiss > ON_COURSE + 2 * DEGREE) problems.push(`orders: after the tack she heads ${degrees(she(tacked.state).heading)}, not full and by on the starboard tack`);
  out.push(`tack through the wind at ${through?.t.toFixed(0)} s`);
  // Heaving to in a fresh breeze: her way off within a couple of minutes, then lying still under her topsails; filling, under way again.
  const fresh = run(match(HEAVE_FORCE, 'battle', 90), SETTLE);
  if (she(fresh).ahead < 3 * UNDER_WAY) problems.push(`orders: she was not going well before heaving to (${(she(fresh).ahead / KNOT).toFixed(1)} kn)`);
  let stopped = Infinity, most = 0, t = 0;
  const hove = run(fresh, HOVE_SECONDS, (st) => {
    t += 1 / STEPS_PER_SECOND;
    const v = she(st).ahead;
    if (stopped === Infinity && v < NO_WAY) stopped = t;
    if (stopped < t) most = Math.max(most, Math.abs(v));
  }, [{ kind: 'heave', ship: 0 }]);
  if (!(stopped < HEAVE_FRESH_LIMIT)) problems.push(`orders: force ${HEAVE_FORCE}, hove to, her way was off only after ${stopped.toFixed(0)} s`);
  if (most > LIE_STILL) problems.push(`orders: hove to she moved at up to ${(most / KNOT).toFixed(2)} kn`);
  if (!she(hove).canvas.every((c, i) => !c.set || rigPlan().sails[i]!.id.includes('topsail'))) problems.push('orders: hove to she carries more than her topsails');
  const filled = run(hove, FILL_SECONDS, undefined, [{ kind: 'fill', ship: 0 }]);
  const canvasBack = JSON.stringify(she(filled).canvas) === JSON.stringify(canvasFor('battle', HEAVE_FORCE));
  if (!canvasBack || she(filled).backed.some(Boolean) || she(filled).ahead < UNDER_WAY) problems.push(`orders: filled, she is not under battle sail and way again (${(she(filled).ahead / KNOT).toFixed(1)} kn)`);
  out.push(`hove to, still after ${stopped.toFixed(0)} s, within ${(most / KNOT).toFixed(2)} kn; filled, ${(she(filled).ahead / KNOT).toFixed(1)} kn`);
  // The panel's eight compass points from a start under way: each reached, or full and by on its tack when it lies too near the wind.
  const missed: string[] = [];
  STEER_POINTS.forEach((name, i) => {
    const start = startMatch({ seed: SEED, windForce: ORDERS_FORCE, windFrom: PAGE_START.windFrom, ships: [{ x: 0, z: 0, heading: PAGE_START.heading, speed: PAGE_START.speed }] });
    const end = run(start, POINT_SECONDS, undefined, [{ kind: 'steer', ship: 0, heading: steerPoint(i) }]);
    const wind = fromOf(end), off = angleDiff(steerPoint(i), wind);
    const aim = Math.abs(off) < CLOSE_HAULED ? wind - Math.sign(off || 1) * CLOSE_HAULED : steerPoint(i);
    if (Math.abs(angleDiff(she(end).heading, aim)) > ON_COURSE + 2 * DEGREE || she(end).ahead < UNDER_WAY) missed.push(`${name} (heads ${degrees(she(end).heading)} at ${(she(end).ahead / KNOT).toFixed(1)} kn, aimed ${degrees(aim)})`);
  });
  if (missed.length) problems.push(`orders: the panel's compass points not reached: ${missed.join(', ')}`);
  out.push(`compass points by taps: ${STEER_POINTS.length - missed.length} of ${STEER_POINTS.length}`);
  return out;
}
console.log(`orders: ${orderScenarios().join('; ')}`);
console.log(`sailing: ${FORCES.length} winds × ${CANVASES.length} canvases, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
for (const p of problems) console.log(`PROBLEM: ${p}`);
process.exit(problems.length ? 1 : 0);
