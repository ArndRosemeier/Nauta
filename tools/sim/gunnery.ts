/**
 * Slow check (docs/CHECKS.md, implementation plan N5.2): the fall of shot against a brig, to the design's shares. Two
 * brigs lie broadside on, parallel, in a force 4 sea, at 100, 200 and 400 m; the starboard battery of one, with full
 * crews, loads round shot, lays on the other's hull (each gun captain by eye, `layOn`) and fires as they bear (`bears`)
 * for a few minutes; each ball's path is traced through the target's side (a stand-in for N6.1's hits: her side from
 * end to end, from the water to her rail, as she lies at the instant of firing). Prints the share that strike her, and
 * fails if they stray from the design (about 3 in 4 at 100 m, half at 200 m, 1 in 5 at 400 m) by more than SHARE_SLACK,
 * or if the check did not do what it says: the sea rolled her less than LEAST_ROLL, too few shots were fired, a path
 * or a pose stopped being a number. Also prints how far chain and grape carry. About 20 s.
 *
 *   npm run check:gunnery
 */
import { battery, fireGun, gunAt, laidAt, standingWants, startGuns, stepGuns, type Battery, type GunWant } from '../../src/sim/guns/guns.ts';
import { bears, fireShot, layOn, type Flight, type Vec } from '../../src/sim/guns/shot.ts';
import { RAIL_TOP, TOP_OF_SIDE } from '../../src/sim/rules/ships.ts';
import type { ShotKind } from '../../src/sim/rules/guns.ts';
import { hullEnds, hullHalfBreadth, sideTop } from '../../src/sim/ship/hull.ts';
import { lyingStill, poseRotation, shipBody, startMotion, stepMotion, type ShipMotion, type ShipPose } from '../../src/sim/ship/motion.ts';
import { LOAD_WATERLINE } from '../../src/sim/rules/ships.ts';
import { startMatch } from '../../src/sim/state.ts';
import { DEGREE, STEPS_PER_SECOND } from '../../src/sim/units.ts';

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

/** A world point in a ship's own space at her pose. */
function toShip(pose: ShipPose, p: Vec): Vec {
  const r = poseRotation(pose), b = shipBody();
  const dx = p[0] - pose.x, dy = p[1] - pose.heave, dz = p[2] - pose.z;
  return [r[0]! * dx + r[3]! * dy + r[6]! * dz, r[1]! * dx + r[4]! * dy + r[7]! * dz + b.centreY, r[2]! * dx + r[5]! * dy + r[8]! * dz + b.centreZ];
}

/** Whether a ball's path passes through her larboard side (the side toward the firing ship) as she lies at `pose`. */
function strikes(pose: ShipPose, flight: Flight): boolean {
  const rail = RAIL_TOP - TOP_OF_SIDE;
  let prev = toShip(pose, flight.path[0]!);
  for (let i = 1; i < flight.path.length; i++) {
    const q = toShip(pose, flight.path[i]!);
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
console.log(`gunnery: ${((performance.now() - began) / 1000).toFixed(1)} s`);
if (problems.length > 0) {
  for (const p of problems) console.error(`FAIL ${p}`);
  process.exit(1);
}
