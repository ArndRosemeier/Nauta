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
 * Then the duel's start (N7.5a): in each force a duel is fought in, the two ships close as fast as the table that sets
 * how far apart they start says (rules/start.ts `START_CLOSING`), within a quarter.
 *
 * Last her roll on the sea (N2.2, N3.3, moved here from npm test for its time, docs/CHECKS.md): ten minutes of floating
 * in the strongest preset never blow up; under all the sail the crew will carry in it she heels below the limit; and in
 * a force 5 beam sea her sails steady her roll against bare poles.
 *
 *   npm run check:sailing
 */
import {
  CLOSE_HAULED, HEEL_LIMIT, LIGHT_BATTLE_LEAST, LIGHT_SPEED_TABLE, LIGHT_WIND_FORCE, LIGHTEST_SHARE, SPEED_CANVAS, SPEED_TABLE,
  SPEED_TOLERANCE, SPEED_WIND_FORCE, TACK_RECOVERY, type CanvasName,
} from '../../src/sim/rules/sailing.ts';
import { DUEL_FORCES, WIND_PRESETS } from '../../src/sim/rules/wind.ts';
import { START_CLOSING, START_MINUTES } from '../../src/sim/rules/start.ts';
import { duelStart, startApart } from '../../src/sim/start.ts';
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
import { apartOnWater, DEGREE, KNOT, SECONDS_PER_MINUTE, STEP_SECONDS, STEPS_PER_SECOND } from '../../src/sim/units.ts';
import { beaufortSpeed } from '../../src/sim/rules/beaufort.ts';
import { startSea } from '../../src/sim/sea/sea.ts';
import { lyingStill, startMotion, stepMotion, type ShipMotion } from '../../src/sim/ship/motion.ts';
import { deg, rolling } from '../../test/support/sail.ts';

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

/**
 * A tack from a beam reach: how long it takes, from the helm put over to her head through the wind (her fore yards
 * over, `tacked`), s (Infinity if she does not come through), and how long after that she is back at
 * `TACK_RECOVERY.knots` (Infinity if not within the run).
 */
function tack(force: number, canvas: CanvasName): { through: number; back: number } {
  const s = run(match(force, canvas, 90), SETTLE);
  let at = Infinity, back = Infinity, t = 0;
  // Timed from the helm put over (the order's `done`): the hands' time before it is the order table's (rules/orders.ts).
  let from = Infinity;
  run(s, TACK_LIMIT * 2, (st, events) => {
    t += 1 / STEPS_PER_SECOND;
    if (from === Infinity && events.some((e) => e.kind === 'done' && e.order.kind === 'tack')) from = t;
    if (at === Infinity && events.some((e) => e.kind === 'tacked')) at = t - from;
    if (at !== Infinity && back === Infinity && st.ships[0]!.sailing.ahead >= TACK_RECOVERY.knots * KNOT) back = t - from - at;
  }, [{ kind: 'tack', ship: 0 }]);
  return { through: at, back };
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
console.log(`force canvas  ${POINTS.map((a) => `${a.toFixed(0).padStart(5)}°`).join('')}   heel (most)  tack  ${TACK_RECOVERY.knots} kn again`);
/** Her speeds under plain sail in the light breeze, and close-hauled under battle sail, by force (the light-airs rows). */
const light = new Map<string, number>();
for (const force of FORCES) {
  for (const canvas of CANVASES) {
    const rows = POINTS.map((a) => pointOfSail(force, canvas, a));
    const heel = Math.max(...rows.map((r) => Math.abs(r.heel)));
    const { through: tackTime, back } = tack(force, canvas);
    POINTS.forEach((a, k) => light.set(`${force} ${canvas} ${a.toFixed(1)}`, rows[k]!.knots));
    console.log(`${String(force).padStart(5)} ${canvas.padEnd(7)} ${rows.map((r) => r.knots.toFixed(1).padStart(6)).join('')}   ${(heel / DEGREE).toFixed(1).padStart(5)}°      ${tackTime === Infinity ? 'missed' : `${tackTime.toFixed(0)} s`}   ${back === Infinity ? 'not' : `${back.toFixed(0)} s`}`);
    // Held in the light airs (force 3 and 4); from force 5 up her pace is as built and the time is printed only.
    if (force >= WORKING_FORCE && force < SPEED_WIND_FORCE && !(back <= TACK_RECOVERY.within)) problems.push(`force ${force}, ${canvas} sail: ${TACK_RECOVERY.knots} kn again ${back === Infinity ? 'never' : `${back.toFixed(0)} s`} after the tack, not within ${TACK_RECOVERY.within} s`);
    if (heel >= HEEL_LIMIT) problems.push(`force ${force}, ${canvas} sail: steady heel ${(heel / DEGREE).toFixed(1)}° passes the limit`);
    if (force >= WORKING_FORCE && !(tackTime < TACK_LIMIT)) problems.push(`force ${force}, ${canvas} sail: the tack took ${tackTime.toFixed(0)} s`);
  }
}
// Light airs are not slow (N3 design decisions): force 3 under plain sail to its table, battle sail never slow
// close-hauled, and force 2 no less than three quarters of force 3's table (the same slack for a seaway).
const lightSlack = SPEED_TOLERANCE * SEAWAY_SLACK, closeHauled = (CLOSE_HAULED / DEGREE).toFixed(1);
for (const [angle, knots] of LIGHT_SPEED_TABLE) {
  const v = pointOfSail(LIGHT_WIND_FORCE, SPEED_CANVAS, angle).knots, lightest = pointOfSail(LIGHT_WIND_FORCE - 1, SPEED_CANVAS, angle).knots;
  console.log(`light airs ${angle}°: force ${LIGHT_WIND_FORCE} ${v.toFixed(1)} kn (the table ${knots}), force ${LIGHT_WIND_FORCE - 1} ${lightest.toFixed(1)} kn (at least ${(LIGHTEST_SHARE * knots).toFixed(1)})`);
  if (Math.abs(v - knots) > lightSlack) problems.push(`light airs: force ${LIGHT_WIND_FORCE} at ${angle}° made ${v.toFixed(1)} kn against ${knots} kn`);
  if (lightest < LIGHTEST_SHARE * knots - lightSlack) problems.push(`light airs: force ${LIGHT_WIND_FORCE - 1} at ${angle}° made ${lightest.toFixed(1)} kn, under ${LIGHTEST_SHARE} of ${knots} kn`);
}
const battleClose = light.get(`${LIGHT_WIND_FORCE} battle ${closeHauled}`)!;
if (battleClose < LIGHT_BATTLE_LEAST) problems.push(`light airs: battle sail close-hauled in force ${LIGHT_WIND_FORCE} made ${battleClose.toFixed(1)} kn, under ${LIGHT_BATTLE_LEAST}`);
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

// Her roll on the sea.
/** Ten simulated minutes of floating in the strongest preset, her heading swinging round every 150 s. */
const GALE_MINUTES = 10;
const GALE_LEGS = 4;
function galeFloating(): string {
  const gale = startSea(SEED, { speed: beaufortSpeed(WIND_PRESETS.length - 1), toward: 0.4 }, 0);
  const trim = startMotion(0, 0, 0).pose.pitch, leg = (GALE_MINUTES * 60) / GALE_LEGS, most = { roll: 0, pitch: 0, heave: 0 };
  let m: ShipMotion = startMotion(0, 0, 0);
  for (let i = 0; i < GALE_MINUTES * 60 * STEPS_PER_SECOND; i++) {
    const t = i * STEP_SECONDS;
    m = stepMotion(m, gale, t, { ...lyingStill(Math.floor(t / leg) * 1.7), ahead: 3 });
    const p = m.pose;
    if (![p.heave, p.pitch, p.roll, p.heaveRate, p.pitchRate, p.rollRate, p.x, p.z].every(Number.isFinite)) { problems.push('gale: her motion is no longer a number'); break; }
    most.roll = Math.max(most.roll, Math.abs(p.roll));
    most.pitch = Math.max(most.pitch, Math.abs(p.pitch - trim));
    most.heave = Math.max(most.heave, Math.abs(p.heave));
  }
  // She works hard but never goes over, stands on end or leaves the water; and the gale does move her.
  if (!(most.roll < 40 * DEGREE && most.pitch < 25 * DEGREE && most.heave < 8)) problems.push(`gale: she went too far (roll ${deg(most.roll)}, pitch ${deg(most.pitch)}, heave ${most.heave.toFixed(2)} m)`);
  if (!(most.roll > 3 * DEGREE && most.heave > 1)) problems.push(`gale: the gale hardly moved her (roll ${deg(most.roll)}, heave ${most.heave.toFixed(2)} m)`);
  return `${GALE_MINUTES} min floating in the gale: roll up to ${deg(most.roll)}, pitch ${deg(most.pitch)}, heave ${most.heave.toFixed(2)} m`;
}
/** Under all the sail the crew will carry in the strongest preset, her heel on the beam and close-hauled. */
function galeHeel(): string {
  return ([[90 * DEGREE, 'beam'], [CLOSE_HAULED, 'close-hauled']] as const).map(([angle, name]) => {
    const r = rolling(WIND_PRESETS.length - 1, 'all', angle);
    if (!(r.mean > 2 * DEGREE && r.mean < HEEL_LIMIT) || !(r.most < 2 * HEEL_LIMIT)) problems.push(`gale, all sail ${name}: mean heel ${deg(r.mean)}, most ${deg(r.most)} (limit ${deg(HEEL_LIMIT)})`);
    return `${name} mean ${deg(r.mean)}, most ${deg(r.most)}`;
  }).join(', ');
}
/** A force 5 beam sea, the wind and the sea it raised square across her: bare poles roll her hard, battle sail steadies her. */
const BEAM_FORCE = 5;
function beamSea(): string {
  const bare = rolling(BEAM_FORCE, 'bare', 90 * DEGREE), battle = rolling(BEAM_FORCE, 'battle', 90 * DEGREE);
  const why = `battle sail mean ${deg(battle.mean)}, swing ${deg(battle.swing)}, most ${deg(battle.most)}; bare poles swing ${deg(bare.swing)}, most ${deg(bare.most)}`;
  if (!(bare.most > 12 * DEGREE)) problems.push(`beam sea: under bare poles she rolled only ${deg(bare.most)}`);
  if (!(battle.swing < 0.7 * bare.swing && battle.most < 0.8 * bare.most)) problems.push(`beam sea: battle sail did not steady her (${why})`);
  // The wind on her larboard beam heels her to starboard.
  if (!(battle.mean > 1 * DEGREE)) problems.push(`beam sea: under battle sail she is not heeled to leeward (${why})`);
  return why;
}
/** How far the closing at a duel's start (rules/start.ts `START_CLOSING`) may stray from what the ships sail, as a share. */
const CLOSING_SLACK = 0.25;
/** Each force a duel is fought in: both ships at the duel's start sailed three minutes with no orders, their closing against the table that sets the start (N7.5a). */
function startClosing(): string {
  const out: string[] = [];
  for (let force = DUEL_FORCES.least; force <= DUEL_FORCES.most; force++) {
    // The seed's picture in this wind, drawn twice as far apart so they do not meet within the minutes measured.
    const start = duelStart(SEED), [p, q] = start.ships, wide = (2 * startApart(force)) / apartOnWater(p!, q!);
    let s = startMatch({ ...start, windForce: force, ships: start.ships.map((x) => ({ ...x, x: x.x * wide, z: x.z * wide })) });
    const apart = apartOnWater(s.ships[0]!.motion.pose, s.ships[1]!.motion.pose);
    for (let i = 0; i < START_MINUTES * SECONDS_PER_MINUTE * STEPS_PER_SECOND; i++) s = step(s, []).state;
    const [a, b] = s.ships.map((x) => x.motion.pose), closing = (apart - apartOnWater(a!, b!)) / (START_MINUTES * SECONDS_PER_MINUTE);
    if (Math.abs(closing - START_CLOSING[force]!) > CLOSING_SLACK * START_CLOSING[force]!) problems.push(`the start in force ${force}: they closed ${closing.toFixed(2)} m/s, the table says ${START_CLOSING[force]}`);
    out.push(`force ${force} ${closing.toFixed(1)} m/s (${apart.toFixed(0)} m)`);
  }
  return out.join(', ');
}
console.log(`the start, closing over ${START_MINUTES} min: ${startClosing()}`);
console.log(galeFloating());
console.log(`all sail in the gale: ${galeHeel()}`);
console.log(`force ${BEAM_FORCE} beam sea: ${beamSea()}`);
console.log(`sailing: ${FORCES.length} winds × ${CANVASES.length} canvases, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
for (const p of problems) console.log(`PROBLEM: ${p}`);
process.exit(problems.length ? 1 : 0);
