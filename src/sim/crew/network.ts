/**
 * The crew's way network (pure, N4.2), built once on the one walk graph of decks and rig (N2.1, N3.2: `rigWalk`), so
 * where a man can go the captain can go (ship.md, "Every space navigable"). Its corners are the ends of every way the
 * graph keeps (ladders, doors, open joins, shrouds, the climbs onto the yards and the bowsprit): a man crosses a node
 * of the graph from one way's end to another's and takes the way. How far it is across a floor comes from a distance
 * field per way end, laid over the node's squares of the walk graph's own grid, so men walk round what stands on the
 * deck as the captain must. Blocks (closures.ts) take squares out of a node and the fields under them are worked out
 * again, once per set of blocks; a block across a whole deck splits it, and men find the way round below.
 *
 * Everything here is a cache of a pure function of the plan and the closures: no state, nothing sent.
 */
import { MinHeap } from '@futuremagic/core';
import { CROUCH, DOOR_PASS, SNAP_REACH, STOOP, type PaceName } from '../rules/routes';
import { BODY, DOOR, LEAST_PASSAGE } from '../rules/ships';
import type { AloftSurface, AloftWay } from '../ship/aloft';
import { floorAt, overheadAt, shipPlan, type Space, type Spot, type Way } from '../ship/plan';
import { rigPlan, rigWalk } from '../ship/rig';
import { WALK_CELL, type FloorGrid, type WalkGraph } from '../ship/walk';
import type { Block } from './closures';

/** A stretch of a man's going: so many metres (climbs: metres of height) at a pace, eased by a low deckhead (1: upright). */
export interface Part {
  readonly pace: PaceName;
  readonly amount: number;
  readonly ease: number;
}

/** What a stretch takes: its parts, seconds that do not hang on pace (a door), and the ship's side it is on for the heel (+1 starboard, -1 larboard, 0 inboard). */
export interface Work {
  readonly parts: readonly Part[];
  readonly fixed: number;
  readonly side: number;
}

/** An end of a way: where a body stands to take it, on a node of the graph. */
export interface Portal {
  readonly index: number;
  readonly node: number;
  readonly spot: Spot;
  readonly height: number;
  /** How the deckhead over it eases a man's pace. */
  readonly ease: number;
  /** Its place among its node's portals (`portalsOf`). */
  readonly place: number;
}

/** A way taken from one of its ends to the other. */
export interface Link {
  readonly from: number;
  readonly to: number;
  readonly way: string;
  readonly kind: Way['kind'] | AloftWay['kind'];
  /** Taken from the way's `from` end to its `to` end. */
  readonly up: boolean;
  /** Its length from end to end, m (a climb: along the slope). */
  readonly length: number;
  readonly work: Work;
}

export interface Network {
  readonly graph: WalkGraph;
  readonly portals: readonly Portal[];
  readonly links: readonly Link[];
  /** For each portal, the links that start there. */
  readonly linksFrom: readonly (readonly number[])[];
  /** For each node, the portals on it. */
  readonly portalsOf: readonly (readonly number[])[];
  /** The surfaces aloft by id; a node that is none of them is a floor of the grid. */
  readonly surfaces: ReadonlyMap<string, AloftSurface>;
}

/** The pace across a surface aloft, by its kind. */
export const SURFACE_PACE: Readonly<Record<AloftSurface['kind'], PaceName>> = { top: 'aloft', crosstrees: 'aloft', footrope: 'sidle', bowsprit: 'spar' };

/** How far a body's middle keeps from a block's edge, m: its footprint, as the walk graph erodes the floor (walk.ts). */
const CLEAR = Math.max(BODY.breadth, LEAST_PASSAGE) / 2;
/** The grid's square, read once (an imported binding is a lookup each time it is read). */
const CELL = WALK_CELL;
const DIAGONAL = CELL * Math.SQRT2;
/** The squares within SNAP_REACH, searched for the nearest a body fits. */
const SNAP_CELLS = Math.ceil(SNAP_REACH / CELL);
/** Sample a straight line across the grid this often, m. */
const SIGHT_STEP = CELL / 2;

let built: Network | null = null;

/** A spot alone (a crew place or a station carries more). */
const plainSpot = ({ space, along, across }: Spot): Spot => ({ space, along, across });

const distance = (a: Spot, b: Spot): number => Math.sqrt((a.along - b.along) ** 2 + (a.across - b.across) ** 2);

/** How much a deckhead of this height eases a man's pace (rules: STOOP, CROUCH). */
export function headroomEase(headroom: number): number {
  if (headroom >= BODY.height) return 1;
  const t = Math.max(0, Math.min(1, (headroom - BODY.leastHeadroom) / (BODY.height - BODY.leastHeadroom)));
  return CROUCH + (STOOP - CROUCH) * t;
}

/** The surface aloft a spot is on, or undefined: it is on a floor. */
export const surfaceOf = (net: Network, space: string): AloftSurface | undefined => net.surfaces.get(space);

/** Where a spot on a surface aloft lies along its line (0 at its first point), and the height there. */
function alongSurface(s: AloftSurface, spot: Spot): { t: number; height: number } {
  const [a, b] = s.points;
  if (s.kind === 'top' || s.kind === 'crosstrees' || !b) return { t: 0, height: a!.height };
  const da = b.along - a!.along, dx = b.across - a!.across, len2 = da * da + dx * dx;
  const t = Math.max(0, Math.min(1, ((spot.along - a!.along) * da + (spot.across - a!.across) * dx) / len2));
  return { t, height: a!.height + t * (b.height - a!.height) };
}

/** The height a man stands at on a spot, m above her base. */
export function heightAt(net: Network, spot: Spot): number {
  const s = net.surfaces.get(spot.space);
  if (s) return alongSurface(s, spot).height;
  const g = net.graph.grids.get(spot.space)!;
  return floorAt(g.space, spot.along, spot.across);
}

/** How the deckhead over a spot eases a man's pace (1 under the sky and aloft). */
export function easeAt(net: Network, spot: Spot): number {
  if (net.surfaces.has(spot.space)) return 1;
  const g = net.graph.grids.get(spot.space)!;
  return headroomEase(overheadAt(g.space, spot.along, spot.across) - floorAt(g.space, spot.along, spot.across));
}

/** What a way takes from one end to the other. */
function wayWork(net: Network, w: Way | AloftWay, up: boolean, hFrom: number, hTo: number): { work: Work; length: number } {
  const [a, b] = up ? [w.from, w.to] : [w.to, w.from];
  const flat = distance(a, b), rise = up ? hTo - hFrom : hFrom - hTo;
  const length = Math.sqrt(flat * flat + rise * rise);
  if ('steps' in w) {
    if (w.kind === 'ladder') return { work: { parts: [{ pace: rise > 0 ? 'ladderUp' : 'ladderDown', amount: w.rise * w.steps, ease: 1 }], fixed: 0, side: 0 }, length };
    const ease = w.kind === 'door' ? headroomEase(DOOR.height) : Math.min(easeAt(net, a), easeAt(net, b));
    return { work: { parts: [{ pace: 'walk', amount: flat, ease }], fixed: w.kind === 'door' ? DOOR_PASS : 0, side: 0 }, length };
  }
  const climbing = rise > 0;
  if (!w.ladders.length) {
    // Onto the bowsprit over the knightheads, or down onto the jib-boom's horses: along the spar and the step up or down.
    return { work: { parts: [{ pace: 'spar', amount: flat, ease: 1 }, { pace: climbing ? 'ratlinesUp' : 'ratlinesDown', amount: Math.abs(rise), ease: 1 }], fixed: 0, side: 0 }, length };
  }
  // A ladder leaning out over the climber (the futtock shrouds) is the overhang; the rest of the height is ratlines.
  const overhang = Math.min(Math.abs(rise), w.ladders.reduce((t, l) => t + ((l.lean ?? 0) < 0 ? l.floor - l.lo : 0), 0));
  const side = Math.sign(w.kind === 'shrouds' ? w.from.across : w.to.across);
  const parts: Part[] = [{ pace: climbing ? 'ratlinesUp' : 'ratlinesDown', amount: Math.abs(rise) - overhang, ease: 1 }];
  if (overhang > 0) parts.push({ pace: climbing ? 'overhangUp' : 'overhangDown', amount: overhang, ease: 1 });
  return { work: { parts, fixed: 0, side }, length };
}

/** The crew's way network on the brig's one walk graph, built once and frozen. */
export function routeNetwork(): Network {
  if (built) return built;
  const plan = shipPlan(), rig = rigPlan(plan), graph = rigWalk(plan);
  const ways = new Map<string, Way | AloftWay>([...plan.ways.map((w) => [w.id, w] as const), ...rig.ways.map((w) => [w.id, w] as const)]);
  const surfaces = new Map(rig.surfaces.map((s) => [s.id, s]));
  const portals: Portal[] = [], links: Link[] = [];
  const partial = { graph, portals, links, linksFrom: [], portalsOf: [], surfaces } as Network;
  const portal = (node: number, spot: Spot): number => {
    const place = portals.filter((p) => p.node === node).length;
    portals.push({ index: portals.length, node, spot: plainSpot(spot), height: heightAt(partial, spot), ease: easeAt(partial, spot), place });
    return portals.length - 1;
  };
  for (const e of graph.edges) {
    const w = ways.get(e.way)!;
    const pa = portal(e.a, w.from), pb = portal(e.b, w.to);
    const ha = portals[pa]!.height, hb = portals[pb]!.height;
    for (const up of [true, false]) {
      const { work, length } = wayWork(partial, w, up, ha, hb);
      links.push({ from: up ? pa : pb, to: up ? pb : pa, way: w.id, kind: w.kind, up, length, work });
    }
  }
  const linksFrom = portals.map((p) => links.flatMap((l, i) => (l.from === p.index ? [i] : [])));
  const portalsOf = graph.nodes.map((n) => portals.flatMap((p) => (p.node === n.index ? [p.index] : [])));
  built = { graph, portals, links, linksFrom, portalsOf, surfaces };
  return built;
}

// --- Floors: squares, blocks, distance fields ---------------------------------------------------------------------

/** A node's floor under some blocks: which squares of its space's grid a body's middle may be on. */
export interface Area {
  readonly node: number;
  readonly grid: FloorGrid;
  readonly mask: Uint8Array;
  /** For each square of the grid, its place among the area's free squares (-1: not free); and how many are free. */
  readonly slot: Int32Array;
  readonly count: number;
  /** The node and the blocks it was made under, as a key. */
  readonly id: string;
}

/** Whether a block keeps a body's middle off a place: the block and the body's footprint round it. */
const keptOut = (b: Block, along: number, across: number): boolean =>
  along > b.aft - CLEAR && along < b.fore + CLEAR && across > b.port - CLEAR && across < b.starboard + CLEAR;

/** The blocks that lie on a space, as a key. */
function blocksOn(space: string, blocks: readonly Block[]): { on: Block[]; key: string } {
  const on = blocks.filter((b) => b.space === space);
  return { on, key: on.map((b) => `${b.id}:${b.aft},${b.fore},${b.port},${b.starboard}`).join('|') };
}

/** A bounded cache: the oldest entry goes first, an entry used again counts as new. */
function cached<T>(store: Map<string, T>, id: string, most: number, make: () => T): T {
  const found = store.get(id);
  if (found !== undefined) { store.delete(id); store.set(id, found); return found; }
  const made = make();
  if (store.size >= most) store.delete(store.keys().next().value!);
  store.set(id, made);
  return made;
}

const areas = new Map<string, Area>();
/** How many areas are kept: a few sets of blocks per node. */
const KEPT_AREAS = 128;

/** A node's floor under the blocks (cached per node and set of blocks on its space). */
export function areaOf(net: Network, node: number, blocks: readonly Block[]): Area {
  const space = net.graph.nodes[node]!.space, grid = net.graph.grids.get(space)!;
  const { on, key } = blocksOn(space, blocks);
  const id = `${node}#${key}`;
  return cached(areas, id, KEPT_AREAS, () => {
    const mask = new Uint8Array(grid.cols * grid.rows);
    for (let k = 0; k < mask.length; k++) mask[k] = grid.node[k] === node ? 1 : 0;
    for (let k = 0; k < mask.length; k++) {
      if (!mask[k]) continue;
      const p = squareSpot(grid, k);
      if (on.some((b) => keptOut(b, p.along, p.across))) mask[k] = 0;
    }
    const slot = new Int32Array(mask.length).fill(-1);
    let count = 0;
    for (let k = 0; k < mask.length; k++) if (mask[k]) slot[k] = count++;
    return { node, grid, mask, slot, count, id };
  });
}

/** A square's middle in plan. */
const squareSpot = (g: FloorGrid, k: number): Spot => ({ space: g.space.id, along: g.space.aft + (Math.floor(k / g.rows) + 1 / 2) * CELL, across: g.space.port + ((k % g.rows) + 1 / 2) * CELL });

/** The square a spot stands on in an area, or the nearest within SNAP_REACH a body fits on; -1 if none. */
export function squareAt(area: Area, spot: Spot): number {
  const g = area.grid;
  const c0 = Math.floor((spot.along - g.space.aft) / CELL), r0 = Math.floor((spot.across - g.space.port) / CELL);
  if (c0 >= 0 && c0 < g.cols && r0 >= 0 && r0 < g.rows && area.mask[c0 * g.rows + r0]) return c0 * g.rows + r0;
  let best = -1, bestD = SNAP_REACH;
  for (let c = c0 - SNAP_CELLS; c <= c0 + SNAP_CELLS; c++) {
    if (c < 0 || c >= g.cols) continue;
    for (let r = r0 - SNAP_CELLS; r <= r0 + SNAP_CELLS; r++) {
      if (r < 0 || r >= g.rows || !area.mask[c * g.rows + r]) continue;
      const d = distance(spot, squareSpot(g, c * g.rows + r));
      if (d < bestD) { bestD = d; best = c * g.rows + r; }
    }
  }
  return best;
}

/** The eight steps from a square, (dc, dr), the straight ones first. */
const STEPS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** The squares a body steps to from square k, written into `out` with their costs: straight, or diagonal where both squares beside the diagonal are free (no corner is cut). Returns how many. */
function stepsFrom(area: Area, k: number, out: Int32Array, cost: Float64Array): number {
  const g = area.grid, rows = g.rows, cols = g.cols, c = (k / rows) | 0, r = k - c * rows, m = area.mask;
  let n = 0;
  for (let i = 0; i < STEPS.length; i++) {
    const dc = STEPS[i]![0], dr = STEPS[i]![1], nc = c + dc, nr = r + dr;
    if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || !m[nc * rows + nr]) continue;
    if (dc && dr && !(m[nc * rows + r] && m[c * rows + nr])) continue;
    out[n] = nc * rows + nr;
    cost[n++] = dc && dr ? DIAGONAL : CELL;
  }
  return n;
}
/** Scratch for `steps`: at most eight. */
const NEXT = new Int32Array(STEPS.length), NEXT_COST = new Float64Array(STEPS.length);

/** A distance field over an area: m from each free square (by its slot) to a square, the source. */
export interface Field {
  readonly dist: Float32Array;
  readonly source: number;
}

const fields = new Map<string, Field>();
/**
 * How many fields are kept. A field is made the first time a man walks to (or from) a square of a floor, about a
 * millisecond on the deck, and kept: men go to the same places again and again (their guns, pins, stations, the
 * ladders' ends), so after the first orders nearly every walk is a look-up. 50 KB each on the deck.
 */
const KEPT_FIELDS = 600;

/** The distance field to a square across an area (cached). */
export function floorField(area: Area, source: number): Field {
  return cached(fields, `${area.id}@${source}`, KEPT_FIELDS, () => {
    const dist = new Float32Array(area.count).fill(Infinity), slot = area.slot;
    const heap = new MinHeap();
    dist[slot[source]!] = 0;
    heap.push(0, source);
    while (heap.size) {
      const k = heap.pop(), d = heap.lastPriority;
      if (d > dist[slot[k]!]!) continue;
      const count = stepsFrom(area, k, NEXT, NEXT_COST);
      for (let i = 0; i < count; i++) {
        const n = NEXT[i]!, t = Math.fround(d + NEXT_COST[i]!);
        if (t < dist[slot[n]!]!) { dist[slot[n]!] = t; heap.push(t, n); }
      }
    }
    return { dist, source };
  });
}

/** How far a man walks across one floor from a spot to another, m (Infinity: he cannot). */
export function walkMetres(area: Area, a: Spot, b: Spot): number {
  const ka = squareAt(area, a), kb = squareAt(area, b);
  if (ka < 0 || kb < 0) return Infinity;
  return floorField(area, kb).dist[area.slot[ka]!]! + distance(a, squareSpot(area.grid, ka)) + distance(b, squareSpot(area.grid, kb));
}

const crossed = new Map<string, Float64Array>();

/** The metres walked between every two way ends on a node under the blocks: row a, column b by their `place` (cached). */
export function crossings(net: Network, node: number, blocks: readonly Block[]): Float64Array {
  const ends = net.portalsOf[node]!.map((i) => net.portals[i]!), n = ends.length;
  const aloft = net.surfaces.has(net.graph.nodes[node]!.space);
  const area = aloft ? null : areaOf(net, node, blocks);
  return cached(crossed, area ? area.id : `${node}#aloft`, KEPT_AREAS, () => {
    const out = new Float64Array(n * n);
    for (let a = 0; a < n; a++) {
      for (let b = 0; b < n; b++) out[a * n + b] = a === b ? 0 : area ? walkMetres(area, ends[a]!.spot, ends[b]!.spot) : distance(ends[a]!.spot, ends[b]!.spot);
    }
    return out;
  });
}

/** Whether a straight line between two spots on an area's floor keeps to squares a body fits on. */
function inSight(area: Area, a: Spot, b: Spot): boolean {
  const g = area.grid, n = Math.ceil(distance(a, b) / SIGHT_STEP);
  for (let i = 1; i < n; i++) {
    const along = a.along + (b.along - a.along) * i / n, across = a.across + (b.across - a.across) * i / n;
    const c = Math.floor((along - g.space.aft) / CELL), r = Math.floor((across - g.space.port) / CELL);
    if (c < 0 || c >= g.cols || r < 0 || r >= g.rows || !area.mask[c * g.rows + r]) return false;
  }
  return true;
}

/** A chain of squares pulled tight: only the corners where the straight line is lost are kept. */
function pullTight(area: Area, chain: readonly number[]): Spot[] {
  // Only where the chain turns can a corner be kept: the squares between are on one straight line.
  const turns = chain.filter((k, i) => i === 0 || i === chain.length - 1 || k - chain[i - 1]! !== chain[i + 1]! - k);
  const pts = turns.map((k) => squareSpot(area.grid, k));
  if (pts.length <= 2) return pts;
  const out = [pts[0]!];
  let anchor = 0;
  for (let i = 2; i < pts.length; i++) {
    if (!inSight(area, pts[anchor]!, pts[i]!)) { anchor = i - 1; out.push(pts[anchor]!); }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** The squares from a square down a field to its source. */
function downField(area: Area, field: Field, from: number): number[] {
  const chain = [from], slot = area.slot;
  let k = from;
  while (k !== field.source) {
    // The step that keeps to the shortest way: the neighbour nearer the source by the least total.
    let best = -1, bestTotal = Infinity;
    const here = field.dist[slot[k]!]!;
    const count = stepsFrom(area, k, NEXT, NEXT_COST);
    for (let i = 0; i < count; i++) {
      const d = field.dist[slot[NEXT[i]!]!]!;
      if (d < here && d + NEXT_COST[i]! < bestTotal) { bestTotal = d + NEXT_COST[i]!; best = NEXT[i]!; }
    }
    if (best < 0) break;
    chain.push(best);
    k = best;
  }
  return chain;
}

/** The line walked across one floor from a spot to another, pulled tight (first point the one spot, last the other), or null where no body gets there. */
export function walkLine(area: Area, a: Spot, b: Spot): Spot[] | null {
  const ka = squareAt(area, a), kb = squareAt(area, b);
  if (ka < 0 || kb < 0) return null;
  const field = floorField(area, kb);
  if (!Number.isFinite(field.dist[area.slot[ka]!]!)) return null;
  const pts = inSight(area, squareSpot(area.grid, ka), squareSpot(area.grid, kb)) ? [a, b] : pullTight(area, downField(area, field, ka));
  pts[0] = a;
  pts[pts.length - 1] = b;
  return pts;
}

/** The length of a line of spots, m. */
export function lineLength(pts: readonly Spot[]): number {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += distance(pts[i - 1]!, pts[i]!);
  return t;
}

/** Whether a body may stand at a spot of a floor under the blocks (aloft: on any surface). */
export function standable(net: Network, spot: Spot, blocks: readonly Block[]): boolean {
  if (net.surfaces.has(spot.space)) return true;
  const g = net.graph.grids.get(spot.space);
  if (!g) return false;
  const c = Math.floor((spot.along - g.space.aft) / CELL), r = Math.floor((spot.across - g.space.port) / CELL);
  if (c < 0 || c >= g.cols || r < 0 || r >= g.rows) return false;
  const node = g.node[c * g.rows + r]!;
  return node >= 0 && areaOf(net, node, blocks).mask[c * g.rows + r] === 1;
}

/** Whether a line of along, across pairs on a space passes where a block keeps a body's middle out. */
export function lineBlocked(space: string, line: readonly number[], blocks: readonly Block[]): boolean {
  const on = blocks.filter((b) => b.space === space);
  if (!on.length) return false;
  const blocked = (along: number, across: number) => on.some((b) => keptOut(b, along, across));
  for (let i = 2; i < line.length; i += 2) {
    const a0 = line[i - 2]!, x0 = line[i - 1]!, da = line[i]! - a0, dx = line[i + 1]! - x0;
    const n = Math.max(1, Math.ceil(Math.sqrt(da * da + dx * dx) / SIGHT_STEP));
    for (let k = 0; k <= n; k++) if (blocked(a0 + da * k / n, x0 + dx * k / n)) return true;
  }
  return false;
}

/** The node a spot is on, taking it to the nearest square a body fits within SNAP_REACH; -1 if none. */
export function nodeOfSpot(net: Network, spot: Spot, blocks: readonly Block[]): number {
  const aloft = net.graph.aloft.get(spot.space);
  if (aloft !== undefined) return aloft;
  const g = net.graph.grids.get(spot.space);
  if (!g) return -1;
  // The node under the spot or under the nearest kept square: try each node of the space.
  const nodes = net.graph.nodes.filter((n) => n.space === spot.space);
  let best = -1, bestD = Infinity;
  for (const n of nodes) {
    const area = areaOf(net, n.index, blocks), k = squareAt(area, spot);
    if (k < 0) continue;
    const d = distance(spot, squareSpot(g, k));
    if (d < bestD) { bestD = d; best = n.index; }
  }
  return best;
}

/** The space a spot of a floor is in (for its level and its deckhead). */
export const spaceOf = (net: Network, id: string): Space | undefined => net.graph.grids.get(id)?.space;
