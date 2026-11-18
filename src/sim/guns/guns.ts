/**
 * The guns (pure, implementation plan N5.1): each of the brig's 18 guns, her state through the drill, how she is laid
 * and whether she can fire. The one owner of every gun's state (rules.json `owners`: `guns`): the orders (N5.3) say
 * what the crews want, damage (N6) asks `dismountGun`, and nothing else writes a gun.
 *
 * A gun is known by her place in the battery (`battery()`: the plan's gun ports from aft, larboard then starboard,
 * without the chase ports); her plan place gives her kind, her port and her crew's places. The long sixes stand in the
 * foremost ports; shifting one to her chase port to fire ahead is not built yet (N5.3), so the men the quarter bill
 * posts at the chase ports serve no gun until then.
 *
 * **Hands present** are read from the crew (crew/crew.ts owns where every man is): a man counts at a gun while he
 * stands at one of her crew places. Until she beats to quarters (N5.3) the quarter bill stands each pair's crew half at
 * each gun, so a gun has two or three of her five and works short-handed (rules/guns.ts `STRETCH`).
 *
 * **Packed small.** Two crews at work fill nearly all of a state's 16 KB (N3.7), so a ship's battery is kept in her
 * state as two whole numbers a gun (`Battery`, `GUN_NUMBERS`): her drill step, her load, whether she is dismounted and
 * the work left in her step in one, her training and elevation (hundredths of a degree) in the other. A housed battery
 * is about 75 bytes, a working one under 200. Whole numbers also step alike on every machine. `gunAt` reads a gun out
 * as a `Gun`; everything here works on that and packs it back.
 */
import { clamp } from '@futuremagic/core';
import { DRILL_SHARES, FEWEST_AT_GUN, GUNS, STRETCH, type DrillStep, type GunRow, type HandStep, type ShotKind } from '../rules/guns';
import type { GunKind } from '../rules/ships';
import { DEGREE, STEP_SECONDS, STEPS_PER_SECOND } from '../units';
import type { Crew } from '../crew/crew';
import { brigRoster, crewPlaces, type Man } from '../crew/roster';
import { deepFreeze, shipPlan, type GunPlace, type Spot } from '../ship/plan';

/** One gun's state, read out of her battery. */
export interface Gun {
  /** Where she is in the drill (rules/guns.ts `DrillStep`). */
  readonly drill: DrillStep;
  /** Work left in her drill step (the recoil: time left), in `WORK_PER_STEP`ths of a full-crew step; 0 in a waiting step. */
  readonly drillLeft: number;
  /** What is in her, or null: loaded from the start of loading until she fires. */
  readonly loadedWith: ShotKind | null;
  /** How she is laid, in `ANGLE_UNIT`s: trained off square to her side (+ toward the bow) and elevated above her deck's level (+ up). */
  readonly trained: number;
  readonly elevated: number;
  /** Knocked off her carriage or slide (N6): she does nothing more. */
  readonly dismounted: boolean;
}

/** A ship's guns packed, `GUN_NUMBERS` whole numbers each in battery order (the state's `SimShip.guns`). */
export type Battery = readonly number[];

/** Whole numbers a gun takes in a battery: her drill (step, load, mounting and work left), and how she is laid. */
export const GUN_NUMBERS = 2;
/**
 * A full-crew step's drill work, in the units `drillLeft` counts: fine enough that a short-handed pace (5/6, 5/7, 5/8
 * of it a step) loses under a hundredth of a percent to rounding.
 */
export const WORK_PER_STEP = 1200;
/** The unit of a gun's training and elevation in the state: a hundredth of a degree, rad. */
const HUNDREDTHS = 100;
export const ANGLE_UNIT = DEGREE / HUNDREDTHS;

/** What a gun's crew is to do now (the orders, N5.3): what to load (null: load nothing), whether she is to be run out, and how to lay her (rad, kept within her arcs). */
export interface GunWant {
  readonly load: ShotKind | null;
  readonly runOut: boolean;
  readonly train: number;
  readonly elevation: number;
}

/** A gun fired: what she fired and how she was laid at that instant, rad (N5.2 makes the shot from it). */
export interface Firing {
  readonly shot: ShotKind;
  readonly trained: number;
  readonly elevated: number;
}

/** What `fireGun` gives back: the battery after it, and the firing, or null with the reason she could not fire. */
export interface Fired {
  readonly guns: Battery;
  readonly firing: Firing | null;
  readonly reason: string | null;
}

/** The drill's steps and the loads, in the order their numbers stand for in a battery. */
const STEPS: readonly DrillStep[] = ['housed', 'loading', 'ramming', 'loaded', 'running-out', 'ready', 'running-in', 'recoil', 'sponging'];
const LOADS: readonly (ShotKind | null)[] = [null, 'round', 'chain', 'grape'];
/** The places of a gun's numbers among her `GUN_NUMBERS`. */
const DRILL = 0;
const LAID = 1;
/** How many values the step, load and mounting take together (the work left is counted in multiples of it). */
const CODES = STEPS.length * LOADS.length * 2;
/** Her laying packed: training × LAY_SPAN + elevation, both in `ANGLE_UNIT`s (an elevation stays well within half of it, ±20°). */
const LAY_SPAN = 4096;

let places: readonly GunPlace[] | null = null;

/** The guns' places in the plan, in battery order: every gun port but the chase ports, larboard then starboard, each from aft. */
export function battery(): readonly GunPlace[] {
  places ??= deepFreeze(shipPlan().guns.filter((g) => !g.chase));
  return places;
}

/** A gun's rules, by her kind. */
export const gunRow = (kind: GunKind): GunRow => GUNS[kind];

/** A battery at the start: every gun housed (run in, empty, clean) and laid square and level. */
export function startGuns(): Battery {
  return battery().flatMap(() => packGun({ drill: 'housed', drillLeft: 0, loadedWith: null, trained: 0, elevated: 0, dismounted: false }));
}

/** A gun as her four numbers. */
function packGun(g: Gun): number[] {
  const code = (STEPS.indexOf(g.drill) * LOADS.length + LOADS.indexOf(g.loadedWith)) * 2 + (g.dismounted ? 1 : 0);
  return [g.drillLeft * CODES + code, g.trained * LAY_SPAN + g.elevated];
}

/** A battery's gun (by battery place) read out. */
export function gunAt(guns: Battery, i: number): Gun {
  const at = i * GUN_NUMBERS, drill = guns[at + DRILL]!, laid = guns[at + LAID]!;
  const code = drill % CODES, kind = Math.floor(code / 2), trained = Math.round(laid / LAY_SPAN);
  return {
    drill: STEPS[Math.floor(kind / LOADS.length)]!, loadedWith: LOADS[kind % LOADS.length]!, dismounted: code % 2 === 1,
    drillLeft: Math.floor(drill / CODES), trained, elevated: laid - trained * LAY_SPAN,
  };
}

/** A battery with one gun put back. */
function withGun(guns: Battery, i: number, g: Gun): Battery {
  const out = [...guns];
  out.splice(i * GUN_NUMBERS, GUN_NUMBERS, ...packGun(g));
  return out;
}

/** How many guns a battery holds. */
export const gunCount = (guns: Battery): number => guns.length / GUN_NUMBERS;

/** A gun's training and elevation, rad. */
export const laidAt = (g: Gun): { train: number; elevation: number } => ({ train: g.trained * ANGLE_UNIT, elevation: g.elevated * ANGLE_UNIT });

/** The seconds of full-crew work left in a gun's drill step (the recoil: seconds left). */
export const drillSeconds = (g: Gun): number => g.drillLeft / WORK_PER_STEP / STEPS_PER_SECOND;

const spotKey = (s: Spot): string => `${s.space}|${s.along}|${s.across}`;
let gunAtPlace: ReadonlyMap<string, number> | null = null;

/** The battery's gun by each of her crew places' id and spot. */
function gunsByPlace(): ReadonlyMap<string, number> {
  if (gunAtPlace) return gunAtPlace;
  const index = new Map(battery().map((g, i) => [g.id, i]));
  const out = new Map<string, number>();
  for (const p of crewPlaces().values()) {
    const i = p.kind === 'gun' ? index.get(p.of) : undefined;
    if (i !== undefined) { out.set(p.id, i); out.set(spotKey(p), i); }
  }
  gunAtPlace = out;
  return gunAtPlace;
}

/** How many men stand at each gun's crew places now, by battery place (men on their way are at none, nor the men `struck` out of the quarter bill). */
export function handsAtGuns(crew: Crew, roster: readonly Man[] = brigRoster(), struck: ReadonlySet<number> | null = null): number[] {
  const at = gunsByPlace(), out = battery().map(() => 0);
  crew.men.forEach((h, i) => {
    if (h.going || struck?.has(i)) return;
    const g = at.get(h.stands ? spotKey(h.stands) : roster[i]!.home);
    if (g !== undefined) out[g]!++;
  });
  return out;
}

/**
 * The pace of a gun's handwork with `men` at her (1 with her full crew `full`): the short-hands rule (rules/guns.ts
 * `STRETCH`), 0 below `FEWEST_AT_GUN`. Full-crew work takes 1 / pace as long.
 */
export function drillPace(men: number, full: number): number {
  if (men < FEWEST_AT_GUN) return 0;
  return 1 / (1 + (STRETCH * Math.max(0, full - men)) / full);
}

/** Seconds of full-crew work of a hand step for a kind of gun: its share of the reload's handwork (the reload less the recoil). */
export function handWork(row: GunRow, step: HandStep): number {
  return (row.reload - row.recoil) * DRILL_SHARES[step];
}

/** Seconds as drill work units. */
const units = (seconds: number): number => Math.round(seconds * STEPS_PER_SECOND * WORK_PER_STEP);

/** The working step after each, and the waiting step it ends in. */
const AFTER: Readonly<Partial<Record<DrillStep, DrillStep>>> = {
  loading: 'ramming', ramming: 'loaded', 'running-out': 'ready', 'running-in': 'loaded', recoil: 'sponging', sponging: 'housed',
};

/** The work a step starts with (the recoil: its time), in work units; 0 for a waiting step. */
function workOf(row: GunRow, step: DrillStep): number {
  switch (step) {
    case 'loading': case 'ramming': case 'running-out': case 'sponging': return units(handWork(row, step));
    case 'running-in': return units(row.runIn);
    case 'recoil': return units(row.recoil);
    default: return 0;
  }
}

/** The working step a gun leaves a waiting one for when her crew is told to: load a housed gun, run out or in a loaded one. */
function nextFromWaiting(drill: DrillStep, want: GunWant): DrillStep | null {
  if (drill === 'housed' && want.load) return 'loading';
  if (drill === 'loaded' && want.runOut) return 'running-out';
  if (drill === 'ready' && !want.runOut) return 'running-in';
  return null;
}

/** The training and elevation a gun of this kind can take nearest to what is wanted, rad. */
export function withinArcs(row: GunRow, train: number, elevation: number): { train: number; elevation: number } {
  return { train: clamp(train, -row.train, row.train), elevation: clamp(elevation, -row.depress, row.elevate) };
}

/** An angle in `ANGLE_UNIT`s moved toward `goal` (rad) by at most `rate` rad/s for a step at `pace`. */
function lay(value: number, goal: number, rate: number, pace: number): number {
  const most = Math.max(1, Math.round((rate * pace * STEP_SECONDS) / ANGLE_UNIT));
  return value + clamp(Math.round(goal / ANGLE_UNIT) - value, -most, most);
}

/**
 * One step of a gun with `men` at her and her crew told `want`: laid toward the want within her arcs, and taken on
 * through her drill (a step's end carries into the next within the step). A working step goes at her pace
 * (`drillPace`, times `share` when her crew serves her pair's other gun too, gunnery.ts); the recoil takes its time
 * whoever is there; with fewer than `FEWEST_AT_GUN` men nothing but the recoil goes on. A dismounted gun does nothing.
 */
export function stepGun(gun: Gun, place: GunPlace, men: number, want: GunWant, share = 1): Gun {
  if (gun.dismounted) return gun;
  const row = gunRow(place.gun), pace = drillPace(men, place.crew.length) * share;
  let { drill, drillLeft, loadedWith, trained, elevated } = gun;
  if (pace > 0 && drill !== 'recoil') {
    const aim = withinArcs(row, want.train, want.elevation);
    trained = lay(trained, aim.train, row.trainRate, pace);
    elevated = lay(elevated, aim.elevation, row.elevateRate, pace);
  }
  // The step's time, in work units of a full-crew step, spent on her drill.
  let time = WORK_PER_STEP;
  while (time > 0) {
    if (AFTER[drill] === undefined) {
      const next = pace > 0 ? nextFromWaiting(drill, want) : null;
      if (!next) break;
      drill = next;
      drillLeft = workOf(row, next);
      if (next === 'loading') loadedWith = want.load;
      continue;
    }
    const rate = drill === 'recoil' ? 1 : pace;
    if (rate === 0) break;
    const can = Math.round(time * rate);
    if (drillLeft > can) { drillLeft -= can; break; }
    time -= Math.round(drillLeft / rate);
    drill = AFTER[drill]!;
    drillLeft = workOf(row, drill);
  }
  if (drill === gun.drill && drillLeft === gun.drillLeft && trained === gun.trained && elevated === gun.elevated && loadedWith === gun.loadedWith) return gun;
  return { ...gun, drill, drillLeft, loadedWith, trained, elevated };
}

/** One step of the whole battery: each gun with the men serving her, her want and the share of their pace she gets (1 if not given), by battery place. */
export function stepGuns(guns: Battery, men: readonly number[], wants: readonly GunWant[], shares: readonly number[] = []): Battery {
  const at = battery();
  let out = guns;
  for (let i = 0; i < gunCount(guns); i++) {
    const g = gunAt(guns, i), next = stepGun(g, at[i]!, men[i] ?? 0, wants[i]!, shares[i] ?? 1);
    if (next !== g) out = withGun(out, i, next);
  }
  return out;
}

/** What each gun's crew is doing kept as it is: nothing loaded that is not, run out as she stands, laid where she lies (a battery with no gunnery orders). */
export function standingWants(guns: Battery): GunWant[] {
  return Array.from({ length: gunCount(guns) }, (_, i) => {
    const g = gunAt(guns, i), laid = laidAt(g);
    return { load: null, runOut: g.drill === 'ready' || g.drill === 'running-out', train: laid.train, elevation: laid.elevation };
  });
}

/** Why a gun with `men` at her cannot fire now, or null if she can: only a mounted gun, loaded and run out, with at least `FEWEST_AT_GUN` men. */
export function cannotFire(g: Gun, men: number): string | null {
  return g.dismounted ? 'the gun is dismounted'
    : g.loadedWith === null ? 'she is not loaded'
    : g.drill !== 'ready' ? 'she is not run out'
    : men < FEWEST_AT_GUN ? 'too few men at the gun'
    : null;
}

/** A battery's gun `i` fired with `men` at her: she leaps back (her recoil) and stands foul to be sponged; the firing says what left her and how she lay. */
export function fireGun(guns: Battery, i: number, men: number): Fired {
  const g = gunAt(guns, i), reason = cannotFire(g, men);
  if (reason !== null || g.loadedWith === null) return { guns, firing: null, reason };
  const laid = laidAt(g);
  const fired: Gun = { ...g, drill: 'recoil', drillLeft: workOf(gunRow(battery()[i]!.gun), 'recoil'), loadedWith: null };
  return { guns: withGun(guns, i, fired), firing: { shot: g.loadedWith, trained: laid.train, elevated: laid.elevation }, reason: null };
}

/** A battery's gun `i` knocked off her carriage or slide (damage, N6, asks for it): she does nothing more. */
export function dismountGun(guns: Battery, i: number): Battery {
  const g = gunAt(guns, i);
  return g.dismounted ? guns : withGun(guns, i, { ...g, dismounted: true });
}
