/**
 * Slow check (docs/CHECKS.md, implementation plan N5.2): the fall of shot against a brig, to the design's shares. Two
 * brigs lie broadside on, parallel, in a force 4 sea, at 100, 200 and 400 m; the starboard battery of one, with full
 * crews, loads round shot, lays on the other's hull (each gun captain by eye, `layOn`) and fires as they bear (`bears`)
 * for a few minutes; each ball's path is traced through the target's side (a stand-in for N6.1's hits: her side from
 * end to end, from the water to her rail, as she lies at the instant of firing). Prints the share that strike her, and
 * fails if they stray from the design (about 3 in 4 at 100 m, half at 200 m, 1 in 5 at 400 m) by more than SHARE_SLACK,
 * or if the check did not do what it says: the sea rolled her less than LEAST_ROLL, too few shots were fired, a path
 * or a pose stopped being a number. Also prints how far chain and grape carry, and checks the gun crews at quarters in
 * a whole match (`crewsAtQuarters`: they man the side that bears, cross the deck, and reload at the table's pace). About 35 s.
 *
 *   npm run check:gunnery
 */
import { battery, fireGun, gunAt, handsAtGuns, laidAt, standingWants, startGuns, stepGuns, type Battery, type GunWant } from '../../src/sim/guns/guns.ts';
import { engagedSide } from '../../src/sim/guns/gunnery.ts';
import { bears, fireShot, layOn, type Flight, type Vec } from '../../src/sim/guns/shot.ts';
import { RAIL_TOP, TOP_OF_SIDE } from '../../src/sim/rules/ships.ts';
import { GUNS, type ShotKind } from '../../src/sim/rules/guns.ts';
import { hullEnds, hullHalfBreadth, sideTop } from '../../src/sim/ship/hull.ts';
import { lyingStill, startMotion, stepMotion, toShip, toWorld, type ShipMotion, type ShipPose } from '../../src/sim/ship/motion.ts';
import { LOAD_WATERLINE } from '../../src/sim/rules/ships.ts';
import { startMatch } from '../../src/sim/state.ts';
import { duelStart } from '../../src/sim/start.ts';
import { step } from '../../src/sim/step.ts';
import { parseOrder, type Order } from '../../src/sim/orders.ts';
import { RIPPLE } from '../../src/sim/rules/guns.ts';
import type { GunFired } from '../../src/sim/guns/shot.ts';
import { DEGREE, SECONDS_PER_MINUTE, STEPS_PER_SECOND, wrapBearing } from '../../src/sim/units.ts';

const SEED = 1805;
const FORCE = 4;
/** The ranges and the design's shares of round shot that strike her (design decisions for N5). */
const RANGES: readonly (readonly [range: number, share: number])[] = [[100, 0.75], [200, 0.5], [400, 0.2]];
/** How far a share may stray from the design's, absolute. */
const SHARE_SLACK = 0.1;
/** Seconds of firing at each range, and the runs (seeds) at each. */
const SECONDS = 120;
const RUNS = 5;
/** The least shots that must have been fired at a range for its share to count. */
const LEAST_SHOTS = 60;
/** The least her roll must swing from side to side in the run, rad, for the sea to have been a force 4's. */
const LEAST_ROLL = 2 * DEGREE;
/** Where the gun captains aim: her side's middle, this high above her load waterline, m (half her freeboard). */
const AIM_ABOVE_WATER = 1.25;
/** A full crew at every gun. */
const FULL = 5;
/** Settling her on the sea before firing, s. */
const SETTLE = 20;

const problems: string[] = [];

/** The ?sail match's broadside by the order panel's words (N5.3a): the most she sails before it, s. */
const BROADSIDE_WITHIN = 150;

/**
 * The duel's start as `?sail` gives it, the first ship sailed by the panel's typed words: she bears away to bring the
 * enemy onto her starboard beam, beats to quarters and holds for the word; once her starboard guns stand ready the
 * word is given, and the broadside ripples down her side as events with their flights. Fails if it does not.
 */
function broadsideByOrders(): void {
  let s = startMatch(duelStart(SEED));
  const say = (words: string): Order => { const o = parseOrder(words, 0); if (typeof o === 'string') throw new Error(o); return o; };
  const enemy = Math.atan2(s.ships[1]!.motion.pose.x - s.ships[0]!.motion.pose.x, -(s.ships[1]!.motion.pose.z - s.ships[0]!.motion.pose.z));
  const course = Math.round(wrapBearing(enemy - Math.PI / 2) / DEGREE) % 360;
  const starboard = battery().flatMap((p, i) => (p.side > 0 ? [i] : []));
  let k = 0, wordAt = -1;
  const fired: GunFired[] = [], refused: string[] = [];
  for (; k < BROADSIDE_WITHIN * STEPS_PER_SECOND; k++) {
    const orders = k === 0 ? [say(`steer ${String(course).padStart(3, '0')}`), say('beat to quarters'), say('hold for my word')] : [];
    const ready = starboard.every((i) => gunAt(s.ships[0]!.guns, i).drill === 'ready');
    if (wordAt < 0 && ready) { orders.push(say('fire')); wordAt = s.tick; }
    const r = step(s, orders);
    s = r.state;
    for (const e of r.events) { if (e.kind === 'fired') fired.push(e); if (e.kind === 'refused') refused.push(e.reason); }
    if (wordAt >= 0 && !s.ships[0]!.told.word) break;
  }
  const ticks = new Set(fired.map((e) => e.tick)), first = Math.min(...ticks);
  console.log(`?sail by orders: bore away to ${course}, at quarters and held; the word at ${(wordAt / STEPS_PER_SECOND).toFixed(0)} s, ${fired.length} guns fired over ${ticks.size} steps`);
  if (refused.length > 0) problems.push(`broadside: refused: ${refused.join('; ')}`);
  if (wordAt < 0) problems.push(`broadside: her starboard guns were not ready within ${BROADSIDE_WITHIN} s`);
  else if (fired.length === 0) problems.push('broadside: the word was given and no gun fired');
  else {
    if (first !== wordAt) problems.push(`broadside: the first gun fired at tick ${first}, the word was given at ${wordAt}`);
    if (fired.some((e) => e.ship !== 0 || !starboard.includes(e.gun))) problems.push('broadside: a gun fired that is not of her starboard side');
    if (fired.some((e) => e.fired.balls.some((b) => b.path.length < 2 || b.path.some((p) => !p.every(Number.isFinite))))) problems.push('broadside: a shot has no flight');
    if (ticks.size < Math.ceil(fired.length / RIPPLE)) problems.push(`broadside: ${fired.length} guns in ${ticks.size} steps, more than ${RIPPLE} a step`);
  }
}

/** The crews at quarters in a whole match (orders.md): the most each part may take, s: crossing the deck smartly is about 5 s; beating to quarters from standing by in the waist, on the forecastle and below (design ruling 2026-11-18) about 30 s. */
const MANNED_WITHIN = 20;
const MUSTERED_WITHIN = 40;
/** How near a gun with her whole crew reloads to the table's time, s. */
const RELOAD_SLACK = 1;
/** The longest the gun crews' check runs, s. */
const CREWS_FOR = 120;
/** How far off her beam the enemy lies in the gun crews' check, m. */
const ABEAM = 150;

/**
 * The gun crews at quarters in a whole match (orders.md, one crew to a pair of guns): two brigs lying still, the enemy
 * `ABEAM` off the first's starboard beam; she beats to quarters and fires as they bear. Her pairs' crews go to the
 * starboard guns, and a gun there reloads in the table's time with her whole crew; then the enemy is put on her
 * larboard beam (at once: a stand-in for the sailing that brings her there, which the computer captains' check
 * covers), and the crews cross the deck. Fails if the first side is not manned within `MUSTERED_WITHIN` of the order, or the other within `MANNED_WITHIN` of coming to bear, or a
 * reload strays.
 */
function crewsAtQuarters(): void {
  const offBeam = (from: ShipPose, across: number) => { const at = toWorld(from, across, 0, 0); return startMotion(at[0], at[2], from.heading); };
  const first = startMotion(0, 0, 0), enemy = offBeam(first.pose, ABEAM);
  let s = startMatch({ seed: SEED, windForce: FORCE, windFrom: 0, ships: [{ x: 0, z: 0, heading: 0 }, { x: enemy.pose.x, z: enemy.pose.z, heading: 0 }] });
  const manned = (side: number) => { const men = handsAtGuns(s.ships[0]!.crew); return battery().every((p, i) => p.side !== side || men[i]! >= p.crew.length); };
  const side = () => engagedSide(s.ships[0]!.motion.pose, [s.ships[1]!.motion.pose], s.ships[0]!.told.aim);
  const at = { bore: -1, manned: -1, fired: -1, ready: -1, crossBore: -1, crossed: -1 };
  let gun = -1;
  for (let k = 0; k < CREWS_FOR * STEPS_PER_SECOND && at.crossed < 0; k++) {
    const r = step(s, k === 0 ? [{ kind: 'quarters', ship: 0 }, { kind: 'bear', ship: 0 }] : []);
    s = r.state;
    if (at.bore < 0 && side() === 1) at.bore = k;
    if (at.bore >= 0 && at.manned < 0 && manned(1)) at.manned = k;
    // The first gun fired with the starboard crews all there, and when she stands ready again.
    for (const e of r.events) if (e.kind === 'fired' && e.ship === 0 && at.manned >= 0 && at.fired < 0) { at.fired = k; gun = e.gun; }
    if (at.fired >= 0 && at.ready < 0 && gunAt(s.ships[0]!.guns, gun).drill === 'ready') {
      at.ready = k;
      const moved = offBeam(s.ships[0]!.motion.pose, -ABEAM);
      s = { ...s, ships: s.ships.map((ship, i) => (i === 1 ? { ...ship, motion: moved } : ship)) };
    }
    if (at.ready >= 0 && at.crossBore < 0 && side() === -1) at.crossBore = k;
    if (at.crossBore >= 0 && manned(-1)) at.crossed = k;
  }
  const secs = (a: number, b: number) => (a < 0 || b < 0 ? Infinity : (b - a) / STEPS_PER_SECOND);
  const man = secs(at.bore, at.manned), reload = secs(at.fired, at.ready), cross = secs(at.crossBore, at.crossed);
  const row = GUNS[battery()[Math.max(0, gun)]!.gun];
  console.log(`crews at quarters: starboard manned ${man.toFixed(1)} s after it bore; a ${row.what} reloaded in ${reload.toFixed(1)} s (table ${row.reload} s); crossed to larboard in ${cross.toFixed(1)} s after it bore`);
  if (!(man <= MUSTERED_WITHIN)) problems.push(`crews: the starboard guns manned ${man.toFixed(1)} s after quarters were beaten`);
  if (!(Math.abs(reload - row.reload) <= RELOAD_SLACK)) problems.push(`crews: a gun with her whole crew reloaded in ${reload.toFixed(1)} s, the table says ${row.reload} s`);
  if (!(cross <= MANNED_WITHIN)) problems.push(`crews: the crews crossed to larboard ${cross.toFixed(1)} s after it bore`);
}

/**
 * A headless duel always ends (N6.4): the duel's start as `?sail` gives it, both ships at quarters firing as they bear
 * and nothing more ordered, stepped until the fight is over: a ship lost, drawn at nightfall, or (as now, steering
 * straight at each other, they pass bow to bow and sail on) drawn when both have sailed apart (end.ts `parting`).
 * Fails if it is not over by then, or the end is not what the state says.
 */
function headlessDuel(): void {
  let s = startMatch(duelStart(SEED));
  const orders = [0, 1].flatMap((ship) => [{ kind: 'quarters', ship }, { kind: 'bear', ship }] as Order[]);
  let light = -1, ended = -1, fired = 0;
  for (let k = 0; k <= s.fight.nightfall && ended < 0; k++) {
    const r = step(s, k === 0 ? orders : []);
    s = r.state;
    for (const e of r.events) {
      if (e.kind === 'fired') fired++;
      if (e.kind === 'light') light = e.tick;
      if (e.kind === 'end') ended = e.tick;
    }
  }
  const end = s.fight.end, minutes = (t: number) => (t / STEPS_PER_SECOND / SECONDS_PER_MINUTE).toFixed(1);
  if (!end || ended < 0) { problems.push('headless duel: not over at nightfall'); return; }
  const drawn = end.lost.every((l) => l === null);
  const how = drawn ? (end.apart ? 'drawn, both sailed apart' : 'drawn at nightfall') : end.lost.map((l, i) => `ship ${i} ${l ?? 'not lost'}`).join(', ');
  console.log(`headless duel at quarters: ${fired} guns fired, over at ${minutes(end.tick)} min: ${how}${light >= 0 ? `; the light failing at ${minutes(light)} min` : ''}`);
  if (end.tick !== ended) problems.push('headless duel: the end event and the state disagree');
  if (drawn && !end.apart && light < 0) problems.push('headless duel: drawn at nightfall without the master\'s warning');
}

/** Whether a ball's path passes through her larboard side (the side toward the firing ship) as she lies at `pose`. */
function strikes(pose: ShipPose, flight: Flight): boolean {
  const rail = RAIL_TOP - TOP_OF_SIDE;
  const at = (p: Vec): Vec => toShip(pose, p[0], p[1], p[2]);
  let prev = at(flight.path[0]!);
  for (let i = 1; i < flight.path.length; i++) {
    const q = at(flight.path[i]!);
    const along = -q[2], base = q[1] + LOAD_WATERLINE;
    const side = -hullHalfBreadth(Math.max(-1e3, along), Math.min(base, sideTop(along)));
    if (prev[0] <= side && q[0] >= side) {
      const ends = hullEnds(base);
      return along >= ends.aft && along <= ends.fore && base <= sideTop(along) + rail;
    }
    prev = q;
  }
  return false;
}

/** One run: the starboard battery firing round shot as they bear at a brig `range` m off, for SECONDS. */
function run(range: number, seed: number, shot: ShotKind): { fired: number; struck: number; roll: number; farthest: number } {
  const match = startMatch({ seed, windForce: FORCE, windFrom: 0, ships: [] });
  let a: ShipMotion = startMotion(0, 0, 0), b: ShipMotion = startMotion(range, 0, 0);
  let guns: Battery = startGuns();
  const places = battery(), starboard = places.map((g) => g.side > 0);
  const men = places.map((_, i) => (starboard[i] ? FULL : 0));
  let fired = 0, struck = 0, least = Infinity, most = -Infinity, farthest = 0;
  const steps = (SETTLE + SECONDS) * STEPS_PER_SECOND;
  for (let k = 0; k < steps; k++) {
    const t = k / STEPS_PER_SECOND;
    a = stepMotion(a, match.sea, t, lyingStill(0));
    b = stepMotion(b, match.sea, t, lyingStill(0));
    if (!Number.isFinite(a.pose.roll) || !Number.isFinite(b.pose.roll)) { problems.push(`range ${range}: a pose stopped being a number`); break; }
    if (k < SETTLE * STEPS_PER_SECOND) continue;
    least = Math.min(least, a.pose.roll); most = Math.max(most, a.pose.roll);
    const target: Vec = [b.pose.x - hullHalfBreadth(0, LOAD_WATERLINE), AIM_ABOVE_WATER, b.pose.z];
    const wants: GunWant[] = standingWants(guns);
    const lays = places.map((place, i) => (starboard[i] ? layOn({ seed, ship: 0, gun: i, tick: k, place, pose: a.pose, shot, heel: 0 }, target) : null));
    lays.forEach((lay, i) => { if (lay) wants[i] = { load: shot, runOut: true, train: lay.train, elevation: lay.laid }; });
    guns = stepGuns(guns, men, wants);
    for (let i = 0; i < places.length; i++) {
      const lay = lays[i], g = gunAt(guns, i);
      if (!lay || g.drill !== 'ready') continue;
      const laid = laidAt(g);
      if (Math.abs(laid.elevation - wants[i]!.elevation) > DEGREE / 10 || !bears(places[i]!, laid.train, laid.elevation, a.pose, lay.elevation)) continue;
      const shotFired = fireGun(guns, i, men[i]!);
      if (!shotFired.firing) continue;
      guns = shotFired.guns;
      const s = fireShot({ seed, ship: 0, gun: i, tick: k, place: places[i]!, firing: shotFired.firing, pose: a.pose, going: { ahead: 0, leeway: 0 }, men: men[i]!, asTheyBear: true, sea: match.sea, t });
      for (const ball of s.balls) {
        if (ball.path.some((p) => !p.every(Number.isFinite))) problems.push(`range ${range}: a path stopped being a number`);
        fired++;
        if (strikes(b.pose, ball)) struck++;
        const end = ball.path[ball.path.length - 1]!;
        farthest = Math.max(farthest, end[0] - a.pose.x);
      }
    }
  }
  return { fired, struck, roll: most - least, farthest };
}

const began = performance.now();
for (const [range, share] of RANGES) {
  let fired = 0, struck = 0, roll = Infinity;
  for (let r = 0; r < RUNS; r++) {
    const out = run(range, SEED + r, 'round');
    fired += out.fired; struck += out.struck; roll = Math.min(roll, out.roll);
  }
  const got = struck / Math.max(1, fired);
  console.log(`round shot at ${range} m: ${struck} of ${fired} strike her (${(got * 100).toFixed(0)} %, design ${(share * 100).toFixed(0)} %); her roll swung ${(roll / DEGREE).toFixed(1)}° at least`);
  if (fired < LEAST_SHOTS) problems.push(`only ${fired} shots fired at ${range} m`);
  if (roll < LEAST_ROLL) problems.push(`the sea rolled her only ${(roll / DEGREE).toFixed(1)}° at ${range} m`);
  if (Math.abs(got - share) > SHARE_SLACK) problems.push(`at ${range} m ${(got * 100).toFixed(0)} % strike her, the design says about ${(share * 100).toFixed(0)} %`);
}
for (const shot of ['chain', 'grape'] as const) {
  const out = run(100, SEED, shot);
  console.log(`${shot} at 100 m: ${out.struck} of ${out.fired} balls through her side; the farthest went ${out.farthest.toFixed(0)} m`);
}
broadsideByOrders();
crewsAtQuarters();
headlessDuel();
console.log(`gunnery: ${((performance.now() - began) / 1000).toFixed(1)} s`);
if (problems.length > 0) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
