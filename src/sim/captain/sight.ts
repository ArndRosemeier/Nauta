/**
 * What a computer captain knows when he looks round (pure, implementation plan N7.1): "from what a captain could see".
 * His own ship he knows as her officers report her (her orders, her way, her guns, the water, the fires, the men out
 * and whether his first lieutenant says she is beaten). The enemy he knows only as a man on her quarterdeck sees her:
 * where she lies and which way she heads, how fast she goes through the water, whether her ports are open, and which
 * of her masts still stand. Nothing of her crew, her orders or her damage below is read.
 *
 * His eye is not exact: each look the range and the bearing he judges carry a seeded error by his skill
 * (rules/captain.ts `judgeRange`, `judgeBearing`), the same look giving the same error on every machine.
 */
import { angleDiff, deriveSeed, Rng } from '@futuremagic/core';
import { openHoles, standingNow } from '../damage';
import { waterIn } from '../end';
import { battery, gunAt } from '../guns/guns';
import { SKILL, BEARS_WITHIN, type Skill } from '../rules/captain';
import { GUNS } from '../rules/guns';
import { rigPlan } from '../ship/rig';
import { MASTS } from '../ship/sailing';
import type { SimShip, SimState } from '../state';
import { simTime } from '../state';
import { apartOnWater, bearingDir, bearingTo, wrapBearing } from '../units';
import { meanWind, type Wind } from '../wind';

/** The enemy as he sees her across the water. */
export interface EnemySeen {
  readonly x: number;
  readonly z: number;
  /** Her heading, a compass bearing, rad, and her way through the water, m/s. */
  readonly heading: number;
  readonly ahead: number;
  /** Her ports open and her guns run out: she is at quarters. */
  readonly quarters: boolean;
  /** How many of her masts still stand (fore, main). */
  readonly masts: number;
}

/** A side of his battery as his gunner reports it: the mounted guns, those standing ready, those ready that bear on her (she lies within their training), and whether she lies where the side bears. */
export interface SideReport {
  readonly mounted: number;
  readonly ready: number;
  readonly readyBearing: number;
  readonly bears: boolean;
}

/** What he knows at a look. */
export interface Sight {
  readonly tick: number;
  readonly t: number;
  readonly ship: number;
  /** His own ship as her officers report her. */
  readonly own: SimShip;
  readonly enemy: EnemySeen;
  /** The mean wind (what the master judges a course by, orders.ts), its bearing it blows from, rad, and the match's force. */
  readonly wind: Wind;
  readonly windFrom: number;
  readonly force: number;
  /** The range to her as he judges it, m, and her bearing from him (a compass bearing, rad), as he judges it. */
  readonly range: number;
  readonly bearing: number;
  /** Her bearing off his bow, rad (+ to starboard). */
  readonly off: number;
  /** How far to windward of her he lies, m (less than 0: she holds the weather position). */
  readonly windward: number;
  /** His sides, larboard then starboard (-1, +1 at [0], [1]). */
  readonly sides: readonly [SideReport, SideReport];
  /** The water in her, t; the holes the sea comes in at; the largest fire's share of its space; what lies alongside. */
  readonly water: number;
  readonly leaks: number;
  readonly fire: number;
  readonly wreckage: number;
  /** His first lieutenant says she is beaten ("We must strike, sir", N6.4). */
  readonly beaten: boolean;
}

/** A quarter turn, rad: square to her side. */
const QUARTER = Math.PI / 2;
/** A lower mast's spar id is its mast's name and this (`fore-mast`). */
const MAST_SUFFIX = '-mast';

/** The side of his battery a bearing off his bow lies on: 1 starboard, 0 larboard (the index into `Sight.sides`). */
export const sideIndex = (off: number): 0 | 1 => (off >= 0 ? 1 : 0);
/** A side's sign (-1 larboard, +1 starboard) from its index. */
export const sideSign = (index: 0 | 1): number => (index === 1 ? 1 : -1);

/** His sides as the gunner reports them, she lying `off` his bow (`trueOff` as the gun captains see it). */
export function sideReports(own: SimShip, off: number, trueOff: number): [SideReport, SideReport] {
  const places = battery(), counts = [{ mounted: 0, ready: 0, readyBearing: 0 }, { mounted: 0, ready: 0, readyBearing: 0 }];
  places.forEach((p, i) => {
    const g = gunAt(own.guns, i), c = counts[p.side > 0 ? 1 : 0]!;
    if (g.dismounted) return;
    c.mounted++;
    if (g.drill !== 'ready') return;
    c.ready++;
    if (Math.abs(angleDiff(p.side * QUARTER, trueOff)) <= GUNS[p.gun].train) c.readyBearing++;
  });
  const bears = (sign: number) => Math.abs(angleDiff(sign * QUARTER, off)) <= BEARS_WITHIN;
  return [{ ...counts[0]!, bears: bears(-1) }, { ...counts[1]!, bears: bears(1) }];
}

/** The lower masts' places in the rig plan's spars (fore, main). */
let lowerMasts: readonly number[] | null = null;
/** The masts of a ship still standing, as seen from across the water. */
function mastsStanding(ship: SimShip): number {
  lowerMasts ??= MASTS.map((m) => rigPlan().spars.findIndex((s) => s.id === `${m}${MAST_SUFFIX}`));
  const down = standingNow(ship.damage).down;
  return lowerMasts.filter((m) => !down[m]).length;
}

/** What the captain of `ship` (with the eye of `skill`) knows at the start of the step of `state`. The duel's enemy is the other ship. */
export function sightOf(state: SimState, ship: number, skill: Skill): Sight {
  const own = state.ships[ship]!, other = state.ships[1 - ship]!, t = simTime(state);
  const me = own.motion.pose, her = other.motion.pose, row = SKILL[skill];
  const rng = new Rng(deriveSeed(state.matchSeed, 'captain', ship, state.tick));
  const range = apartOnWater(me, her) * Math.max(0, 1 + rng.gaussian(0, row.judgeRange));
  const bearing = wrapBearing(bearingTo(me, her) + rng.gaussian(0, row.judgeBearing));
  const wind = meanWind(state.wind, t), windFrom = wind.from, [wx, wz] = bearingDir(windFrom);
  const off = angleDiff(own.sailing.heading, bearing), trueOff = angleDiff(own.sailing.heading, bearingTo(me, her));
  const d = own.damage;
  return {
    tick: state.tick, t, ship, own,
    enemy: { x: her.x, z: her.z, heading: other.sailing.heading, ahead: other.sailing.ahead, quarters: other.told.quarters, masts: mastsStanding(other) },
    wind, windFrom, force: state.wind.windForce, range, bearing, off,
    windward: (me.x - her.x) * wx + (me.z - her.z) * wz,
    sides: sideReports(own, off, trueOff),
    water: waterIn(d), leaks: openHoles(d).length,
    fire: d.fires.reduce((m, f) => Math.max(m, f.size), 0), wreckage: d.alongside.length,
    beaten: state.fight.beaten[ship] ?? false,
  };
}
