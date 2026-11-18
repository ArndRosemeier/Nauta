/**
 * A man's route through the ship (pure, N4.2): from where he stands to where he is sent, on the one walk graph,
 * the quickest way under the ship's heel and what is shut (closures.ts). The search gives a `Path`, small plain data
 * that travels in the state with the man going along it (going.ts): his two ends, the corners of the network he
 * passes and the ways he takes, and the blocks the floors were crossed round. The `Route` (a list of legs, each a
 * walk across one floor or surface aloft, or a way taken: a ladder, a door, the shrouds, the climb onto a yard) is
 * built from the path alone (`routeOf`), the same on every machine, and kept in a cache that is not state (N3.7:
 * a state must fit the network's 16 KB).
 */
import { MinHeap } from '@futuremagic/core';
import {
  CROWD_SLOWEST, HEEL_LADDER_HALT, HEEL_LEE_HALT, HEEL_SLOWEST, HEEL_WALK_HALT, HEEL_WEATHER_HALT, PACE, SMART,
  type Haste, type PaceName,
} from '../rules/routes';
import type { Spot } from '../ship/plan';
import type { Block, Closures } from './closures';
import {
  areaOf, crossings, easeAt, heightAt, lineLength, nodeOfSpot, routeNetwork, SURFACE_PACE, walkLine, walkMetres,
  type Network, type Part, type Work,
} from './network';

/** One leg of a route. */
export interface Leg {
  /** The way taken, or null: a walk across one floor (`kind` 'walk') or one surface aloft (`kind` its surface's kind). */
  readonly way: string | null;
  /** The way's kind ('ladder', 'door', 'open', 'shrouds', 'topmast shrouds', 'footrope': the climb onto a yard, 'bowsprit'), 'walk', or a surface's kind ('top', 'crosstrees', 'footrope', 'bowsprit'). */
  readonly kind: string;
  /** The space or surface the leg starts on (a walk is all on it). */
  readonly space: string;
  /** The space or surface it ends on. */
  readonly ends: string;
  /** A way taken from its `from` end to its `to` end (false: the other way); true for a walk. */
  readonly up: boolean;
  /** Its line in plan, along and across pairs, from start to end (a way: its two ends). */
  readonly line: readonly number[];
  /** The heights at its start and end, m above her base. */
  readonly rise: readonly [number, number];
  /** Its length, m (a climb: along its slope). */
  readonly length: number;
  readonly work: Work;
}

/**
 * What a route is built from, plain data: where from, where to, its steps (pairs of a vertex, `END_STEP` for the end
 * or a corner of the network, and the link taken to it, `WALK_STEP` for a walk across a node), the blocks the floors
 * were crossed round, and the closures' serial it was found (or last checked) under.
 */
export interface Path {
  readonly from: Spot;
  readonly to: Spot;
  readonly steps: readonly number[];
  readonly blocks: readonly Block[];
  readonly serial: number;
}
/** A path's step to its end, and a step that walks across a node instead of taking a link. */
export const END_STEP = -1;
export const WALK_STEP = -1;

/** A route: where from, where to, its legs, and the closures' serial it was found under. */
export interface Route {
  readonly from: Spot;
  readonly to: Spot;
  readonly legs: readonly Leg[];
  readonly serial: number;
}

/** What a route is found under: her heel now (rad, + starboard down: her roll), how the man is sent, and what is shut. */
export interface Conditions {
  readonly heel: number;
  readonly haste: Haste;
  readonly closures: Closures;
}

/** What the heel does to a pace on a side of the ship (+1 starboard, -1 larboard, 0 inboard; heel + starboard down). */
export function heelEase(pace: PaceName, side: number, heel: number): number {
  const lean = Math.abs(heel);
  let ease: number;
  if (pace === 'walk' || pace === 'aloft') ease = 1 - (lean / HEEL_WALK_HALT) ** 2;
  else if (pace === 'ladderUp' || pace === 'ladderDown') ease = 1 - lean / HEEL_LADDER_HALT;
  else if (side * heel > 0) ease = 1 - lean / HEEL_LEE_HALT;
  else ease = 1 - lean / HEEL_WEATHER_HALT;
  return Math.max(HEEL_SLOWEST, ease);
}

/** A man's speed over a part, m/s (climbs: m/s of height): his pace, eased by the deckhead, the heel, his haste and a crowd (1: none). */
export function partSpeed(part: Part, side: number, heel: number, haste: Haste, crowd = 1): number {
  const hurry = haste === 'smart' ? SMART[part.pace] : 1;
  return PACE[part.pace] * part.ease * heelEase(part.pace, side, heel) * hurry * Math.max(CROWD_SLOWEST, crowd);
}

/** What a stretch of work takes, s. */
export function workTime(work: Work, heel: number, haste: Haste, crowd = 1): number {
  return work.parts.reduce((t, p) => t + p.amount / partSpeed(p, work.side, heel, haste, crowd), work.fixed);
}

/** A leg's time, s, alone or in a crowd. */
export const legTime = (leg: Leg, heel: number, haste: Haste, crowd = 1): number => workTime(leg.work, heel, haste, crowd);

/** A route's time, s, for a man alone on it. */
export function routeTime(route: Route, heel: number, haste: Haste): number {
  return route.legs.reduce((t, l) => t + legTime(l, heel, haste), 0);
}

const flat = (pts: readonly Spot[]): number[] => pts.flatMap((p) => [p.along, p.across]);

/** The pace across a node: walking a floor, or its surface's kind aloft. */
function nodePace(net: Network, space: string): PaceName {
  const s = net.surfaces.get(space);
  return s ? SURFACE_PACE[s.kind] : 'walk';
}

/** A walk across one node between two spots, as a leg; null if no body gets there. The floor's distance field is laid from `b`, or from `a` if `fromA` (a way's end, whose field is already made). */
function walkLeg(net: Network, node: number, a: Spot, b: Spot, blocks: readonly Block[], fromA: boolean): Leg | null {
  const space = net.graph.nodes[node]!.space;
  const surface = net.surfaces.get(space);
  let pts: Spot[] | null;
  if (surface) pts = [a, b];
  else {
    const area = areaOf(net, node, blocks);
    pts = fromA ? walkLine(area, b, a)?.reverse() ?? null : walkLine(area, a, b);
  }
  if (!pts) return null;
  const length = lineLength(pts), ease = Math.min(easeAt(net, a), easeAt(net, b));
  return {
    way: null, kind: surface ? surface.kind : 'walk', space, ends: space, up: true, line: flat(pts),
    rise: [heightAt(net, a), heightAt(net, b)], length, work: { parts: [{ pace: nodePace(net, space), amount: length, ease }], fixed: 0, side: 0 },
  };
}

/** How long a walk across a node takes, s (Infinity: no way), without drawing its line. */
function walkCost(net: Network, node: number, spot: Spot, portal: number, cond: Conditions): number {
  const space = net.graph.nodes[node]!.space, p = net.portals[portal]!;
  const metres = net.surfaces.has(space)
    ? Math.sqrt((spot.along - p.spot.along) ** 2 + (spot.across - p.spot.across) ** 2)
    : walkMetres(areaOf(net, node, cond.closures.waysBlocked), spot, p.spot);
  if (!Number.isFinite(metres)) return Infinity;
  return walkSeconds(net, space, metres, Math.min(easeAt(net, spot), p.ease), cond);
}

/** How long so many metres across a node take, s. */
function walkSeconds(net: Network, space: string, metres: number, ease: number, cond: Conditions): number {
  if (!Number.isFinite(metres)) return Infinity;
  return metres / partSpeed({ pace: nodePace(net, space), amount: metres, ease }, 0, cond.heel, cond.haste);
}

/** How a vertex of the search was reached: by walking across a node (link -1) or by a way (its link). */
interface Reached { readonly from: number; readonly link: number }

/** Most routes the cache keeps (a crew of two ships has a few hundred on the go at most). */
const ROUTES_KEPT = 4096;
const built = new WeakMap<Path, Route>();
const byText = new Map<string, Route>();

/**
 * The quickest path from one spot to another under the conditions, or null when no way is open between them. Spots
 * are on a floor of the plan or a surface aloft; one a little off the graph (a place by a gun) is reached from the
 * nearest square a body fits (rules: SNAP_REACH).
 */
export function findPath(from: Spot, to: Spot, cond: Conditions, net: Network = routeNetwork()): Path | null {
  const blocks = cond.closures.waysBlocked, closed = new Set(cond.closures.waysClosed);
  const na = nodeOfSpot(net, from, blocks), nb = nodeOfSpot(net, to, blocks);
  if (na < 0 || nb < 0) return null;
  const P = net.portals.length, START = P, END = P + 1;
  const best = new Float64Array(P + 2).fill(Infinity), how: (Reached | null)[] = new Array(P + 2).fill(null);
  const heap = new MinHeap();
  const relax = (v: number, t: number, r: Reached) => { if (t < best[v]!) { best[v] = t; how[v] = r; heap.push(t, v); } };
  best[START] = 0;
  heap.push(0, START);
  while (heap.size) {
    const u = heap.pop(), t = heap.lastPriority;
    if (t > best[u]!) continue;
    if (u === END) break;
    const node = u === START ? na : net.portals[u]!.node;
    if (u === START && na === nb) {
      const direct = walkLeg(net, na, from, to, blocks, false);
      if (direct) relax(END, workTime(direct.work, cond.heel, cond.haste), { from: START, link: WALK_STEP });
    }
    const ends = net.portalsOf[node]!;
    if (u === START) {
      for (const p of ends) relax(p, walkCost(net, node, from, p, cond), { from: u, link: WALK_STEP });
      continue;
    }
    const here = net.portals[u]!, across = crossings(net, node, blocks), space = net.graph.nodes[node]!.space;
    for (const p of ends) {
      if (p !== u) relax(p, t + walkSeconds(net, space, across[here.place * ends.length + net.portals[p]!.place]!, Math.min(here.ease, net.portals[p]!.ease), cond), { from: u, link: WALK_STEP });
    }
    if (node === nb) relax(END, t + walkCost(net, node, to, u, cond), { from: u, link: WALK_STEP });
    for (const li of net.linksFrom[u]!) {
      const l = net.links[li]!;
      if (!closed.has(l.way)) relax(l.to, t + workTime(l.work, cond.heel, cond.haste), { from: u, link: li });
    }
  }
  if (!Number.isFinite(best[END]!)) return null;
  // Back from the end: the vertices in order, each with the link taken to it.
  const steps: number[] = [];
  for (let v = END; v !== START;) { const r = how[v]!; steps.unshift(v === END ? END_STEP : v, r.link); v = r.from; }
  const path = { from: { ...from }, to: { ...to }, steps, blocks: blocks.map((k) => ({ ...k })), serial: cond.closures.waysSerial };
  const legs = buildLegs(path, net);
  if (!legs) return null;
  built.set(path, { from: path.from, to: path.to, legs, serial: path.serial });
  return path;
}

/** A path's legs, or null where a floor it crosses no longer lets a body through (a path is only ever built as found, so never in play). */
function buildLegs(path: Path, net: Network): Leg[] | null {
  const { from, to, steps, blocks } = path, na = nodeOfSpot(net, from, blocks);
  const legs: Leg[] = [];
  let prev = END_STEP;
  for (let k = 0; k < steps.length; k += 2) {
    const v = steps[k]!, link = steps[k + 1]!;
    const atStart = k === 0;
    if (link !== WALK_STEP) { legs.push(wayLeg(net, link)); prev = v; continue; }
    const a = atStart ? from : net.portals[prev]!.spot, b = v === END_STEP ? to : net.portals[v]!.spot;
    prev = v;
    if (a.space === b.space && a.along === b.along && a.across === b.across) continue;
    const node = atStart ? na : net.portals[steps[k - 2]!]!.node;
    const leg = walkLeg(net, node, a, b, blocks, v === END_STEP && !(atStart && v === END_STEP));
    if (!leg) return null;
    const last = legs[legs.length - 1];
    // Past a way's end without taking it: one walk on.
    if (last && last.way === null && leg.way === null && last.space === leg.space) legs[legs.length - 1] = joinWalks(last, leg);
    else if (leg.length > 0) legs.push(leg);
  }
  return legs;
}

/** The route a path comes to: built from the path alone (cached, not state), so every machine has the same legs. */
export function routeOf(path: Path, net: Network = routeNetwork()): Route {
  const known = built.get(path);
  if (known) return known;
  const text = JSON.stringify(path);
  let route = byText.get(text);
  if (!route) {
    route = { from: path.from, to: path.to, legs: buildLegs(path, net) ?? [], serial: path.serial };
    if (byText.size >= ROUTES_KEPT) byText.clear();
    byText.set(text, route);
  }
  built.set(path, route);
  return route;
}

/** The quickest route from one spot to another under the conditions, or null when no way is open between them (`findPath`, built). */
export function findRoute(from: Spot, to: Spot, cond: Conditions, net: Network = routeNetwork()): Route | null {
  const path = findPath(from, to, cond, net);
  return path ? routeOf(path, net) : null;
}

/** The link a way's leg takes (its place in the network's links). */
export function linkOf(leg: Leg, net: Network = routeNetwork()): number {
  return net.links.findIndex((l) => l.way === leg.way && l.up === leg.up);
}

/** Two walks across one node, one after the other, as one. */
function joinWalks(a: Leg, b: Leg): Leg {
  const length = a.length + b.length, pa = a.work.parts[0]!, pb = b.work.parts[0]!;
  return { ...a, line: [...a.line, ...b.line.slice(2)], rise: [a.rise[0], b.rise[1]], length, work: { ...a.work, parts: [{ pace: pa.pace, amount: length, ease: Math.min(pa.ease, pb.ease) }] } };
}

/** A way taken, as a leg. */
function wayLeg(net: Network, li: number): Leg {
  const l = net.links[li]!, a = net.portals[l.from]!, b = net.portals[l.to]!;
  return {
    way: l.way, kind: l.kind, space: a.spot.space, ends: b.spot.space, up: l.up, line: [a.spot.along, a.spot.across, b.spot.along, b.spot.across],
    rise: [a.height, b.height], length: l.length, work: l.work,
  };
}
