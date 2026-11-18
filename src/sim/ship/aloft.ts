/**
 * The rig's climbable surfaces and ways (pure, N3.2), joined to the plan's one walk graph (N2.1): the tops, the
 * topmast crosstrees, the footropes of every yard and of the jib-boom, the bowsprit; the shrouds with their ratlines,
 * the futtock shrouds round each top, the topmast and topgallant shrouds. So the captain (N3.11) and the crew's
 * routes (N4.2) go aloft on the same graph they walk the decks by (ship.md, "Every space navigable").
 *
 * The climbs are the shared climbing work of `@futuremagic/figure` (X3): each mast's shrouds on a side are a ladder
 * leaning in and the futtock shrouds one leaning out over the climber (`shroudWays`), and the rig puts the futtock
 * stave where the climb's gait meets it (`futtock.lo`), so the climb goes from one to the other without a stumble.
 * The ladders are in ship space (section.ts), where N3.11 plays the climb; a yard's footrope is the figure's `Yard`.
 */
import { footropeY, shroudWays, yardPoint, type Yard } from '@futuremagic/figure/rigging';
import type { Ladder } from '@futuremagic/figure/ladder';
import {
  ALOFT_STATIONS, BOWSPRIT_STEP, BOWSPRIT_WALK, CLIMB, CROSSTREES_STAVE, CROSSTREES_TIMBERS, FOOTING, FUTTOCK_UNDER_TOP,
  MAST_SPARS, MASTHEAD_SIDE, TOPGALLANT_SPREAD, TRESTLE_DEPTH, type MastName,
} from '../rules/rig';
import { BULWARK, RATLINE_PITCH } from '../rules/ships';
import { sideTop } from './hull';
import { stationPlace, type CrewPlace, type ShipPlan, type Spot, type Station } from './plan';
import { shipY, shipZ } from './section';
import { atMark, between, topHole, distance, onSpar, point, sideLetter, SIDES, type Deadeye, type MastGeometry, type RigPoint, type Spar } from './spars';
import { nodeAt, type WalkEdge, type WalkGraph, type WalkNode } from './walk';

/** A point of the rig in ship space, as the climb takes it: [x, y, z]. */
const toShip = (p: RigPoint): [number, number, number] => [p.across, shipY(p.height), shipZ(p.along)];
/** A ship-space height back above her base. */
const aboveBase = (y: number): number => y - shipY(0);
/** A ship-space place back to the plan's (m forward of the mainmast, m across). */
const fromShip = (x: number, y: number, z: number): RigPoint => point(-z, x, aboveBase(y));

/** One side of a mast's climbs, in ship space: the shrouds and futtock shrouds to the top, the topmast shrouds and the crosstrees' futtock to the crosstrees, the topgallant shrouds above them. */
export interface MastClimb {
  readonly mast: MastName;
  readonly side: 1 | -1;
  readonly shroud: Ladder;
  readonly futtock: Ladder;
  readonly topmast: Ladder;
  readonly crosstrees: Ladder;
  readonly topgallant: Ladder;
}

/** The middle of some points. */
function middle(points: readonly RigPoint[]): RigPoint {
  const n = points.length;
  return point(points.reduce((t, p) => t + p.along, 0) / n, points.reduce((t, p) => t + p.across, 0) / n, points.reduce((t, p) => t + p.height, 0) / n);
}
/** Where the line from `a` to `b` is at a height. */
const atHeight = (a: RigPoint, b: RigPoint, h: number): RigPoint => between(a, b, (h - a.height) / (b.height - a.height));

/** The lower shrouds' heads round the masthead on a side, and the topmast shrouds' round the topmast's hounds. */
export const lowerMasthead = (g: MastGeometry, side: number): RigPoint => {
  const h = g.lowerHounds + TRESTLE_DEPTH / 2;
  return point(g.lowerAt(h), side * MASTHEAD_SIDE / 2, h);
};
export const topmastHounds = (g: MastGeometry, side: number): RigPoint => point(g.topmastAt(g.topmastHounds), side * MAST_SPARS[g.mast].topmast.diameter / 2, g.topmastHounds);
export const topgallantHounds = (g: MastGeometry, side: number): RigPoint => point(g.topgallantAt(g.topgallantHounds), side * MAST_SPARS[g.mast].topgallant.diameter / 2, g.topgallantHounds);
/** A crosstree's end on a side, where the topgallant shrouds' feet are. */
export const crosstreeEnd = (g: MastGeometry, side: number): RigPoint => point(g.topmastAt(g.crosstrees), side * MAST_SPARS[g.mast].crosstrees, g.crosstrees);

/** Where a man gets onto a mast's shrouds on a side: the plan's crew place at their foot (N2.1). */
const shroudPlace = (plan: ShipPlan, mast: MastName, side: number): CrewPlace => plan.places.find((p) => p.id === `shroud-${mast}-${sideLetter(side)}`)!;

/** The ladders of every mast's shrouds, both sides. */
export function buildClimbs(plan: ShipPlan, geometry: Readonly<Record<MastName, MastGeometry>>, deadeyes: readonly Deadeye[]): MastClimb[] {
  const out: MastClimb[] = [];
  for (const mast of ['fore', 'main'] as const) {
    const g = geometry[mast];
    for (const side of SIDES) {
      const s = sideLetter(side);
      const feet = deadeyes.filter((d) => d.id.startsWith(`${mast}-shroud-${s}`)), tops = deadeyes.filter((d) => d.id.startsWith(`${mast}-top-${s}`));
      // Up the shrouds from the rail, round the futtock shrouds to the top's rim (where the topmast shrouds' deadeyes are).
      const foot = middle(feet), rim = middle(tops), head = lowerMasthead(g, side);
      const floor = sideTop(shroudPlace(plan, mast, side).along) + BULWARK.railThick;
      const stave = atHeight(foot, head, g.topFloor - FUTTOCK_UNDER_TOP);
      const lower = shroudWays({ foot: toShip(foot), stave: toShip(stave), rim: toShip(rim), floor: shipY(floor), rung: RATLINE_PITCH });
      // From the top up the topmast shrouds, round onto the crosstrees.
      const tHead = topmastHounds(g, side), end = crosstreeEnd(g, side);
      const upper = shroudWays({ foot: toShip(rim), stave: toShip(atHeight(rim, tHead, g.crosstrees - CROSSTREES_STAVE)), rim: toShip(end), floor: shipY(g.topFloor), rung: RATLINE_PITCH });
      out.push({ mast, side, shroud: lower.shroud, futtock: lower.futtock, topmast: upper.shroud, crosstrees: upper.futtock, topgallant: topgallantLadder(end, topgallantHounds(g, side)) });
    }
  }
  return out;
}

/** The topgallant shrouds from a crosstree's end up to the hounds: a ladder leaning in, held by its sides, climbed from the crosstrees. */
function topgallantLadder(foot: RigPoint, head: RigPoint): Ladder {
  const [x, y, z] = toShip(foot), [hx, hy, hz] = toShip(head);
  const run = Math.hypot(hx - x, hz - z), rise = hy - y;
  const lo = y + RATLINE_PITCH, rungs = Math.floor((rise - RATLINE_PITCH) / RATLINE_PITCH) - 1;
  return { x, z, nx: (hx - x) / run, nz: (hz - z) / run, lo, hi: lo + rungs * RATLINE_PITCH, floor: y, halfWidth: TOPGALLANT_SPREAD, rim: false, rung: RATLINE_PITCH, lean: run / rise, holds: 'sides' };
}

/** A surface aloft a body stands on: a top, the crosstrees, a footrope, the bowsprit. */
export interface AloftSurface {
  readonly id: string;
  readonly name: string;
  readonly kind: 'top' | 'crosstrees' | 'footrope' | 'bowsprit';
  /** The spar it is on or hangs from. */
  readonly spar: string;
  /** Its outline (a top's or the crosstrees' four corners) or its line (a footrope or the bowsprit, inner end first). */
  readonly points: readonly RigPoint[];
  /** What a body has to stand on, m². */
  readonly area: number;
  /** A yard's footrope as the climb takes it (ship space, the yard square and hoisted), or null. */
  readonly yard: Yard | null;
}

/** A way aloft between the deck or a surface and a surface. */
export interface AloftWay {
  readonly id: string;
  readonly kind: 'shrouds' | 'topmast shrouds' | 'footrope' | 'bowsprit';
  readonly from: Spot;
  readonly to: Spot;
  /** The ladders climbed, in order (ship space): shrouds then futtock shrouds; topmast shrouds then the crosstrees' futtock; to a footrope, the shrouds it is stepped off. */
  readonly ladders: readonly Ladder[];
  /** A footrope: the ship-space height it is stepped onto from the last ladder; else null. */
  readonly at: number | null;
  /** The ratlines' rise, m, or null; the slope of a spar walked along, rad. */
  readonly rung: number | null;
  readonly slope: number;
}

export interface Aloft {
  readonly climbs: readonly MastClimb[];
  readonly surfaces: readonly AloftSurface[];
  readonly ways: readonly AloftWay[];
  readonly stations: readonly Station[];
  readonly places: readonly CrewPlace[];
}

const spotOn = (surface: AloftSurface, p: RigPoint): Spot => ({ space: surface.id, along: p.along, across: p.across });
const rect = (along: number, across: number, height: number, halfAlong: number, halfAcross: number): RigPoint[] =>
  [point(along - halfAlong, across - halfAcross, height), point(along + halfAlong, across - halfAcross, height), point(along + halfAlong, across + halfAcross, height), point(along - halfAlong, across + halfAcross, height)];

/** The figure's footrope of a yard, square and hoisted: men stand abaft it, facing forward. */
export function footropeOf(yard: Spar): Yard {
  const [x, y, z] = toShip(point(yard.heel.along, 0, yard.yard!.hoisted + yard.diameter / 2));
  return { x, y, z, ax: 1, az: 0, reach: yard.length / 2 - CLIMB.footropeShort, nx: 0, nz: -1 };
}

/** The tops, crosstrees, footropes and bowsprit; the ways between them and the deck; the stations and places aloft. */
export function buildAloft(plan: ShipPlan, geometry: Readonly<Record<MastName, MastGeometry>>, spars: ReadonlyMap<string, Spar>, climbs: readonly MastClimb[]): Aloft {
  const surfaces: AloftSurface[] = [], ways: AloftWay[] = [], places: CrewPlace[] = [];
  const add = (s: AloftSurface) => { surfaces.push(s); return s; };
  const scratch = { x: 0, y: 0, z: 0 };
  for (const mast of ['fore', 'main'] as const) {
    const g = geometry[mast], row = MAST_SPARS[mast];
    const hole = topHole(mast);
    const top = add({ id: `${mast}-top`, name: `${mast} top`, kind: 'top', spar: `${mast}-mast`, points: rect(g.lowerAt(g.topFloor), 0, g.topFloor, row.top.length / 2, row.top.breadth / 2), area: row.top.breadth * row.top.length - hole * hole, yard: null });
    const span = 2 * row.crosstrees;
    const cross = add({ id: `${mast}-crosstrees`, name: `${mast} topmast crosstrees`, kind: 'crosstrees', spar: `${mast}-topmast`, points: rect(g.topmastAt(g.crosstrees), 0, g.crosstrees, CROSSTREES_TIMBERS.apart / 2, row.crosstrees), area: 2 * span * CROSSTREES_TIMBERS.sided, yard: null });
    for (const side of SIDES) {
      const s = sideLetter(side), c = climbs.find((k) => k.mast === mast && k.side === side)!;
      // On the top beside its rim on this side, and on the crosstrees by the mast.
      const onTop = spotOn(top, point(g.lowerAt(g.topFloor), side * (row.top.breadth / 2 + hole / 2) / 2, g.topFloor));
      const onCross = spotOn(cross, point(g.topmastAt(g.crosstrees), side * row.crosstrees / 2, g.crosstrees));
      const deck = shroudPlace(plan, mast, side);
      const deckSpot: Spot = { space: deck.space, along: deck.along, across: deck.across };
      ways.push({ id: `${mast}-shrouds-${s}`, kind: 'shrouds', from: deckSpot, to: onTop, ladders: [c.shroud, c.futtock], at: null, rung: RATLINE_PITCH, slope: 0 });
      ways.push({ id: `${mast}-topmast-shrouds-${s}`, kind: 'topmast shrouds', from: onTop, to: onCross, ladders: [c.topmast, c.crosstrees], at: null, rung: RATLINE_PITCH, slope: 0 });
      places.push({ id: `top-${mast}-${s}`, kind: 'top', of: top.id, ...onTop });
      // Each yard's footrope on this side, stepped onto from the shrouds that pass it.
      for (const yard of [...spars.values()].filter((y) => y.yard && y.mast === mast)) {
        const f = footropeOf(yard), inner = side * (f.inner ?? FOOTROPE_INNER), outer = side * f.reach;
        const ends = [inner, outer].map((a) => { yardPoint(f, a, 0, footropeY(f, a), scratch); return fromShip(scratch.x, scratch.y, scratch.z); });
        const rope = add({ id: `${yard.id}-footrope-${s}`, name: `${yard.name}'s footrope, ${side > 0 ? 'starboard' : 'larboard'}`, kind: 'footrope', spar: yard.id, points: ends, area: distance(ends[0]!, ends[1]!) * FOOTING, yard: f });
        const level = yard.yard!.level;
        const [from, ladder] = level === 'course' ? [deckSpot, c.shroud] : level === 'topsail' ? [onTop, c.topmast] : [onCross, c.topgallant];
        ways.push({ id: `${yard.id}-${s}`, kind: 'footrope', from, to: spotOn(rope, ends[0]!), ladders: [ladder], at: shipY(ends[0]!.height), rung: RATLINE_PITCH, slope: 0 });
        const n = Math.floor(distance(ends[0]!, ends[1]!) / CLIMB.yardPlace);
        for (let k = 0; k <= n; k++) places.push({ id: `yard-${yard.id}-${s}${k + 1}`, kind: 'yard', of: yard.id, ...spotOn(rope, between(ends[0]!, ends[1]!, n ? k / n : 0)) });
      }
    }
  }
  // The bowsprit, walked from the stem out to near its cap holding the manropes; the jib-boom's footropes beyond.
  const bowsprit = spars.get('bowsprit')!, jib = spars.get('jib-boom')!;
  const lift = (p: RigPoint, d: number) => point(p.along, p.across, p.height + d / 2);
  const stem = atMark(bowsprit, 'stem'), cap = atMark(bowsprit, 'cap');
  const walk = add({ id: 'bowsprit', name: 'bowsprit', kind: 'bowsprit', spar: bowsprit.id, points: [lift(stem, bowsprit.diameter), lift(between(stem, cap, BOWSPRIT_WALK), bowsprit.diameter)], area: distance(stem, cap) * BOWSPRIT_WALK * bowsprit.diameter, yard: null });
  ways.push({ id: 'bowsprit', kind: 'bowsprit', from: { space: 'deck', along: BOWSPRIT_STEP.along, across: BOWSPRIT_STEP.across }, to: spotOn(walk, walk.points[0]!), ladders: [], at: null, rung: null, slope: Math.atan2(cap.height - stem.height, cap.along - stem.along) });
  const jibSlope = Math.atan2(jib.head.height - jib.heel.height, jib.head.along - jib.heel.along);
  for (const side of SIDES) {
    const s = sideLetter(side), from = atMark(jib, 'cap'), to = onSpar(jib, jib.length - CLIMB.footropeShort);
    const hang = (p: RigPoint) => point(p.along, side * jib.diameter, p.height - JIB_FOOTROPE_DROP);
    const rope = add({ id: `jib-boom-footrope-${s}`, name: `jib-boom's footrope, ${side > 0 ? 'starboard' : 'larboard'}`, kind: 'footrope', spar: jib.id, points: [hang(from), hang(to)], area: distance(from, to) * FOOTING, yard: null });
    ways.push({ id: `jib-boom-${s}`, kind: 'footrope', from: spotOn(walk, walk.points[1]!), to: spotOn(rope, rope.points[0]!), ladders: [], at: null, rung: null, slope: jibSlope });
  }
  const stations: Station[] = ALOFT_STATIONS.map((st) => {
    const surface = surfaces.find((x) => x.id === st.on)!;
    return { id: st.id, name: st.name, who: st.who, orders: st.orders, ...spotOn(surface, middle(surface.points)) };
  });
  for (const st of stations) places.push(stationPlace(st));
  return { climbs, surfaces, ways, stations, places };
}
/** The figure's footrope starts this far out from a yard's middle, m (its default: the slings and the mast are inside it). */
const FOOTROPE_INNER = 0.5;
/** The jib-boom's footropes (its horses) hang this far under it, m. */
const JIB_FOOTROPE_DROP = 0.9;

/** Why a way aloft cannot be taken, or null. */
function misfit(w: AloftWay): string | null {
  if (w.rung !== null && w.rung > CLIMB.mostRung) return `its ratlines rise ${w.rung} m`;
  if (Math.abs(w.slope) > CLIMB.mostSlope) return `it slopes ${w.slope.toFixed(2)} rad`;
  const last = w.ladders[w.ladders.length - 1];
  if (w.at !== null && last && (w.at < last.floor || w.at > last.hi)) return `its footrope is not beside the ladder it is stepped off`;
  return null;
}

/** The walk graph with the rig joined to it: each surface aloft a node, each way aloft an edge where it can be taken. */
export function walkAloft(graph: WalkGraph, aloft: Aloft): WalkGraph {
  const nodes: WalkNode[] = [...graph.nodes], map = new Map(graph.aloft);
  for (const s of aloft.surfaces) {
    map.set(s.id, nodes.length);
    nodes.push({ index: nodes.length, space: s.id, area: s.area });
  }
  const joined: WalkGraph = { ...graph, nodes, aloft: map };
  const edges: WalkEdge[] = [...graph.edges], refused = [...graph.refused];
  for (const w of aloft.ways) {
    const why = misfit(w), a = nodeAt(joined, w.from), b = nodeAt(joined, w.to);
    if (why) refused.push({ way: w.id, why });
    else if (a < 0) refused.push({ way: w.id, why: `its end in ${w.from.space} stands where a body cannot` });
    else if (b < 0) refused.push({ way: w.id, why: `its end on ${w.to.space} is not a surface aloft` });
    else edges.push({ way: w.id, a, b });
  }
  return { ...joined, edges, refused };
}
