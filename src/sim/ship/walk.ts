/**
 * The one walk graph (pure, N2.1): every place a body can stand in her plan and every way between them, for a body
 * of a given size. The captain's walker (N2.3) and the crew's routes (N4.2) read this one graph, so where a man can
 * go the captain can go (ship.md, "Every space navigable").
 *
 * **How it is found.** Each space's floor is laid out as a grid of small squares. A square is free where a body can
 * stand: inside her sides at its feet and shoulders, under enough headroom, and clear of everything standing on that
 * level (fittings, masts, coamings, guns). A body is not a point, so a square is kept only if every square within
 * half the least passage of it is free too, on a floor within a step of its own; what remains is where the body's
 * middle can be. The kept squares that touch, on floors within a step of each other, form the graph's nodes (a space split in two by something in its way gives two nodes), and its ladders and
 * doors are the edges, where they fit the body.
 */
import { BODY, LEAST_HATCH, LEAST_PASSAGE, LADDER } from '../rules/ships';
import { floorAt, headroomAt, insideBreadth, type Obstacle, type ShipPlan, type Space, type Spot, type Way } from './plan';
import { openLeaves } from './doors';

/** The body a graph is made for (rules: BODY). */
export interface Body {
  readonly height: number;
  readonly breadth: number;
  readonly leastHeadroom: number;
  readonly stepUp: number;
}

/** The side of a square of the floor grids, m. */
export const WALK_CELL = 0.1;
/** Where her side is felt by a body: at its feet and at its shoulders, as shares of its height. */
const FEET = 0.05;
const SHOULDERS = 0.8;

/** A space's floor as squares: which are free for a body's middle and which node each belongs to (-1: none). */
export interface FloorGrid {
  readonly space: Space;
  readonly cols: number;
  readonly rows: number;
  /** For each square: the index of its node in the graph, or -1 where a body cannot stand. */
  readonly node: Int32Array;
  /** How many squares were free before the body's size was taken off (where feet may stand at all). */
  readonly open: number;
}

/** A node of the graph: a stretch of one space's floor a body moves freely over. */
export interface WalkNode {
  readonly index: number;
  readonly space: string;
  /** Its area, m² (of the squares a body's middle can reach). */
  readonly area: number;
}

/** An edge of the graph: a way that fits the body, between the nodes its two ends stand on. */
export interface WalkEdge {
  readonly way: string;
  readonly a: number;
  readonly b: number;
}

export interface WalkGraph {
  readonly body: Body;
  readonly grids: ReadonlyMap<string, FloorGrid>;
  readonly nodes: readonly WalkNode[];
  readonly edges: readonly WalkEdge[];
  /** Ways that do not fit the body, or whose ends stand nowhere, with the reason. */
  readonly refused: readonly { readonly way: string; readonly why: string }[];
  /** The surfaces aloft joined to the graph (aloft.ts#walkAloft) and the node each is: a top, the crosstrees, a footrope, the bowsprit. */
  readonly aloft: ReadonlyMap<string, number>;
}

/** The square's middle of column c and row r of a grid. */
const alongOf = (s: Space, c: number) => s.aft + (c + 1 / 2) * WALK_CELL;
const acrossOf = (s: Space, r: number) => s.port + (r + 1 / 2) * WALK_CELL;

/** What stands on a space's level: the plan's obstacles, and her doors' leaves where they stand open (doors.ts). */
const blocksOn = (plan: ShipPlan, space: Space): readonly Obstacle[] => [...plan.obstacles, ...openLeaves(plan)].filter((o) => o.level === space.level);

/** Whether a body may stand at a place just beyond a space's edge: inside her sides there, under headroom, clear of what stands on the level. */
function outsideOpen(plan: ShipPlan, space: Space, body: Body, along: number, across: number): boolean {
  return squareOpen(plan, blocksOn(plan, space), space, body, along, across);
}

/** Whether a body's feet may stand at a place of a space's floor. */
function squareOpen(plan: ShipPlan, blocks: readonly Obstacle[], space: Space, body: Body, along: number, across: number): boolean {
  const floor = floorAt(space, along, across);
  const headroom = headroomAt(plan, space, along, across);
  if (headroom < body.leastHeadroom) return false;
  const shoulders = floor + Math.min(body.height * SHOULDERS, headroom);
  const inside = Math.min(insideBreadth(along, floor + body.height * FEET), insideBreadth(along, shoulders));
  if (Math.abs(across) > inside) return false;
  return !blocks.some((o) => along > o.aft && along < o.fore && across > o.port && across < o.starboard);
}

/** Where a body's feet may stand on a space's floor: inside her sides, under headroom, clear of what stands on the level. */
function openSquares(plan: ShipPlan, space: Space, body: Body, cols: number, rows: number): Uint8Array {
  const open = new Uint8Array(cols * rows);
  const blocks = blocksOn(plan, space);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) open[c * rows + r] = squareOpen(plan, blocks, space, body, alongOf(space, c), acrossOf(space, r)) ? 1 : 0;
  }
  return open;
}

/** The squares within a radius (in squares) of a square: the body's footprint. */
function disk(radius: number): [number, number][] {
  const out: [number, number][] = [];
  const n = Math.ceil(radius);
  for (let dc = -n; dc <= n; dc++) for (let dr = -n; dr <= n; dr++) if (dc * dc + dr * dr <= radius * radius) out.push([dc, dr]);
  return out;
}

/** A space's floor grid for a body; its nodes are numbered from `first`. Returns the grid and its nodes' areas. */
function floorGrid(plan: ShipPlan, space: Space, body: Body, first: number): { grid: FloorGrid; areas: number[] } {
  const cols = Math.max(1, Math.round((space.fore - space.aft) / WALK_CELL));
  // A full-width space reaches past her sides; its grid only needs her breadth.
  const rows = Math.max(1, Math.round((space.starboard - space.port) / WALK_CELL));
  const open = openSquares(plan, space, body, cols, rows);
  const foot = disk(Math.max(body.breadth, LEAST_PASSAGE) / 2 / WALK_CELL);
  // Beyond the grid's edge is floor too, unless a bulkhead stands there (her side is already in `open`).
  const walls = plan.bulkheads.filter((b) => b.between.includes(space.id));
  const walled = (c: number, r: number): boolean => {
    const along = alongOf(space, c), across = acrossOf(space, r);
    return walls.some((w) => w.athwart
      ? (along < space.aft ? w.at === space.aft : along > space.fore ? w.at === space.fore : false) && across >= w.from && across <= w.to
      : (across < space.port ? w.at === space.port : across > space.starboard ? w.at === space.starboard : false) && along >= w.from && along <= w.to);
  };
  // Each square's floor: where it steps by more than a body steps up (the breaks of her raised decks, N2.12), the floor
  // is two, and a body's middle keeps its footprint's breadth from the edge, on whichever side it stands.
  const floor = new Float64Array(cols * rows);
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) floor[c * rows + r] = floorAt(space, alongOf(space, c), acrossOf(space, r));
  const kept = new Uint8Array(cols * rows);
  let openCount = 0;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (!open[c * rows + r]) continue;
      openCount++;
      const here = floor[c * rows + r]!;
      kept[c * rows + r] = foot.every(([dc, dr]) => {
        const cc = c + dc, rr = r + dr;
        if (cc >= 0 && cc < cols && rr >= 0 && rr < rows) return open[cc * rows + rr] === 1 && Math.abs(floor[cc * rows + rr]! - here) <= body.stepUp;
        return !walled(cc, rr) && outsideOpen(plan, space, body, alongOf(space, cc), acrossOf(space, rr));
      }) ? 1 : 0;
    }
  }
  // Squares that touch (edge to edge) form one node.
  const node = new Int32Array(cols * rows).fill(-1), areas: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < cols * rows; i++) {
    if (!kept[i] || node[i] !== -1) continue;
    const id = first + areas.length;
    let count = 0;
    node[i] = id;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop()!, c = Math.floor(j / rows), r = j % rows;
      count++;
      for (const [nc, nr] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]] as const) {
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const k = nc * rows + nr;
        if (kept[k] && node[k] === -1 && Math.abs(floor[k]! - floor[j]!) <= body.stepUp) { node[k] = id; stack.push(k); }
      }
    }
    areas.push(count * WALK_CELL * WALK_CELL);
  }
  return { grid: { space, cols, rows, node, open: openCount }, areas };
}

/** The node a spot stands on in a graph, or -1 (outside every node of its space). */
export function nodeAt(graph: WalkGraph, spot: Spot): number {
  const aloft = graph.aloft.get(spot.space);
  if (aloft !== undefined) return aloft;
  const g = graph.grids.get(spot.space);
  if (!g) return -1;
  const sp = g.space;
  if (spot.along < sp.aft || spot.along > sp.fore || spot.across < sp.port || spot.across > sp.starboard) return -1;
  // The grid is whole squares: a spot of the space past its last square's edge counts as that square.
  const c = Math.min(g.cols - 1, Math.floor((spot.along - sp.aft) / WALK_CELL)), r = Math.min(g.rows - 1, Math.floor((spot.across - sp.port) / WALK_CELL));
  return g.node[c * g.rows + r]!;
}

/** Why a way does not fit a body, or null when it does. */
function misfit(w: Way, body: Body): string | null {
  if (w.kind !== 'ladder') {
    if (w.width < body.breadth) return `it is ${w.width.toFixed(2)} m wide`;
    if (w.height < body.leastHeadroom) return `it is ${w.height} m high`;
    if (w.rise > body.stepUp) return `its step is ${w.rise.toFixed(2)} m`;
    return null;
  }
  if (w.width < Math.min(body.breadth, LEAST_HATCH)) return `the ladder is ${w.width.toFixed(2)} m wide`;
  if (w.height < LEAST_HATCH) return `its opening is ${w.height.toFixed(2)} m long`;
  if (w.rise > LADDER.mostRise) return `its steps rise ${w.rise.toFixed(2)} m`;
  return null;
}

/** The walk graph of a plan for a body (rules: BODY is the captain's). */
export function walkGraph(plan: ShipPlan, body: Body = BODY): WalkGraph {
  const grids = new Map<string, FloorGrid>(), nodes: WalkNode[] = [];
  for (const space of plan.spaces) {
    const { grid, areas } = floorGrid(plan, space, body, nodes.length);
    grids.set(space.id, grid);
    areas.forEach((area) => nodes.push({ index: nodes.length, space: space.id, area }));
  }
  const aloft = new Map<string, number>();
  const partial: WalkGraph = { body, grids, nodes, edges: [], refused: [], aloft };
  const edges: WalkEdge[] = [], refused: { way: string; why: string }[] = [];
  for (const w of plan.ways) {
    const why = misfit(w, body);
    const a = nodeAt(partial, w.from), b = nodeAt(partial, w.to);
    if (why) refused.push({ way: w.id, why });
    else if (a < 0) refused.push({ way: w.id, why: `its end in ${w.from.space} stands where a body cannot` });
    else if (b < 0) refused.push({ way: w.id, why: `its end in ${w.to.space} stands where a body cannot` });
    else edges.push({ way: w.id, a, b });
  }
  return { body, grids, nodes, edges, refused, aloft };
}

/** The nodes reachable from a node by the graph's ways. */
export function reachable(graph: WalkGraph, from: number): Set<number> {
  const seen = new Set<number>([from]), queue = [from];
  while (queue.length) {
    const n = queue.shift()!;
    for (const e of graph.edges) {
      const next = e.a === n ? e.b : e.b === n ? e.a : -1;
      if (next >= 0 && !seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}
