/**
 * Shot in flight (pure, implementation plan N5.2): round, chain and grape from the moment a gun fires to where the
 * balls are spent in the sea. A shot leaves along the gun's bore as the ship lies at that instant (her heading, pitch
 * and roll: on the up-roll it goes high, on the down-roll low), with the ship's own motion added, and flies under
 * gravity and the air's drag (a sphere's, by its Mach number); round shot and grape skip off the water at a shallow
 * angle. Scatter is seeded from the match, the ship, the gun and the tick she fires in, so the same seed gives the same
 * fall of shot on every machine.
 *
 * Each shot is worked out whole when it is fired: `fireShot` gives every ball's path (a point every `PATH_STEP`
 * seconds, and the instants it touches the water), so the event carries it and nothing about a shot has to be sent
 * or kept in the state while it flies. What it strikes is damage's (N6.1), which traces these paths through a ship.
 *
 * Who aims and when (design decisions for N5): the gun captain lays his gun (`layOn`), and fired "as they bear" he
 * picks his moment of the roll (`bears`) with a seeded error in his timing (rules/guns.ts `TIMING`); fired on the
 * captain's word, the moment is the captain's and that error is left out.
 *
 * World axes are the sea's: metres, +y up from the calm level, x and z on the water (units.ts `bearingDir`); ship space
 * is section.ts's (+x starboard, +y up from the load waterline, -z forward).
 */
import { clamp, deriveSeed, Rng } from '@futuremagic/core';
import { monotoneCurve } from '../curve';
import {
  CHAIN_WANDER, DISPERSION, FLIGHT_LONGEST, FLIGHT_STEP, JUDGE_SECONDS, JUDGING, MUZZLE_SPEED, PATH_STEP, RICOCHET_ANGLE, RICOCHET_SPEED,
  SHOT, SKIP_KEEP, SKIP_LIFT, SKIPS_MOST, SPEED_OF_SOUND, SPEED_SPREAD, SPHERE_DRAG, TIMING, type ShotKind,
} from '../rules/guns';
import { AIR } from '../rules/sailing';
import { highestWater, seaAt, seaSample, type SeaState } from '../sea/sea';
import { hullHalfBreadth } from '../ship/hull';
import { pointVelocity, poseRotation, toWorld, type ShipPose } from '../ship/motion';
import type { GunPlace } from '../ship/plan';
import { shipY, shipZ } from '../ship/section';
import { bearingDir, DEGREE, GRAVITY, MS_PER_SECOND, STEP_SECONDS, STEPS_PER_SECOND } from '../units';
import { drillPace, gunRow, type Firing } from './guns';

/** A point or a direction, m or m/s. */
export type Vec = readonly [number, number, number];

/**
 * One ball's flight: where it was every `PATH_STEP` seconds from the muzzle (the last point where it was spent, at
 * `ends`), and where and when (seconds after firing) it touched the water: its skips, then the last plunge.
 */
export interface Flight {
  readonly path: readonly Vec[];
  readonly splashes: readonly number[];
  readonly touches: readonly Vec[];
  /** Seconds from firing to the last point of the path. */
  readonly ends: number;
}

/** A gun fired and her shot's flight, whole: what an event carries (N5.4 draws it, N5.6 hears it, N6.1 traces it). */
export interface Shot {
  readonly shot: ShotKind;
  /** The width a ball sweeps as it flies, m (chain's whirl; 0 for a ball). */
  readonly span: number;
  readonly balls: readonly Flight[];
}

/** A gun fired, as the step's event (N5.3 raises it): the ship, the gun (battery place) and her shot's whole flight. */
export interface GunFired {
  readonly kind: 'fired';
  readonly tick: number;
  readonly ship: number;
  readonly gun: number;
  readonly fired: Shot;
}

/** How a ship goes through the water (her sailing's `ahead` and `leeway`, m/s), added to her shot's speed. */
export interface Going {
  readonly ahead: number;
  readonly leeway: number;
}

/** What a gun's firing is made into a shot with. */
export interface Fire {
  /** The seed of the match, the ship and gun (battery place) and the tick of firing, which seed the scatter. */
  readonly seed: number;
  readonly ship: number;
  readonly gun: number;
  readonly tick: number;
  readonly place: GunPlace;
  readonly firing: Firing;
  /** Her pose at the instant of firing, and her way. */
  readonly pose: ShipPose;
  readonly going: Going;
  /** The men at the gun (short hands spoil the gun captain's timing). */
  readonly men: number;
  /** Fired as they bear (the gun captain's moment, with his timing error) rather than on the captain's word. */
  readonly asTheyBear: boolean;
  /** The sea the balls fall into (null: a calm, flat sea), and the time of firing, s. */
  readonly sea: SeaState | null;
  readonly t: number;
}

const DRAG = monotoneCurve(SPHERE_DRAG.mach, SPHERE_DRAG.drag);
/** Kilograms in a tonne (the air's density is in t/m³, rules/sailing.ts). */
const KG_PER_TONNE = 1000;

/** The shortest last piece of a path a ball's place is taken along, s: a thousandth of a step (a path ending right on a point). */
const SHORTEST_PIECE = STEP_SECONDS / MS_PER_SECOND;

/**
 * A ball's place on its path `time` seconds after firing (straight between its points; the last point is where it
 * ended): what damage traces (N6.1) and the drawing flies (N5.4a).
 */
export function pathAt(path: readonly Vec[], ends: number, time: number): Vec {
  const last = path.length - 1, t = Math.min(time, ends), f = t / PATH_STEP, i = Math.min(last - 1, Math.floor(f));
  if (last < 1) return path[0]!;
  const a = path[i]!, b = path[i + 1]!, span = i + 1 === last ? Math.max(ends - i * PATH_STEP, SHORTEST_PIECE) : PATH_STEP;
  const k = Math.min(1, Math.max(0, (t - i * PATH_STEP) / span));
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** Where a gun's muzzle stands in ship space: in her port, at her side, halfway up the port. */
export function muzzleAt(place: GunPlace): Vec {
  const mid = (place.sill + place.top) / 2;
  return [place.side * hullHalfBreadth(place.along, mid), shipY(mid), shipZ(place.along)];
}

/** A gun's bore in ship space as she is laid: out of her side, trained `trained` toward the bow, elevated `elevated` above the deck's level. */
export function boreIn(place: GunPlace, trained: number, elevated: number): Vec {
  const ce = Math.cos(elevated);
  return [place.side * ce * Math.cos(trained), Math.sin(elevated), -ce * Math.sin(trained)];
}

/** A direction of ship space in the world at her pose. */
export function worldDir(pose: ShipPose, v: Vec): Vec {
  const r = poseRotation(pose, rotation);
  return [r[0]! * v[0] + r[1]! * v[1] + r[2]! * v[2], r[3]! * v[0] + r[4]! * v[1] + r[5]! * v[2], r[6]! * v[0] + r[7]! * v[1] + r[8]! * v[2]];
}
const rotation = poseRotation({ x: 0, z: 0, heave: 0, heading: 0, pitch: 0, roll: 0, heaveRate: 0, pitchRate: 0, rollRate: 0 });

/** Her pose `dt` seconds on along her rates of heave, pitch and roll (the instant a gun captain fires early or late). */
export function poseAfter(pose: ShipPose, dt: number): ShipPose {
  return { ...pose, heave: pose.heave + pose.heaveRate * dt, pitch: pose.pitch + pose.pitchRate * dt, roll: pose.roll + pose.rollRate * dt };
}

/** The world velocity of a point of ship space from her way and her heave, pitch and roll, m/s. */
function shipVelocity(pose: ShipPose, going: Going, at: Vec): Vec {
  const [ax, az] = bearingDir(pose.heading), [sx, sz] = bearingDir(pose.heading + Math.PI / 2);
  const [vx, vy, vz] = pointVelocity(pose, at[0], at[1], at[2]);
  return [vx + going.ahead * ax + going.leeway * sx, vy, vz + going.ahead * az + going.leeway * sz];
}

/** The pull of the air on a ball per metre of its path and m/s of its speed at `speed` (its drag ÷ (mass × speed²)), 1/m. */
function airPull(kind: ShotKind, gun: GunPlace['gun'], speed: number): number {
  const row = SHOT[kind], d = row.diameter[gun], area = Math.PI * (d / 2) * (d / 2);
  return ((AIR / 2) * DRAG(speed / SPEED_OF_SOUND) * row.drag * area) / (row.mass[gun] / KG_PER_TONNE);
}

/** One ball's acceleration at velocity v: gravity and the air's drag. */
function accel(kind: ShotKind, gun: GunPlace['gun'], v: Vec): Vec {
  const speed = Math.hypot(v[0], v[1], v[2]), k = airPull(kind, gun, speed) * speed;
  return [-k * v[0], -GRAVITY - k * v[1], -k * v[2]];
}

/** How high the water stands under a world point (x, z) at time t; the calm level without a sea. */
function waterAt(sea: SeaState | null, x: number, z: number, t: number): number {
  return sea ? seaAt(sea, x, z, t, sample).height : 0;
}
const sample = seaSample();

/**
 * One ball flown from `from` with velocity `v` (fired at time `t`) until it is spent in the water or the flight's
 * longest: gravity and drag by a midpoint step every `FLIGHT_STEP`, a point kept every `PATH_STEP`, and at the water a
 * skip (a shallow, fast meeting, for shot that skips) or the end.
 */
export function fly(kind: ShotKind, gun: GunPlace['gun'], from: Vec, v: Vec, sea: SeaState | null, t: number): Flight {
  return flight(kind, gun, from, v, sea, t, true);
}

/** `fly`; with `water` false the ball never meets the water and flies on below it (the laying table's flights). */
function flight(kind: ShotKind, gun: GunPlace['gun'], from: Vec, v: Vec, sea: SeaState | null, t: number, water: boolean): Flight {
  const skips = SHOT[kind].skips, keepEvery = Math.round(PATH_STEP / FLIGHT_STEP), most = Math.round(FLIGHT_LONGEST / FLIGHT_STEP);
  let p: [number, number, number] = [from[0], from[1], from[2]], u: [number, number, number] = [v[0], v[1], v[2]];
  const path: Vec[] = [[...p]], splashes: number[] = [], touches: Vec[] = [];
  // Above the highest the water can stand the sea is not sampled (it is the costly part of a flight).
  const crest = !water ? -Infinity : sea ? highestWater(sea, t) : 0;
  for (let k = 1; k <= most; k++) {
    const h = FLIGHT_STEP, a = accel(kind, gun, u);
    const mid: Vec = [u[0] + (a[0] * h) / 2, u[1] + (a[1] * h) / 2, u[2] + (a[2] * h) / 2], am = accel(kind, gun, mid);
    const next: [number, number, number] = [p[0] + mid[0] * h, p[1] + mid[1] * h, p[2] + mid[2] * h];
    u = [u[0] + am[0] * h, u[1] + am[1] * h, u[2] + am[2] * h];
    const level = next[1] > crest ? -Infinity : waterAt(sea, next[0], next[2], t + k * h);
    if (next[1] <= level && u[1] < 0) {
      // Where along this step it met the water (straight between the two points).
      const before = p[1] - waterAt(sea, p[0], p[2], t + (k - 1) * h), f = clamp(before / (before - (next[1] - level)), 0, 1);
      const hit: Vec = [p[0] + (next[0] - p[0]) * f, p[1] + (next[1] - p[1]) * f, p[2] + (next[2] - p[2]) * f];
      const when = (k - 1 + f) * h, along = Math.hypot(u[0], u[2]), angle = Math.atan2(-u[1], along);
      splashes.push(when);
      touches.push(hit);
      if (!skips || splashes.length > SKIPS_MOST || angle > RICOCHET_ANGLE || Math.hypot(along, u[1]) < RICOCHET_SPEED) {
        path.push(hit);
        return { path, splashes, touches, ends: when };
      }
      // A skip: it leaves the water slower and flatter, from where it met it.
      u = [u[0] * SKIP_KEEP, along * SKIP_KEEP * Math.tan(angle * SKIP_LIFT), u[2] * SKIP_KEEP];
      p = [hit[0], hit[1], hit[2]];
    } else {
      p = next;
    }
    if (k % keepEvery === 0) path.push([...p]);
  }
  return { path, splashes, touches, ends: most * FLIGHT_STEP };
}

/** A unit direction turned by small angles: `up` toward the vertical and `side` across, rad. */
function scatterDir(d: Vec, up: number, side: number): Vec {
  const elev = Math.atan2(d[1], Math.hypot(d[0], d[2])) + up, ce = Math.cos(elev), heading = Math.atan2(d[0], d[2]) + side;
  return [ce * Math.sin(heading), Math.sin(elev), ce * Math.cos(heading)];
}

/** The seeded randomness of one gun's shot fired in `tick`. */
export const shotRng = (seed: number, ship: number, gun: number, tick: number): Rng => new Rng(deriveSeed(seed, 'shot', ship, gun, tick));

/**
 * A gun's firing made into her shot: every ball leaves her muzzle along her bore as she lies at the instant she fires
 * (as they bear, her captain's moment off by his seeded timing error, larger short-handed), scattered by the gun's
 * dispersion and the powder, grape spread from the muzzle, with the ship's motion added, and flown to its end.
 */
export function fireShot(f: Fire): Shot {
  const rng = shotRng(f.seed, f.ship, f.gun, f.tick), row = SHOT[f.firing.shot], kind = f.place.gun;
  const pace = drillPace(f.men, f.place.crew.length);
  const late = f.asTheyBear ? rng.gaussian(0, TIMING / Math.max(pace, PACE_FLOOR)) : 0;
  const pose = poseAfter(f.pose, late), at = muzzleAt(f.place);
  const from = toWorld(pose, at[0], at[1], at[2]);
  const bore = worldDir(pose, boreIn(f.place, f.firing.trained, f.firing.elevated));
  const carried = shipVelocity(pose, f.going, at);
  const wander = DISPERSION * (f.firing.shot === 'chain' ? CHAIN_WANDER : 1);
  const aim = scatterDir(bore, rng.gaussian(0, wander), rng.gaussian(0, wander));
  const speed = MUZZLE_SPEED[kind] * row.speed * (1 + rng.gaussian(0, SPEED_SPREAD));
  const balls: Flight[] = [];
  for (let b = 0; b < row.balls; b++) {
    // Grape: each ball off the round's line, uniformly over a cone of the spread's half-angle.
    const r = row.spread * Math.sqrt(rng.float()), turn = rng.range(0, Math.PI * 2);
    const d = row.spread > 0 ? scatterDir(aim, r * Math.sin(turn), r * Math.cos(turn)) : aim;
    const v: Vec = [d[0] * speed + carried[0], d[1] * speed + carried[1], d[2] * speed + carried[2]];
    balls.push(fly(f.firing.shot, kind, from, v, f.sea, f.t + late));
  }
  return { shot: f.firing.shot, span: row.span, balls };
}
/** The least pace a gun captain's timing error is stretched by (a gun firing at all has at least two men). */
const PACE_FLOOR = 0.5;

/**
 * The laying table of a kind of gun and shot, worked out once: for each elevation from her depression to her
 * elevation, every `LAY_STEP` rad, the drop of the shot (m below the bore's height, by metres out) in calm air with no
 * water under it. What a gun captain knows by eye and practice.
 */
interface LayTable {
  readonly elevations: readonly number[];
  /** For each elevation, the shot's path out along the water: metres out and height (m) from a muzzle at 0. */
  readonly out: readonly (readonly number[])[];
  readonly up: readonly (readonly number[])[];
}
const tables = new Map<string, LayTable>();

function layTable(kind: ShotKind, gun: GunPlace['gun']): LayTable {
  const key = `${gun}|${kind}`, known = tables.get(key);
  if (known) return known;
  const row = gunRow(gun), speed = MUZZLE_SPEED[gun] * SHOT[kind].speed;
  const elevations: number[] = [], out: number[][] = [], up: number[][] = [];
  for (let e = -row.depress; e <= row.elevate + LAY_STEP / 2; e += LAY_STEP) {
    const path = flight(kind, gun, [0, 0, 0], [speed * Math.cos(e), speed * Math.sin(e), 0], null, 0, false).path;
    elevations.push(e);
    out.push(path.map((q) => q[0]));
    up.push(path.map((q) => q[1]));
  }
  const table = { elevations, out, up };
  tables.set(key, table);
  return table;
}
/** The laying table's step of elevation, rad (a quarter of a degree; between steps the height at a range is interpolated). */
const LAY_STEP = 0.25 * DEGREE;

/** The height of the table's shot at elevation index `i` when it is `range` m out, or -Infinity if it never gets there. */
function heightOut(t: LayTable, i: number, range: number): number {
  const xs = t.out[i]!, ys = t.up[i]!;
  if (range > xs[xs.length - 1]!) return -Infinity;
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid]! < range) lo = mid; else hi = mid; }
  const f = (range - xs[lo]!) / (xs[hi]! - xs[lo]! || 1);
  return ys[lo]! + (ys[hi]! - ys[lo]!) * f;
}

/**
 * The elevation above the level at which a gun's shot falls through a point `range` m off and `rise` m above the
 * muzzle, in calm air (no scatter, no water in the way): what the gun captain lays for, from the laying table. The
 * nearer of her depression or elevation if the point is out of reach; on the flat side of the curve (the lower of two
 * elevations that reach it).
 */
export function elevationFor(kind: ShotKind, gun: GunPlace['gun'], range: number, rise: number): number {
  const t = layTable(kind, gun), n = t.elevations.length;
  let below = heightOut(t, 0, range) - rise;
  if (below >= 0) return t.elevations[0]!;
  for (let i = 1; i < n; i++) {
    const miss = heightOut(t, i, range) - rise;
    if (miss >= 0) return t.elevations[i - 1]! + ((t.elevations[i]! - t.elevations[i - 1]!) * -below) / (miss - below);
    below = miss;
  }
  return t.elevations[n - 1]!;
}

/** The world elevation of a gun's bore as she lies now (rad above the horizon), and its rate with her roll and pitch, rad/s. */
export function boreElevation(place: GunPlace, trained: number, elevated: number, pose: ShipPose): { now: number; rate: number } {
  const elev = (p: ShipPose): number => { const d = worldDir(p, boreIn(place, trained, elevated)); return Math.atan2(d[1], Math.hypot(d[0], d[2])); };
  const now = elev(pose);
  return { now, rate: (elev(poseAfter(pose, STEP_SECONDS)) - now) / STEP_SECONDS };
}

/**
 * Whether a gun laid for the world elevation `want` bears now: her roll brings her bore to it within this step (or it
 * stands there, within the step's swing). Fired "as they bear", each gun captain fires at that moment.
 */
export function bears(place: GunPlace, trained: number, elevated: number, pose: ShipPose, want: number): boolean {
  const { now, rate } = boreElevation(place, trained, elevated, pose), next = now + rate * STEP_SECONDS;
  return (now - want) * (next - want) <= 0 || Math.abs(now - want) <= BEAR_WITHIN;
}
/** A bore standing still within this of the wanted elevation bears, rad (a hundredth of a degree). */
const BEAR_WITHIN = 1.7e-4;

/** How a gun captain lays his gun on a world point: her training off square and the elevation he wants above the horizon. */
export interface Lay {
  readonly train: number;
  /** The world elevation he wants the bore at when he fires, rad. */
  readonly elevation: number;
  /** The elevation above her deck he lays her at to reach it as she lies on average (her steady heel `heel`, rad, taken out). */
  readonly laid: number;
}

/** The training a gun at `place` needs to bear on `target` as she lies at `pose` (rad toward the bow from her side's square), the range to it, m, and her muzzle's world point. */
export function trainTo(place: GunPlace, pose: ShipPose, target: Vec): { train: number; range: number; from: Vec } {
  const at = muzzleAt(place), from = toWorld(pose, at[0], at[1], at[2]);
  const dx = target[0] - from[0], dz = target[2] - from[2], range = Math.hypot(dx, dz);
  // The bearing of the point against her side's square, toward the bow.
  const [ax, az] = bearingDir(pose.heading), ahead = (dx * ax + dz * az) / range;
  return { train: Math.asin(Math.max(-1, Math.min(1, ahead))), range, from };
}

/**
 * How a gun captain lays his gun on a world point from where she lies: the training that points her at it (as her
 * heading lies), and the elevation for its range as he judges it (seeded misjudgement of the range, `JUDGING`, judged
 * afresh every `JUDGE_SECONDS`), laid
 * against her steady heel so the roll brings her bore through it. Not kept within her arcs: the gun (guns.ts) is.
 */
export function layOn(f: Pick<Fire, 'seed' | 'ship' | 'gun' | 'tick' | 'place' | 'pose'> & { readonly shot: ShotKind; readonly heel: number }, target: Vec): Lay {
  const { train, range, from } = trainTo(f.place, f.pose, target);
  // He judges the range afresh every JUDGE_SECONDS, so his error holds while he lays and changes between rounds.
  const spell = Math.floor(f.tick / (JUDGE_SECONDS * STEPS_PER_SECOND));
  const judged = range * (1 + new Rng(deriveSeed(f.seed, 'judge', f.ship, f.gun, spell)).gaussian(0, JUDGING));
  const elevation = elevationFor(f.shot, f.place.gun, judged, target[1] - from[1]);
  return { train, elevation, laid: elevation + f.place.side * f.heel };
}
