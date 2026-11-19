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
import { unstayed } from '../damage/fall';
import { waterIn } from '../end';
import { foeOf } from '../foes';
import { battery, gunAt } from '../guns/guns';
import { SKILL, BEARS_WITHIN, FIRE_NOTICE, type Skill } from '../rules/captain';
import { WASH } from '../rules/damage';
import { GUNS } from '../rules/guns';
import { LOAD_WATERLINE } from '../rules/ships';
import { rigPlan } from '../ship/rig';
import { MASTS } from '../ship/sailing';
import type { SimShip, SimState } from '../state';
import { simTime } from '../state';
import { apartOnWater, bearingDir, bearingTo, STEPS_PER_SECOND, wrapBearing } from '../units';
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
  /** The share of each side of her battery standing loaded and run out (larboard, starboard), as the smoke and the open ports show it: 1 for a captain who does not read it (`SkillRow.reckons`). */
  readonly loaded: readonly [number, number];
}

/** A side of his battery as his gunner reports it: the mounted guns, those standing ready, those ready that bear on her (she lies within their training), and whether she lies where the side bears. */
export interface SideReport {
  readonly mounted: number;
  readonly ready: number;
  readonly readyBearing: number;
  readonly bears: boolean;
  /** The carpenter's report: the open holes in that side the sea washes in at (within `WASH` of her waterline). */
  readonly leaks: number;
}

/** What he knows at a look. */
export interface Sight {
  /** The match's seed, for the seeded wavering of his judgement (tactics.ts). */
  readonly matchSeed: number;
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
  /**
   * The water in her, t; the holes the sea comes in at; the largest fire's share of its space of those he has noticed
   * (0: none): a fire is noticed at his `fireAt`, each fire sooner or later than that by a seeded share up to
   * `FIRE_NOTICE` (N7.5a: so a green captain now and then hears of one too late); what lies alongside.
   */
  readonly water: number;
  readonly leaks: number;
  readonly fire: number;
  readonly wreckage: number;
  /** His first lieutenant says she is beaten ("We must strike, sir", N6.4). */
  readonly beaten: boolean;
  /** How long she has been beaten, s (0 while she is not). */
  readonly beatenFor: number;
  /** How long since her master cried a spar in danger (its stays gone, aback), s; null while none is. */
  readonly dangerFor: number | null;
  /** Each mast (fore, main) with a spar whose stays are gone: laid aback, it would be in danger. */
  readonly unstayed: readonly boolean[];
}

/** No mast unstayed (nothing cut). */
const NONE_UNSTAYED: readonly boolean[] = MASTS.map(() => false);
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
  const leaks = [0, 0];
  for (const h of openHoles(own.damage)) if (h.at[2] - LOAD_WATERLINE < WASH) leaks[h.at[1] > 0 ? 1 : 0]!++;
  return [{ ...counts[0]!, bears: bears(-1), leaks: leaks[0]! }, { ...counts[1]!, bears: bears(1), leaks: leaks[1]! }];
}

/** The share of each side's mounted guns that stand ready (larboard, starboard): a side with none mounted counts as none. */
function loadedShares(ship: SimShip): readonly [number, number] {
  const [l, s] = sideReports(ship, 0, 0);
  return [l.mounted > 0 ? l.ready / l.mounted : 0, s.mounted > 0 ? s.ready / s.mounted : 0];
}

/** The lower masts' places in the rig plan's spars (fore, main). */
let lowerMasts: readonly number[] | null = null;
/** The masts of a ship still standing, as seen from across the water. */
function mastsStanding(ship: SimShip): number {
  lowerMasts ??= MASTS.map((m) => rigPlan().spars.findIndex((s) => s.id === `${m}${MAST_SUFFIX}`));
  const down = standingNow(ship.damage).down;
  return lowerMasts.filter((m) => !down[m]).length;
}

/** The share of a space a fire there holds when he notices it: his `fireAt`, sooner or later by a seeded share up to `FIRE_NOTICE` (the same for the same fire on every machine). */
function noticedAt(seed: number, ship: number, space: number, fireAt: number): number {
  return fireAt * (1 + FIRE_NOTICE * (2 * new Rng(deriveSeed(seed, 'fire seen', ship, space)).float() - 1));
}

/** What the captain of `ship` (with the eye of `skill`) knows at the start of the step of `state`. His enemy is `foe`, the nearest of the other sides' ships (foes.ts) unless given; the duel's is the other ship. */
export function sightOf(state: SimState, ship: number, skill: Skill, foe: number | null = foeOf(state.ships, ship)): Sight {
  const own = state.ships[ship]!, other = state.ships[foe!]!, t = simTime(state);
  const me = own.motion.pose, her = other.motion.pose, row = SKILL[skill];
  const rng = new Rng(deriveSeed(state.matchSeed, 'captain', ship, state.tick));
  const range = apartOnWater(me, her) * Math.max(0, 1 + rng.gaussian(0, row.judgeRange));
  const bearing = wrapBearing(bearingTo(me, her) + rng.gaussian(0, row.judgeBearing));
  const wind = meanWind(state.wind, t), windFrom = wind.from, [wx, wz] = bearingDir(windFrom);
  const off = angleDiff(own.sailing.heading, bearing), trueOff = angleDiff(own.sailing.heading, bearingTo(me, her));
  const d = own.damage;
  return {
    matchSeed: state.matchSeed, tick: state.tick, t, ship, own,
    enemy: { x: her.x, z: her.z, heading: other.sailing.heading, ahead: other.sailing.ahead, quarters: other.told.quarters, masts: mastsStanding(other), loaded: row.reckons ? loadedShares(other) : [1, 1] },
    wind, windFrom, force: state.wind.windForce, range, bearing, off,
    windward: (me.x - her.x) * wx + (me.z - her.z) * wz,
    sides: sideReports(own, off, trueOff),
    water: waterIn(d), leaks: openHoles(d).length,
    fire: d.fires.reduce((m, f) => (f.size >= noticedAt(state.matchSeed, ship, f.space, row.fireAt) ? Math.max(m, f.size) : m), 0), wreckage: d.alongside.length,
    beaten: state.fight.beaten[ship] ?? false,
    beatenFor: (state.tick - (state.fight.beatenAt[ship] ?? state.tick)) / STEPS_PER_SECOND,
    dangerFor: d.danger.length > 0 ? (state.tick - Math.min(...d.danger.map(([, since]) => since))) / STEPS_PER_SECOND : null,
    unstayed: d.cut.length > 0 ? unstayed(standingNow(d)) : NONE_UNSTAYED,
  };
}
