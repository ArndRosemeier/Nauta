/**
 * Planning a manoeuvre (pure, implementation plan N7.6): how a computer captain, at any of his levels, decides where to
 * take her. "Intelligent manoeuvring is rewarded" (Arnd, 2026-11-18): the game's rules pay for position, and this is where
 * a captain reads them.
 *
 * What position is worth is in the rules, not here: a gun bears only within `BEARS_ON` of square to her side (the
 * carronade trains 30° either way, rules/guns.ts), so a ship lying off the other's bow or stern is not answered; a ball
 * in along her length rakes her (rules/damage.ts `RAKING`) and counts for several; a side that has fired is unloaded for
 * a reload; a ship with her rigging cut cannot get away. Each look he tries a fan of headings, and for each projects both
 * ships over his `horizon` (she holds her course and way, he turns at what she turns at, loses way turning, tacks or
 * wears, and perhaps lays his topsail aback to let her draw ahead), counts the broadsides each ship could fire in it (a
 * side that bears and is loaded; worth less beyond his fighting range, a rake worth `RAKE_WORTH`; hers weighed by his
 * `caution`), and steers the best. So crossing her stern, turning to bring the loaded side to bear, keeping out of her
 * arc, the weather position and wearing round all come out of the one count, better the farther he looks ahead.
 *
 * The levels differ in how far ahead he looks, how many courses he tries, whether he knows when each side is loaded again
 * and whether he can slow her (rules/captain.ts); and his judgement wavers a little (seeded for each look, the same on
 * every machine). The helm turns the heading he wants into the orders (helm.ts); the player's "Cross her stern" and
 * "Cross her bow" (orders.ts `rake`) ask the same plan to count only the broadsides across that end.
 */
import { angleDiff, deriveSeed, Rng } from '@futuremagic/core';
import {
  APPROACH_COST, APPROACH_MARGIN, ARC_STEP, BEARS_ON, CANVAS_SPEED, CLOSEST, COLLISION_COST, CROSSED_WITHIN, ENGAGE_BEYOND, CROSSING, FORCE_SPEED, GAUGE_FULL, GAUGE_SCALE, GAUGE_WORTH, NO_WAY_BELOW, PULL_PER, HANDLING, OFF_CLOSE, PLAN_STEP, RAKE_REACH, RAKE_WORTH, READY_ENOUGH, RELOAD_TIME,
  HOLD_WITHIN, IDLE_COST, LAYING_TIME, SKILL, SLOW_COST, STICK, TACK_COST, TACK_RECOVERY, TACK_WAY, TURN_COST, TURNED, WORTH_FALLS, type Skill, type SkillRow,
} from '../rules/captain';
import { RAKING } from '../rules/damage';
import { HOVE_TO_MAST } from '../rules/orders';
import { MASTS } from '../ship/sailing';
import { CLOSE_HAULED, SPEED_TABLE } from '../rules/sailing';
import { bearingDir, bearingTo, DEGREE, KNOT, wrapBearing } from '../units';
import type { Sight } from './sight';

/** Crossing her stern or her bow, as the player's master is ordered to. */
export type Crossing = 'stern' | 'bow';

/** What he plans: the course, whether to lay the main topsail aback, the side he would fire (index into `Sight.sides`) and what he counted. */
export interface Plan {
  /** Whether the plan is worth leaving the course he fights by for (`SkillRow.margin`); if not, `heading` is that course. */
  readonly departs: boolean;
  readonly heading: number;
  readonly slow: boolean;
  readonly side: 0 | 1;
  readonly score: number;
  /** The broadsides in it that rake her, and those of hers that rake him (what a manoeuvre is for: to rake her, or to be out of her rake). */
  readonly rakes: number;
  readonly raked: number;
}

/** The nearest to the wind he steers, rad off it. */
const NEAREST = CLOSE_HAULED + OFF_CLOSE;
/** Her speed through the water, m/s, at a true wind angle off her bow, rad, and a force (`FORCE_SPEED`, `SPEED_TABLE`). */
export function pace(off: number, force: number): number {
  const deg = Math.abs(off) / DEGREE;
  let knots = 0;
  if (deg >= SPEED_TABLE[0]![0]) {
    knots = SPEED_TABLE[SPEED_TABLE.length - 1]![1];
    for (let i = 1; i < SPEED_TABLE.length; i++) {
      const [a0, k0] = SPEED_TABLE[i - 1]!, [a1, k1] = SPEED_TABLE[i]!;
      if (deg <= a1) { knots = k0 + ((k1 - k0) * (deg - a0)) / (a1 - a0); break; }
    }
  } else knots = (SPEED_TABLE[0]![1] * Math.max(0, deg - NO_WAY_BELOW)) / (SPEED_TABLE[0]![0] - NO_WAY_BELOW);
  let share = 1;
  if (force <= FORCE_SPEED[FORCE_SPEED.length - 1]![0]) {
    share = FORCE_SPEED[0]![1];
    for (let i = 1; i < FORCE_SPEED.length; i++) {
      const [f0, s0] = FORCE_SPEED[i - 1]!, [f1, s1] = FORCE_SPEED[i]!;
      if (force <= f1) { share = s0 + ((s1 - s0) * (Math.max(f0, force) - f0)) / (f1 - f0); break; }
    }
  }
  return knots * KNOT * share;
}

/** The heading nearest `heading` that she can steer: itself, or close-hauled on its side of the wind. */
function sailable(heading: number, from: number): number {
  const off = angleDiff(from, heading);
  return Math.abs(off) >= NEAREST ? wrapBearing(heading) : wrapBearing(from + Math.sign(off || 1) * NEAREST);
}

/** How far to turn from `from` to `to` (rad, + to starboard): the short way, through the wind when she has way to tack, else the long way round before it. */
function turnTo(from: number, to: number, windFrom: number, way: number): { turn: number; tacks: boolean } {
  const short = angleDiff(from, to), sign = Math.sign(short) || 1;
  let crosses = false;
  for (let a = 0; a < Math.abs(short); a += ARC_STEP) if (Math.abs(angleDiff(windFrom, from + sign * a)) < CLOSE_HAULED) crosses = true;
  if (!crosses) return { turn: short, tacks: false };
  return way >= TACK_WAY ? { turn: short, tacks: true } : { turn: short - sign * 2 * Math.PI, tacks: false };
}

/**
 * How far she turns, rad (+ to starboard), to bring her broadside on a point at `toward` (a bearing): the nearer of her two
 * sides. A captain who reckons with her reply takes her to do it.
 */
function answerTurn(heading: number, toward: number): number {
  const off = angleDiff(heading, toward), side = off >= 0 ? 1 : -1;
  return off - side * (Math.PI / 2);
}

/** The share a broadside is worth at a range, m, for a captain who fights at `fight`: all of it up to there, then less. */
const worth = (range: number, fight: number): number => 1 / (1 + (Math.max(0, range - fight) / (fight * WORTH_FALLS)) ** 2);

/** The side bearing on a point at `off` off her bow (+ to starboard): its index, or null when it lies off both arcs. */
function sideBearing(off: number): 0 | 1 | null {
  return Math.abs(Math.abs(off) - Math.PI / 2) <= BEARS_ON ? (off >= 0 ? 1 : 0) : null;
}

/** Which end of her a ball fired along `line` (a bearing) from where the other lies meets, given her heading: her stern, her bow, or neither (it strikes her side). */
function raked(line: number, heading: number): Crossing | null {
  const a = Math.abs(angleDiff(heading, line));
  return a < RAKING.within ? 'stern' : a > Math.PI - RAKING.within ? 'bow' : null;
}

/**
 * Whether ship `me` has made her pass across the `end` of ship `her` (rules/captain.ts `CROSSED_WITHIN`): near her, her bow or
 * stern on the line of a ball from one of my broadsides that bears (the pass the master of "Cross her stern" reports).
 */
export function crossedAt(me: { x: number; z: number; heading: number }, her: { x: number; z: number; heading: number }, end: Crossing): boolean {
  const line = bearingTo(me, her);
  return Math.hypot(her.x - me.x, her.z - me.z) <= CROSSED_WITHIN && sideBearing(angleDiff(me.heading, line)) !== null && raked(line, her.heading) === end;
}

/** What the planning reads, worked out once for all the courses tried. */
interface Setting {
  readonly sight: Sight;
  readonly row: SkillRow;
  readonly fight: number;
  readonly steps: number;
  readonly crossing: Crossing | null;
  /** Where she lies (from her bearing and range as he judges them), her heading and her way, m/s; and whether he reckons she turns to bring her broadside on him (`SkillRow.replies`) or holds her course. */
  readonly herAt: readonly [number, number];
  readonly herHeading: number;
  readonly herWay: number;
  readonly replies: boolean;
  /** The course the helmsman has been told, and whether the main topsail lies aback: what he keeps to unless another course is worth more. */
  readonly ordered: number;
  /** Her speed under the canvas she carries, as a share of plain sail's (rules/captain.ts `CANVAS_SPEED`). */
  readonly canvas: number;
  readonly backed: boolean;
  /** Seconds until each of his sides is loaded again and each of hers, and how much each side of his is worth (the share of the stronger's guns). */
  readonly mineWait: readonly [number, number];
  readonly herWait: readonly [number, number];
  readonly strength: readonly [number, number];
  readonly gauge: number;
}

/** Seconds until a side with `share` of its guns ready is loaded again enough to fire: none if it is ready enough. */
const waitFor = (share: number): number => (share >= READY_ENOUGH ? 0 : RELOAD_TIME * (1 - share / READY_ENOUGH));

/** One course projected: what it is worth (the broadsides counted, the range at its end, the way it leaves her), and the side whose broadside it fires first. */
function project(c: Setting, heading: number, slow: boolean): Plan {
  const sight = c.sight, own = sight.own.sailing, pose = sight.own.motion.pose, from = sight.windFrom, force = sight.force;
  const { turn: total, tacks } = turnTo(own.heading, heading, from, own.ahead);
  let myRakes = 0, herRakes = 0, turnedUntil = 0, x = pose.x, z = pose.z, hd = own.heading, v = Math.max(0, own.ahead), left = total, score = 0, first: 0 | 1 | null = null;
  const mine = [c.mineWait[0], c.mineWait[1]], hers = [c.herWait[0], c.herWait[1]];
  let hx = c.herAt[0], hz = c.herAt[1], herHd = c.herHeading;
  const mineLaid = [0, 0], hersLaid = [0, 0];
  for (let j = 0; j < c.steps; j++) {
    const t = (j + 1) * PLAN_STEP;
    const dh = Math.max(-HANDLING.turn * PLAN_STEP, Math.min(HANDLING.turn * PLAN_STEP, left));
    hd += dh;
    left -= dh;
    const turning = Math.abs(left) > TURNED;
    if (turning) turnedUntil = t + (tacks ? TACK_RECOVERY : 0);
    const aim = pace(angleDiff(from, hd), force) * c.canvas * (slow ? HANDLING.slowed : 1) * (tacks && t <= turnedUntil ? HANDLING.tacking : turning ? HANDLING.turning : 1);
    v += (aim - v) * (1 - Math.exp(-PLAN_STEP / HANDLING.way));
    const [dx, dz] = bearingDir(hd);
    x += dx * v * PLAN_STEP;
    z += dz * v * PLAN_STEP;
    if (c.replies) herHd += Math.max(-HANDLING.turn * PLAN_STEP, Math.min(HANDLING.turn * PLAN_STEP, answerTurn(herHd, bearingTo({ x: hx, z: hz }, { x, z }))));
    const [ex, ez] = bearingDir(herHd);
    hx += ex * c.herWay * PLAN_STEP;
    hz += ez * c.herWay * PLAN_STEP;
    const range = Math.hypot(hx - x, hz - z), line = bearingTo({ x, z }, { x: hx, z: hz });
    if (range < CLOSEST) score -= COLLISION_COST;
    const w = worth(range, c.fight);
    // His broadside on her: the side that bears, if it is loaded by now.
    const k = sideBearing(angleDiff(hd, line));
    mineLaid[0] = k === 0 ? mineLaid[0]! + PLAN_STEP : 0;
    mineLaid[1] = k === 1 ? mineLaid[1]! + PLAN_STEP : 0;
    if (k !== null && t >= mine[k]! && mineLaid[k]! >= LAYING_TIME) {
      const end = raked(line, herHd);
      const crossing = c.crossing === null ? 1 : end === c.crossing ? CROSSING.wanted : CROSSING.other;
      score += c.strength[k]! * w * (end ? RAKE_WORTH : 1) * crossing;
      if (end) myRakes++;
      mine[k] = t + RELOAD_TIME;
      first ??= k;
    }
    // Hers on him.
    const back = wrapBearing(line + Math.PI), kh = sideBearing(angleDiff(herHd, back));
    hersLaid[0] = kh === 0 ? hersLaid[0]! + PLAN_STEP : 0;
    hersLaid[1] = kh === 1 ? hersLaid[1]! + PLAN_STEP : 0;
    if (kh !== null && t >= hers[kh]! && hersLaid[kh]! >= LAYING_TIME) {
      score -= c.row.caution * w * (raked(back, hd) ? RAKE_WORTH : 1);
      if (raked(back, hd)) herRakes++;
      hers[kh] = t + RELOAD_TIME;
    }
  }
  const end = Math.hypot(hx - x, hz - z);
  if (first === null) score -= IDLE_COST;
  if (c.crossing !== null) {
    // The end of her ordered: a point `reach` m beyond her stern or bow along her course.
    const [ux, uz] = bearingDir(herHd), at = c.crossing === 'bow' ? CROSSING.reach : -CROSSING.reach;
    score -= (CROSSING.pull * Math.hypot(hx + ux * at - x, hz + uz * at - z)) / PULL_PER;
  }
  score -= APPROACH_COST * Math.max(0, end - c.fight) / c.fight;
  const [wx, wz] = bearingDir(from);
  score += GAUGE_WORTH * c.gauge * Math.tanh(((x - hx) * wx + (z - hz) * wz) / GAUGE_SCALE);
  score -= TURN_COST * Math.abs(total) / Math.PI + (slow ? SLOW_COST : 0) + (tacks ? TACK_COST : 0);
  if (Math.abs(angleDiff(c.ordered, heading)) < HOLD_WITHIN) score += STICK.course;
  if (slow === c.backed) score += STICK.topsail;
  return { departs: true, rakes: myRakes, raked: herRakes, heading, slow, side: first ?? (angleDiff(hd, bearingTo({ x, z }, { x: hx, z: hz })) >= 0 ? 1 : 0), score };
}

/**
 * The course he plans at this look: the best of the headings he tries (and, if he can, each with her slowed), by his
 * skill's horizon, the count of broadsides (see the file's head) and a waver of his judgement. `crossing`: the player's
 * master crossing her stern or bow, counting only the broadsides across that end for all but the planning's own (the
 * seasoned captain's, `MASTER_PLANS`) skill.
 */
export function plan(sight: Sight, skill: Skill, by: number, crossing: Crossing | null = null): Plan {
  // Ordered across her stern or bow he plans it whatever else: no margin, and the topsail left alone (the helm's orders only).

  const row = SKILL[skill], pose = sight.own.motion.pose;
  const steps = Math.max(1, Math.round(row.horizon / PLAN_STEP));
  const [bx, bz] = bearingDir(sight.bearing);
  const sides = sight.sides, most = Math.max(sides[0].mounted, sides[1].mounted, 1);
  const share = (k: 0 | 1) => (row.reckons && sides[k].mounted > 0 ? sides[k].ready / sides[k].mounted : 1);
  const c: Setting = {
    sight, row, fight: row.range, steps, crossing, herAt: [pose.x + bx * sight.range, pose.z + bz * sight.range], herHeading: sight.enemy.heading, herWay: Math.max(0, sight.enemy.ahead), replies: row.reckons, canvas: CANVAS_SPEED[sight.own.told.canvas], ordered: sight.own.told.helm.by !== 0 ? sight.own.sailing.heading : sight.own.told.helm.heading, backed: sight.own.told.backed[MASTS.indexOf(HOVE_TO_MAST)] === true,
    mineWait: [waitFor(share(0)), waitFor(share(1))], herWait: [waitFor(sight.enemy.loaded[0]), waitFor(sight.enemy.loaded[1])],
    strength: [sides[0].mounted / most, sides[1].mounted / most], gauge: row.gauge / GAUGE_FULL,
  };
  const rng = new Rng(deriveSeed(sight.matchSeed, 'plan', sight.ship, sight.tick));
  const tried = new Set<number>();
  const headings: number[] = [];
  for (let i = 0; i < row.headings; i++) {
    const h = Math.round(sailable((i * 2 * Math.PI) / row.headings, sight.windFrom) / DEGREE);
    if (!tried.has(h)) { tried.add(h); headings.push(h * DEGREE); }
  }
  headings.push(sailable(sight.bearing, sight.windFrom), sight.own.sailing.heading);
  const byScore = project(c, sailable(by, sight.windFrom), false), byHeading = byScore.heading;
  let best: Plan | null = null, bestSeen = -Infinity;
  for (const h of headings) {
    for (const slow of row.slows && crossing === null ? [false, true] : [false]) {
      const p = project(c, h, slow), seen = p.score + row.waver * rng.gaussian(0, 1);
      if (seen > bestSeen) { bestSeen = seen; best = p; }
    }
  }
  const far = sight.range > row.range + ENGAGE_BEYOND, worthIt = far || sight.range <= row.range * RAKE_REACH && (best!.rakes > 0 || byScore.raked > 0);
  const departs = crossing !== null || worthIt && best!.score - byScore.score >= (far ? APPROACH_MARGIN : row.margin) && Math.abs(angleDiff(byHeading, best!.heading)) >= HOLD_WITHIN;
  return departs ? best! : { ...byScore, departs: false, heading: by };
}
