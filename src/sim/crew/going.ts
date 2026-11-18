/**
 * Men going along their routes (pure, N4.2): each step every man on his way moves on at his speed under the heel,
 * eased by a low deckhead, slowed by the men round him, queuing on a ladder or the shrouds, standing aside for the
 * captain, and looking for another way when one ahead is shut or blocked (closures.ts). A man's going is plain data
 * (the codec carries it); this file owns it. The crew (N4.1) holds one per man on his way and steps them all at once:
 * every man decides from where all were before the step, so the order of the list changes nothing.
 */
import {
  ASIDE_RADIUS, ASIDE_STEP, CROWD_FREE, CROWD_JAM, CROWD_RADIUS, CROWD_SLOWEST, WAY_ABREAST, WAY_GAP, type Haste,
} from '../rules/routes';
import type { Spot } from '../ship/plan';
import { STEP_SECONDS } from '../units';
import type { Closures } from './closures';
import { heightAt, lineBlocked, routeNetwork, standable, type Network } from './network';
import { findRoute, legTime, type Leg, type Route } from './route';

/** A man on his way. */
export interface Going {
  readonly route: Route;
  /** The leg he is on, and how much of it is behind him (0 to 1). */
  readonly leg: number;
  readonly share: number;
  readonly haste: Haste;
  /** Standing aside for the captain: to the left of his line (+1), to the right (-1), or not (0). */
  readonly aside: number;
  /** Seconds he has been held up on this route: queuing, giving way, at a standstill in a crowd, or with no way open. */
  readonly held: number;
  /** No way is open to where he is going: he waits where he is until something is cleared. */
  readonly stuck: boolean;
}

/** What the men on their way go through this step: her heel (rad, + starboard down: her roll now), what is shut, where the captain is (null: nowhere a man meets him), and where the men not on their way stand (they crowd the others). */
export interface Surroundings {
  readonly heel: number;
  readonly closures: Closures;
  readonly captain: Spot | null;
  readonly standing: readonly Spot[];
}

/** Where a man on his way is: his spot, his height (m above her base), the way he is on (null: walking) and how far along it, and the way he faces in plan (along, across). */
export interface Whereabouts extends Spot {
  readonly height: number;
  readonly way: string | null;
  readonly share: number;
  readonly facing: readonly [number, number];
}

/** A man sent from one spot to another, or null where no way is open between them. */
export function startGoing(from: Spot, to: Spot, haste: Haste, heel: number, closures: Closures, net: Network = routeNetwork()): Going | null {
  const route = findRoute(from, to, { heel, haste, closures }, net);
  return route ? { route, leg: 0, share: 0, haste, aside: 0, held: 0, stuck: false } : null;
}

/** The point a share of the way along a line of along, across pairs, and the direction of its piece there. */
function alongLine(line: readonly number[], length: number, share: number): { along: number; across: number; facing: [number, number] } {
  let left = share * length;
  const n = line.length / 2;
  for (let i = 1; i < n; i++) {
    const a0 = line[2 * i - 2]!, x0 = line[2 * i - 1]!, da = line[2 * i]! - a0, dx = line[2 * i + 1]! - x0;
    const piece = Math.sqrt(da * da + dx * dx);
    if (left <= piece || i === n - 1) {
      const t = piece > 0 ? Math.min(1, left / piece) : 0;
      return { along: a0 + t * da, across: x0 + t * dx, facing: piece > 0 ? [da / piece, dx / piece] : [1, 0] };
    }
    left -= piece;
  }
  return { along: line[0]!, across: line[1]!, facing: [1, 0] };
}

/** Where a man on his way is now. */
export function goingAt(g: Going, net: Network = routeNetwork()): Whereabouts {
  const leg = g.route.legs[g.leg];
  if (!leg) {
    const to = g.route.to;
    return { ...to, height: heightAt(net, to), way: null, share: 1, facing: [1, 0] };
  }
  const p = alongLine(leg.line, leg.length, g.share);
  if (leg.way) {
    const space = g.share < 1 / 2 ? leg.space : leg.ends;
    return { space, along: p.along, across: p.across, height: leg.rise[0] + g.share * (leg.rise[1] - leg.rise[0]), way: leg.way, share: g.share, facing: p.facing };
  }
  const along = p.along - g.aside * ASIDE_STEP * p.facing[1], across = p.across + g.aside * ASIDE_STEP * p.facing[0];
  const spot = { space: leg.space, along, across };
  return { ...spot, height: heightAt(net, spot), way: null, share: g.share, facing: p.facing };
}

/** Whether the rest of a route still holds under the closures: no way ahead shut, no walk ahead blocked. */
function stillOpen(g: Going, closures: Closures): boolean {
  const closed = new Set(closures.waysClosed);
  for (let i = g.leg; i < g.route.legs.length; i++) {
    const leg = g.route.legs[i]!;
    // The way he is on he finishes.
    if (leg.way !== null) { if (i > g.leg && closed.has(leg.way)) return false; }
    else if (lineBlocked(leg.space, leg.line, closures.waysBlocked)) return false;
  }
  return true;
}

/** A going brought up to the closures: as it was if its way still holds, else on another way (stuck if there is none). */
function revise(g: Going, s: Surroundings, net: Network): Going {
  const serial = s.closures.waysSerial;
  if (!g.stuck && stillOpen(g, s.closures)) return { ...g, route: { ...g.route, serial } };
  const leg = g.route.legs[g.leg];
  const onWay = leg !== undefined && leg.way !== null;
  // On a way he goes on to its end and looks from there; on a floor, from where he stands.
  const from: Spot = onWay
    ? { space: leg.ends, along: leg.line[leg.line.length - 2]!, across: leg.line[leg.line.length - 1]! }
    : goingAt({ ...g, aside: 0 }, net);
  const found = findRoute(from, g.route.to, { heel: s.heel, haste: g.haste, closures: s.closures }, net);
  if (!found) return { ...g, stuck: true, route: { ...g.route, serial } };
  if (onWay) return { ...g, stuck: false, aside: 0, route: { ...found, from: g.route.from, legs: [leg, ...found.legs] }, leg: 0 };
  return { ...g, stuck: false, aside: 0, route: found, leg: 0, share: 0 };
}

/** Whether j is ahead of i on the same way, going the same way (ties go to the earlier in the list). */
const ahead = (a: Going, i: number, b: Going, j: number): boolean => b.share > a.share || (b.share === a.share && j < i);

/** On a way: the men ahead of him on it within WAY_GAP, going his way, fill it as wide as it is. */
function queued(goings: readonly (Going | null)[], i: number, leg: Leg, share: number): boolean {
  const me = goings[i]!, abreast = WAY_ABREAST[leg.kind] ?? 1;
  let close = 0;
  goings.forEach((o, j) => {
    const l = o && j !== i ? o.route.legs[o.leg] : undefined;
    if (!o || !l || l.way !== leg.way || l.up !== leg.up) return;
    if (ahead({ ...me, share }, i, o, j) && (o.share - share) * leg.length < WAY_GAP) close++;
  });
  return close >= abreast;
}

/** Whether a man may step onto a way: nobody on it coming the other way when it takes one at a time, and room at its start. */
function mayEnter(goings: readonly (Going | null)[], i: number, leg: Leg): boolean {
  const single = (WAY_ABREAST[leg.kind] ?? 1) === 1;
  const against = goings.some((o, j) => {
    const l = o && j !== i ? o.route.legs[o.leg] : undefined;
    return l !== undefined && l.way === leg.way && l.up !== leg.up;
  });
  return !(single && against) && !queued(goings, i, leg, 0);
}

/** How a crowd ahead slows a man: the men within CROWD_RADIUS before him on his floor. */
function crowding(me: Whereabouts, others: readonly (Whereabouts | Spot)[], skip: number): number {
  let n = 0;
  others.forEach((o, j) => {
    if (j === skip || o.space !== me.space) return;
    const da = o.along - me.along, dx = o.across - me.across;
    if (da * da + dx * dx < CROWD_RADIUS * CROWD_RADIUS && da * me.facing[0] + dx * me.facing[1] > 0) n++;
  });
  const density = n / (Math.PI * CROWD_RADIUS * CROWD_RADIUS / 2);
  return Math.max(CROWD_SLOWEST, Math.min(1, 1 - (density - CROWD_FREE) / (CROWD_JAM - CROWD_FREE)));
}

/** Whether a man walking meets the captain: him close ahead on the same floor. Returns the side to stand aside to (+1 left, -1 right, 0 none to step to), or null. */
function giveWay(me: Whereabouts, captain: Spot | null, s: Surroundings, net: Network): number | null {
  if (!captain || captain.space !== me.space) return null;
  const da = captain.along - me.along, dx = captain.across - me.across;
  if (da * da + dx * dx >= ASIDE_RADIUS * ASIDE_RADIUS || da * me.facing[0] + dx * me.facing[1] <= 0) return null;
  // Away from him: to the side of his line the captain is not on.
  const left = me.facing[0] * dx - me.facing[1] * da > 0 ? -1 : 1;
  for (const side of [left, -left]) {
    const spot = { space: me.space, along: me.along - side * ASIDE_STEP * me.facing[1], across: me.across + side * ASIDE_STEP * me.facing[0] };
    if (standable(net, spot, s.closures.waysBlocked)) return side;
  }
  return 0;
}

/**
 * One step of every man on his way. `goings` holds a man's going or null (he is not on his way); the result is the
 * same list moved on, with null for each man who got there, and their places in `arrived`.
 */
export function stepGoings(goings: readonly (Going | null)[], s: Surroundings, dt = STEP_SECONDS, net: Network = routeNetwork()): { goings: (Going | null)[]; arrived: number[] } {
  const where = goings.map((g) => (g ? goingAt(g, net) : null));
  const others: (Whereabouts | Spot)[] = [...where.map((w) => w ?? { space: '', along: 0, across: 0 }), ...s.standing];
  const out: (Going | null)[] = [], entries: Entry[] = [];
  goings.forEach((g0, i) => {
    if (!g0) { out.push(null); return; }
    let g = g0.route.serial === s.closures.waysSerial ? g0 : revise(g0, s, net);
    if (g.stuck) { out.push({ ...g, held: g.held + dt }); return; }
    let leg = g.route.legs[g.leg];
    const me = where[i]!;
    if (leg && leg.way === null && leg.kind === 'walk') {
      const side = giveWay(goingAt({ ...g, aside: 0 }, net), s.captain, s, net);
      if (side !== null) { out.push({ ...g, aside: side, held: g.held + dt }); return; }
    }
    if (g.aside) g = { ...g, aside: 0 };
    let left = dt, share = g.share, index = g.leg, held = g.held, entered: Leg | null = null;
    while (left > 0) {
      if (!leg) break;
      if (leg.way !== null && queued(goings, i, leg, share)) { held += left; break; }
      const time = legTime(leg, s.heel, g.haste, leg.way === null ? crowding(me, others, i) : 1);
      const need = (1 - share) * time;
      if (left < need) { share += left / time; left = 0; break; }
      left -= need;
      const next = g.route.legs[index + 1];
      if (next && next.way !== null && !mayEnter(goings, i, next)) { share = 1; held += left; break; }
      index++;
      share = 0;
      leg = next;
      if (leg && leg.way !== null && !entered) { entered = leg; entries.push({ i, leg, at: index, held: held + left }); }
    }
    out.push(leg ? { ...g, leg: index, share, held } : null);
    // A man who steps onto a way keeps his going as it was before it, in case the way has no room for him this step.
    if (entered) entries[entries.length - 1]!.before = g;
  });
  for (const e of refused(goings, entries)) out[e.i] = { ...e.before!, leg: e.at - 1, share: 1, held: e.held };
  const arrived = out.flatMap((g, i) => (goings[i] && !g ? [i] : []));
  return { goings: out, arrived };
}

/** A man stepping onto a way this step: who, the way's leg and its place in his route, his time held so far, his going before. */
interface Entry {
  readonly i: number;
  readonly leg: Leg;
  readonly at: number;
  readonly held: number;
  before?: Going;
}

/**
 * The men who stepped onto a way in the same step than it had room for: a way takes as many at its start as it is
 * wide, a single-file way men from one end only; the earlier in the list go first.
 */
function refused(goings: readonly (Going | null)[], entries: readonly Entry[]): Entry[] {
  const out: Entry[] = [], ways = new Map<string, Entry[]>();
  for (const e of entries) ways.set(e.leg.way!, [...(ways.get(e.leg.way!) ?? []), e]);
  for (const list of ways.values()) {
    const first = list[0]!.leg, abreast = WAY_ABREAST[first.kind] ?? 1;
    let room = abreast - goings.filter((o) => {
      const l = o?.route.legs[o.leg];
      return l !== undefined && l.way === first.way && l.up === first.up && o!.share * l.length < WAY_GAP;
    }).length;
    for (const e of list) {
      if (e.leg.up !== first.up && abreast === 1) out.push(e);
      else if (room > 0) room--;
      else out.push(e);
    }
  }
  return out;
}
