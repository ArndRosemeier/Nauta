/**
 * How a computer captain handles his ship (pure, implementation plan N7.1): where he wants her head, and the master's
 * order that gets it. Closing from afar he steers for where she will be, to windward of her by his skill (the weather
 * position) and astern of her (her stern, to rake her); inside his fighting range he lays a broadside on her, closing
 * on a slant while he is beyond his range and opening while inside it, and turning away whatever else when the ships
 * would touch.
 *
 * The heading he wants becomes the order a captain gives: a course on the tack she is on (never closer than
 * close-hauled, `OFF_CLOSE` off it), full and by when he wants to go closer to the wind than she will lie, a tack onto
 * the other board when that heads him much nearer (`TACK_GAIN`) and she has way enough not to miss stays, and a course
 * on the other tack (the master wears round) when she has not. An order that would change nothing worth a change
 * (`TURN_AT`) is not given.
 */
import { angleDiff } from '@futuremagic/core';
import { goingAbout, tackOf, type Order } from '../orders';
import {
  BACK_ABAFT, BACK_MOST, BEARS_WITHIN, CLOSEST, LAYING_SPARE, WORD_READY, CLOSING_PER_RANGE, FILL_ABAFT, HYSTERESIS, OFF_BEARING, STATION_RANGES, ENGAGE_BEYOND, LEAD_MOST, MOST_CLOSING, OFF_CLOSE, RAKE_WITHIN, READY_SIDE, SAME_SIDE, SKILL, TACK_GAIN, TACK_WAY,
  TURN_AT, type Skill,
} from '../rules/captain';
import { HOVE_TO_MAST } from '../rules/orders';
import { CLOSE_HAULED } from '../rules/sailing';
import { MASTS } from '../ship/sailing';
import { bearingDir, KNOT, wrapBearing } from '../units';
import { sideIndex, sideSign, type Sight } from './sight';

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

/** Where he steers while closing: for where she will be, to windward of her and astern of her by his skill. */
function closing(sight: Sight, skill: Skill): number {
  const row = SKILL[skill], me = sight.own.motion.pose;
  const [bx, bz] = bearingDir(sight.bearing), [hx, hz] = bearingDir(sight.enemy.heading), [wx, wz] = bearingDir(sight.windFrom);
  const lead = Math.min(LEAD_MOST, sight.range / Math.max(sight.own.sailing.ahead, KNOT)) * row.lead * sight.enemy.ahead;
  const astern = row.rake * row.range;
  const x = me.x + bx * sight.range + hx * (lead - astern) + wx * row.gauge;
  const z = me.z + bz * sight.range + hz * (lead - astern) + wz * row.gauge;
  return wrapBearing(Math.atan2(x - me.x, -(z - me.z)));
}

/**
 * Laying his broadside on her: the heading that puts her on side `k`, turned toward her by how far he is beyond his
 * range; while that side stands ready he turns toward her no more than its guns still bear (fire, then close).
 */
function broadside(sight: Sight, skill: Skill, k: 0 | 1): number {
  const row = SKILL[skill], sign = sideSign(k), side = sight.sides[k];
  const hold = row.rake > 0 && inHerRake(sight) && sight.range > CLOSEST;
  const most = side.mounted > 0 && side.ready >= WORD_READY * side.mounted ? BEARS_WITHIN - LAYING_SPARE : MOST_CLOSING;
  const closingBy = hold ? 0 : Math.max(-MOST_CLOSING, Math.min(most, ((sight.range - row.range) / row.range) * CLOSING_PER_RANGE));
  return wrapBearing(sight.bearing - sign * (BEAM - closingBy));
}

/** Where he wants her head now (see the file's head). */
export function wantedHeading(sight: Sight, skill: Skill): Wanted {
  const row = SKILL[skill], own = sight.own.sailing, now = sideIndex(sight.off);
  if (sight.range > row.range + ENGAGE_BEYOND) return { heading: closing(sight, skill), side: null };
  let best: Wanted = { heading: own.heading, side: now }, bestScore = Infinity;
  for (const k of [0, 1] as const) {
    const heading = broadside(sight, skill, k);
    const can = sailableOn(tackOf(heading, sight.windFrom, 1), heading, sight.windFrom);
    const report = sight.sides[k];
    const score = Math.abs(angleDiff(own.heading, can)) + OFF_BEARING * Math.abs(angleDiff(can, heading)) - (report.mounted > 0 ? (report.ready / report.mounted) * READY_SIDE : -READY_SIDE) - (k === now ? SAME_SIDE : 0);
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
  if (Math.abs(angleDiff(other, want)) + TACK_GAIN < Math.abs(angleDiff(same, want))) {
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
 * she has dropped abaft his beam, filled when she is back abreast of him, or when he is closing again.
 */
export function stationOrder(sight: Sight, skill: Skill, wanted: Wanted): Order | null {
  const row = SKILL[skill], told = sight.own.told, ship = sight.ship, main = MASTS.indexOf(HOVE_TO_MAST);
  if (told.hove) return null;
  const abaft = Math.abs(sight.off) - BEAM, station = row.range * STATION_RANGES;
  if (!told.backed[main] && wanted.side !== null && sight.range < station && abaft > BACK_ABAFT && abaft < BACK_MOST) return { kind: 'back', ship, mast: HOVE_TO_MAST };
  if (told.backed[main] && (wanted.side === null || sight.range > station * HYSTERESIS || abaft < FILL_ABAFT || abaft > BACK_MOST)) return { kind: 'fill', ship };
  return null;
}

/** Whether what the helmsman has been told is a turn (`TURN_AT`) or more from a heading. */
function farFrom(helm: Sight['own']['told']['helm'], heading: number, tack: number, from: number): boolean {
  const told = helm.by ? byOn(helm.by, from) : helm.heading;
  return helm.by !== 0 && helm.by !== tack ? true : Math.abs(angleDiff(told, heading)) >= TURN_AT;
}
