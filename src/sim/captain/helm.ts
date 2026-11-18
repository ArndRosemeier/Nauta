/**
 * How a computer captain handles his ship (pure, implementation plan N7.1): where he wants her head, and the master's
 * order that gets it. Closing from afar he steers for where she will be, to windward of her by his skill (the weather
 * position) and astern of her (her stern, to rake her); inside his fighting range he lays a broadside on her, closing
 * on a slant while he is beyond his range and opening while inside it, and turning away whatever else when the ships
 * would touch. With the water gaining on him he would rather fight the side the sea is not washing in at (N7.5a).
 *
 * The heading he wants becomes the order a captain gives: a course on the tack she is on (never closer than
 * close-hauled, `OFF_CLOSE` off it), full and by when he wants to go closer to the wind than she will lie, a tack onto
 * the other board when that heads him much nearer (`TACK_GAIN`) and she has way enough not to miss stays, and a course
 * on the other tack (the master wears round) when she has not. An order that would change nothing worth a change
 * (`TURN_AT`) is not given.
 */
import { angleDiff } from '@futuremagic/core';
import { goingAbout, isGunnery, isKeep, isLife, tackOf, type Keep, type Order, type SailingOrder } from '../orders';
import {
  BACK_ABAFT, BACK_MOST, BEARS_WITHIN, CLOSEST, LAYING_SPARE, WORD_READY, CLOSING_PER_RANGE, FILL_ABAFT, HYSTERESIS, OFF_BEARING, STATION_RANGES, ENGAGE_BEYOND, LEAD_MOST, MOST_CLOSING, OFF_CLOSE, RAKE_WITHIN, READY_SIDE, SAME_SIDE, SKILL, TACK_GAIN, TACK_WAY,
  TURN_AT, WEAR_GAIN, WOUNDED_MOST, WOUNDED_SIDE, type Skill,
} from '../rules/captain';
import { HOVE_TO_MAST, MASTER_LOOK } from '../rules/orders';
import { CLOSE_HAULED } from '../rules/sailing';
import { MASTS } from '../ship/sailing';
import type { SimState } from '../state';
import { foeOf } from '../foes';
import { bearingDir, KNOT, STEPS_PER_SECOND, wrapBearing } from '../units';
import { sideIndex, sideSign, sightOf, type Sight } from './sight';

/** A quarter turn, rad: her beam. */
const BEAM = Math.PI / 2;
/** The nearest to the wind he steers a course, rad off it. */
const NEAREST = CLOSE_HAULED + OFF_CLOSE;

/** Close-hauled on a tack, as he steers it (`OFF_CLOSE` off), a compass bearing, rad. */
const byOn = (tack: number, from: number): number => wrapBearing(from - tack * NEAREST);

/**
 * The heading nearest `want` she can steer on `tack`: `want` itself when it lies on that tack and no closer than
 * close-hauled; close-hauled on the tack when it lies closer or to windward on the other; dead before the wind when it lies
 * to leeward on the other.
 */
export function sailableOn(tack: number, want: number, from: number): number {
  const off = angleDiff(want, from);
  if (tackOf(want, from, tack) === tack) return Math.abs(off) < NEAREST ? byOn(tack, from) : wrapBearing(want);
  return Math.abs(off) < BEAM ? byOn(tack, from) : wrapBearing(from + Math.PI);
}

/** Where he wants her head now (a compass bearing, rad), and the side he fights with (index into `Sight.sides`), or null while closing. */
export interface Wanted {
  readonly heading: number;
  readonly side: 0 | 1 | null;
}

/** Whether he lies within her rake: near her bow or stern line, where her broadside cannot bear on him. */
function inHerRake(sight: Sight): boolean {
  const fromHer = wrapBearing(sight.bearing + Math.PI), a = Math.abs(angleDiff(sight.enemy.heading, fromHer));
  return a < RAKE_WITHIN || a > Math.PI - RAKE_WITHIN;
}

/**
 * The heading for a point by her: where she will be (her way times the time to reach her, at most `LEAD_MOST`, by
 * `lead`), `astern` m back along her wake and `gauge` m to windward of her.
 */
function toward(sight: Sight, lead: number, astern: number, gauge: number): number {
  const me = sight.own.motion.pose;
  const [bx, bz] = bearingDir(sight.bearing), [hx, hz] = bearingDir(sight.enemy.heading), [wx, wz] = bearingDir(sight.windFrom);
  const ahead = Math.min(LEAD_MOST, sight.range / Math.max(sight.own.sailing.ahead, KNOT)) * lead * sight.enemy.ahead;
  const x = me.x + bx * sight.range + hx * (ahead - astern) + wx * gauge;
  const z = me.z + bz * sight.range + hz * (ahead - astern) + wz * gauge;
  return wrapBearing(Math.atan2(x - me.x, -(z - me.z)));
}

/** Where he steers while closing: for where she will be, to windward of her and astern of her by his skill. */
function closing(sight: Sight, skill: Skill): number {
  const row = SKILL[skill];
  return toward(sight, row.lead, row.rake * row.range, row.gauge);
}

/**
 * Laying a broadside on her at `range`, m: the heading that puts her on side `k`, turned toward her by how far she is
 * beyond the range (away inside it); while that side stands ready it turns toward her no more than its guns still
 * bear (fire, then close), or always (`keepBearing`). One who works for her stern (`rake`) holds on while he lies in her rake.
 */
function broadside(sight: Sight, range: number, rake: boolean, keepBearing: boolean, k: 0 | 1): number {
  const sign = sideSign(k), side = sight.sides[k];
  const hold = rake && inHerRake(sight) && sight.range > CLOSEST;
  const most = keepBearing || (side.mounted > 0 && side.ready >= WORD_READY * side.mounted) ? BEARS_WITHIN - LAYING_SPARE : MOST_CLOSING;
  const closingBy = hold ? 0 : Math.min(most, closingFor(sight.range, range));
  return wrapBearing(sight.bearing - sign * (BEAM - closingBy));
}

/** How far to turn toward her to hold `range`, m, at `now`, m: `CLOSING_PER_RANGE` for each range beyond it, as much away inside it, at most `MOST_CLOSING` either way. */
const closingFor = (now: number, range: number): number => Math.max(-MOST_CLOSING, Math.min(MOST_CLOSING, ((now - range) / range) * CLOSING_PER_RANGE));

/** Where he wants her head now (see the file's head). */
export function wantedHeading(sight: Sight, skill: Skill): Wanted {
  const row = SKILL[skill], own = sight.own.sailing, now = sideIndex(sight.off);
  if (sight.range > row.range + ENGAGE_BEYOND) return { heading: closing(sight, skill), side: null };
  let best: Wanted = { heading: own.heading, side: now }, bestScore = Infinity;
  for (const k of [0, 1] as const) {
    const heading = broadside(sight, row.range, row.rake > 0, row.keepBearing, k);
    const can = sailableOn(tackOf(heading, sight.windFrom, 1), heading, sight.windFrom);
    const report = sight.sides[k];
    // The water gaining on him (past his mark), a side with the sea washing in at it counts against itself: turned away, its holes lift clear.
    const wounded = sight.water >= row.pumpsAt ? Math.min(WOUNDED_MOST, report.leaks * WOUNDED_SIDE) : 0;
    const score = Math.abs(angleDiff(own.heading, can)) + OFF_BEARING * Math.abs(angleDiff(can, heading)) - (report.mounted > 0 ? (report.ready / report.mounted) * READY_SIDE : -READY_SIDE) - (k === now ? SAME_SIDE : 0) + wounded;
    if (score < bestScore) { bestScore = score; best = { heading, side: k }; }
  }
  // Too close: whichever side he fights, his head is turned away from her.
  if (sight.range < CLOSEST && best.side !== null) return { heading: wrapBearing(sight.bearing - sideSign(best.side) * (BEAM + MOST_CLOSING)), side: best.side };
  return best;
}

/**
 * The master's order that brings her head toward `want`, or null when none is worth giving: a course or full and by
 * on her tack, a tack, or a course on the other tack (wearing round). Nothing while she is tacking or wearing.
 */
export function helmOrder(sight: Sight, want: number): Order | null {
  const own = sight.own, s = own.sailing, told = own.told, from = sight.windFrom, ship = sight.ship;
  if (goingAbout(told)) return null;
  const tack = tackOf(s.heading, from, s.sides[0]!);
  const same = sailableOn(tack, want, from), other = sailableOn(-tack, want, from);
  const gain = Math.abs(angleDiff(want, from)) < BEAM ? TACK_GAIN : WEAR_GAIN;
  if (Math.abs(angleDiff(other, want)) + gain < Math.abs(angleDiff(same, want))) {
    // To windward on the other board: go about with way enough, else wear round to it.
    if (Math.abs(angleDiff(want, from)) < BEAM && s.ahead >= TACK_WAY) return { kind: 'tack', ship };
    return farFrom(told.helm, other, -tack, from) ? { kind: 'steer', ship, heading: other } : null;
  }
  if ((Math.abs(angleDiff(want, from)) < NEAREST && tackOf(want, from, tack) === tack) || Math.abs(angleDiff(same, byOn(tack, from))) < TURN_AT) {
    return told.helm.by === tack ? null : { kind: 'by', ship };
  }
  return farFrom(told.helm, same, tack, from) ? { kind: 'steer', ship, heading: same } : null;
}

/**
 * Keeping station on her while he lays his broadside (rules/captain.ts `BACK_ABAFT`): his main topsail laid aback when
 * she has dropped abaft his beam, filled when she is back abreast of him, or when he is closing again. Never with that
 * mast's stays shot away (`Sight.unstayed`): laid aback, it would be in danger.
 */
export function stationOrder(sight: Sight, skill: Skill, wanted: Wanted): Order | null {
  const row = SKILL[skill], told = sight.own.told, ship = sight.ship, main = MASTS.indexOf(HOVE_TO_MAST);
  if (told.hove) return null;
  const abaft = Math.abs(sight.off) - BEAM, station = row.range * STATION_RANGES;
  if (!told.backed[main] && !sight.unstayed[main] && wanted.side !== null && sight.range < station && abaft > BACK_ABAFT && abaft < BACK_MOST) return { kind: 'back', ship, mast: HOVE_TO_MAST };
  if (told.backed[main] && (wanted.side === null || sight.range > station * HYSTERESIS || abaft < FILL_ABAFT || abaft > BACK_MOST)) return { kind: 'fill', ship };
  return null;
}

/** Whether what the helmsman has been told is a turn (`TURN_AT`) or more from a heading. */
function farFrom(helm: Sight['own']['told']['helm'], heading: number, tack: number, from: number): boolean {
  const told = helm.by ? byOn(helm.by, from) : helm.heading;
  return helm.by !== 0 && helm.by !== tack ? true : Math.abs(angleDiff(told, heading)) >= TURN_AT;
}

/** The master's eye (rules/captain.ts): how well he judges her range and bearing when he steers by a standing order. */
const MASTER_EYE: Skill = 'master';

/**
 * Where the master wants her head for a standing order (orders.ts `Keep`): for her, at where she will be; her on the
 * beam, her own course, turned toward her on the side she lies on as the computer captain closes on a broadside (or
 * away), to hold the range the order was given at.
 */
export function keptHeading(sight: Sight, keep: Keep): number {
  if (keep.kind === 'follow') return toward(sight, 1, 0, 0);
  return wrapBearing(sight.enemy.heading + sideSign(sideIndex(sight.off)) * closingFor(sight.range, Math.max(keep.range, CLOSEST)));
}

/**
 * The master's own helm order for her standing order (steer for her, her on the beam), or null: every `MASTER_LOOK`
 * seconds he looks at her and gives what the computer captain's helm would (`helmOrder`): a course, full and by, a
 * tack or a wear. Against her foe, the nearest enemy (the other ship in a duel).
 */
export function masterOrder(state: SimState, ship: number): SailingOrder | null {
  const keep = state.ships[ship]?.told.keep;
  if (!keep || state.tick % Math.round(MASTER_LOOK * STEPS_PER_SECOND) !== 0 || foeOf(state.ships, ship) === null) return null;
  const sight = sightOf(state, ship, MASTER_EYE);
  const order = helmOrder(sight, keptHeading(sight, keep));
  return order && !isGunnery(order) && !isLife(order) && !isKeep(order) && order.kind !== 'sound' ? order : null;
}
