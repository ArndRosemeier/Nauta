/**
 * Her rooms below the weather deck (plan N2.4): the berth deck's planking with its openings and the beams under it,
 * the hold's floors, the ceiling on her frames, the bulkheads between her spaces with their doorways, the doors
 * themselves (hinged, for the walker to swing, N2.3), her ladders, and the lanterns hung from the beams. Each piece
 * is drawn in the zone of its room (zones.ts).
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import {
  BERTH_BEAM, DECK_BEAM, DOOR, DOORS, LADDER, LADDERS, LANTERNS, OPEN_JOINS, PLANKING, WAY_STANDOFF, type Toward,
} from '../../sim/rules/ships';
import { weatherDeck } from '../../sim/ship/hull';
import { berthDeck, floorAt, type Space } from '../../sim/ship/plan';
import { shipY, shipZ } from '../../sim/ship/section';
import { box, direction, sheet } from './shapes';
import { Solid } from './solid';
import type { ZoneParts } from './parts';
import { BERTH_DECK, BUFF, IRON, OAK } from './looks';
import { place, type Fittings } from './fittings';
import { DAMAGE } from './damageMap';
import { CORNER_AO, CORNER_REACH, EPSILON, ROW_STEP, SMALL_BEVEL, ceilingX, rowsAlong, steps } from './hullSide';
import { LET_IN, MOST_HALF, bentBeam, buildCoamings, deckCells, deckUnderside, type DeckContext } from './decks';
import { doorAthwart, openingsOn, rectCentre, zoneUnder } from './zones';

/** A bulkhead's boards, m: each face stands half this off the bulkhead's line. */
const BULKHEAD = 0.05;
/** Bulkhead boards stand upright, this wide, m. */
const BULKHEAD_BOARD = 0.18;
/** A door's thickness, its ledges' depth and width, m; its latch's size. */
const DOOR_PANEL = { thick: 0.04, ledge: 0.025, ledgeWidth: 0.12, latch: 0.03 } as const;
/** How high a door's ledges stand on it, as shares of its height. */
const LEDGES = [0.18, 0.82] as const;
/** The posts and lintel round a doorway, m. */
const CASING = 0.06;
/** A ladder's stringers (deep, thick) and treads (thick, deep), m. */
const STRINGER = { deep: 0.2, thick: 0.05 } as const;
const TREAD = { thick: 0.04, deep: 0.17 } as const;
/** The berth deck's openings' coamings, m thick. */
const COAMING_BELOW_THICK = 0.1;
/** The lantern: how far below the beam it hangs (m), its flame above its foot (m), and the pack model's height (its hanging ring's top). */
const LANTERN = { below: 0.16, flame: 0.14, height: 0.436 } as const;
/** The ways a ladder can climb, in plan: [along, across]. */
const DIRECTION: Readonly<Record<Toward, readonly [number, number]>> = { aft: [-1, 0], fore: [1, 0], port: [0, -1], starboard: [0, 1] };
/** A quarter turn, rad. */
const QUARTER = Math.PI / 2;

/** What is over a space: the underside of the deck above (m above the base) at a place. */
function overhead(s: Space, along: number, across: number): number {
  return s.level === 'berth' ? weatherDeck(along, across) - PLANKING.deck : berthDeck(along) - PLANKING.berthDeck;
}

/** A flame below deck, for the light in the shaders: its zone and where it burns (ship space). */
export interface Lamp {
  readonly zone: string;
  readonly at: Vector3;
}

/** Everything below the weather deck. */
export function buildRooms(ctx: DeckContext, fittings: Fittings): Lamp[] {
  const { plan } = ctx;
  for (const s of plan.spaces) {
    if (s.level === 'weather') continue;
    buildFloor(ctx, s);
    buildCeiling(ctx, s);
    buildWalls(ctx, s);
  }
  buildBerthBeams(ctx);
  for (const o of openingsOn(plan, 'berth')) {
    const { along: mid, across: cx } = rectCentre(o);
    const above = zoneUnder(plan, ctx.zones, 'berth', mid, cx), below = zoneUnder(plan, ctx.zones, 'hold', mid, cx);
    if (above) buildCoamings(ctx.parts.zone(above), below ? ctx.parts.zone(below) : null, o, (a) => berthDeck(a), COAMING_BELOW_THICK);
  }
  buildLadders(ctx);
  buildDoors(ctx);
  return buildLanterns(ctx, fittings);
}

/** The zone a space is drawn in. */
const zoneOf = (ctx: DeckContext, s: Space) => ctx.parts.zone(ctx.zones.get(s.id)!);

/** A space's floor: the berth deck's planking cut for its openings (its underside seen from the hold), or the hold's dunnage. */
function buildFloor(ctx: DeckContext, s: Space): void {
  const { plan } = ctx;
  const holes = s.level === 'berth' ? openingsOn(plan, 'berth') : [];
  const alongs = steps(s.aft, s.fore, ROW_STEP, holes.flatMap((o) => [o.aft, o.fore])).reverse();
  const port = Math.max(s.port, -MOST_HALF), starboard = Math.min(s.starboard, MOST_HALF);
  const xs = steps(port, starboard, ROW_STEP, holes.flatMap((o) => [o.port, o.starboard]));
  const floor = (a: number, x: number) => floorAt(s, a, x);
  const edge = (a: number) => ceilingX(a, floor(a, 0)) + LET_IN;
  const cells = deckCells(alongs, xs, edge, floor, holes), { top } = cells;
  sheet(zoneOf(ctx, s).wood, top, { ...BERTH_DECK, damage: s.level === 'berth' && s.flat === null ? DAMAGE.berthDeck : 0 }, (i, j) => [shipZ(alongs[i]!), top[i]![j]!.x], cells.keep, false, cells.ao);
  if (s.level === 'berth') deckUnderside(ctx, alongs, xs, edge, (a, x) => floor(a, x) - PLANKING.berthDeck, cells, 'hold');
}

/** The ceiling on her frames, where a space reaches her side: from its floor up to the deck above. */
function buildCeiling(ctx: DeckContext, s: Space): void {
  const z = zoneOf(ctx, s);
  const alongs = rowsAlong(s.aft, s.fore).reverse();
  for (const side of [1, -1]) {
    if ((side > 0 ? s.starboard : -s.port) < MOST_HALF) continue;
    const faceX = (a: number) => side * ceilingX(a, floorAt(s, a, 0));
    const hs = (a: number) => {
      const lo = floorAt(s, a, faceX(a)), hi = overhead(s, a, faceX(a));
      return steps(0, 1, ROW_STEP / Math.max(hi - lo, ROW_STEP)).map((t) => lo + (hi - lo) * t);
    };
    const n = Math.max(...alongs.map((a) => hs(a).length));
    const rows = alongs.map((a) => {
      const lo = floorAt(s, a, faceX(a)), hi = overhead(s, a, faceX(a));
      return Array.from({ length: n }, (_, j) => lo + ((hi - lo) * j) / (n - 1));
    });
    const grid = rows.map((r, i) => r.map((h) => new Vector3(side * ceilingX(alongs[i]!, h), shipY(h), shipZ(alongs[i]!))));
    sheet(z.wood, grid, { ...OAK, plank: STRAKE }, (i, j) => [shipZ(alongs[i]!), rows[i]![j]!], (i) => grid[i]![0]!.x !== 0 || grid[i + 1]![0]!.x !== 0, side < 0,
      (i, j) => CORNER_AO + (1 - CORNER_AO) * Math.min(1, (rows[i]![j]! - rows[i]![0]!) / CORNER_REACH));
  }
}
/** The ceiling's strakes, m. */
const STRAKE = 0.23;

/** The parts of an interval [from, to] left when others are taken out. */
function subtract(from: number, to: number, out: readonly (readonly [number, number])[]): [number, number][] {
  let parts: [number, number][] = [[from, to]];
  for (const [p, q] of out) parts = parts.flatMap(([a, b]): [number, number][] => (q <= a || p >= b ? [[a, b]] : [[a, Math.min(b, p)], [Math.max(a, q), b]].filter(([u, v]) => v - u > EPSILON) as [number, number][]));
  return parts;
}

/** Whether two spaces are open to each other. */
const joined = (a: string, b: string) => OPEN_JOINS.some(({ between: [p, q] }) => (p === a && q === b) || (p === b && q === a));

/**
 * A space's walls where it does not reach her side: one face on each edge, standing half a board off it into the
 * space, with doorways cut where the plan's doors are. Two spaces side by side each build their face of the bulkhead
 * between them; where they are open to each other there is none.
 */
function buildWalls(ctx: DeckContext, s: Space): void {
  const { plan } = ctx;
  const z = zoneOf(ctx, s);
  const others = plan.spaces.filter((o) => o.level === s.level && o.id !== s.id && joined(o.id, s.id));
  // Athwart edges: aft (facing forward) and fore (facing aft).
  for (const [at, facing] of [[s.aft, 1], [s.fore, -1]] as const) {
    const open = others.filter((o) => Math.abs((facing > 0 ? o.fore : o.aft) - at) < EPSILON).map((o) => [o.port, o.starboard] as const);
    const doors = DOORS.filter((d) => d.between.includes(s.id) && Math.abs(d.along - at) < EPSILON && doorAthwart(plan.spaces.find((x) => x.id === d.between[0])!, plan.spaces.find((x) => x.id === d.between[1])!));
    for (const [p, q] of subtract(Math.max(s.port, -MOST_HALF), Math.min(s.starboard, MOST_HALF), open)) {
      wall(z, s, true, at + (facing * BULKHEAD) / 2, p, q, facing, doors.map((d) => d.across));
    }
  }
  // Fore-and-aft edges inside her: port (facing starboard) and starboard (facing port).
  for (const [at, facing] of [[s.port, 1], [s.starboard, -1]] as const) {
    if (Math.abs(at) >= MOST_HALF) continue;
    const open = others.filter((o) => Math.abs((facing > 0 ? o.starboard : o.port) - at) < EPSILON).map((o) => [o.aft, o.fore] as const);
    const doors = DOORS.filter((d) => d.between.includes(s.id) && Math.abs(d.across - at) < EPSILON && !doorAthwart(plan.spaces.find((x) => x.id === d.between[0])!, plan.spaces.find((x) => x.id === d.between[1])!));
    for (const [p, q] of subtract(s.aft, s.fore, open)) wall(z, s, false, at + (facing * BULKHEAD) / 2, p, q, facing, doors.map((d) => d.along));
  }
}

/**
 * One face of a bulkhead: athwart her at `at` (m forward of the mast) from across p to q, or along her at `at` (m
 * from the centreline) from along p to q, from the space's floor to the deck above, held inside her side; facing
 * +1 forward (or to starboard), -1 aft (or to port); doorways at the places `doors` along the face.
 */
function wall(z: ZoneParts, s: Space, athwart: boolean, at: number, p: number, q: number, facing: number, doors: readonly number[]): void {
  const half = DOOR.width / 2;
  const ts = steps(p, q, ROW_STEP, doors.flatMap((d) => [d - half, d + half]));
  const place = (t: number) => (athwart ? [at, t] : [t, at]) as [number, number];
  const lows = ts.map((t) => floorAt(s, ...place(t))), highs = ts.map((t) => overhead(s, ...place(t)));
  const lo = Math.min(...lows), hi = Math.max(...highs);
  const hs = steps(lo, hi, ROW_STEP, doors.length ? [lo + DOOR.height] : []);
  const grid = ts.map((t, i) => hs.map((h) => {
    const y = Math.min(highs[i]!, Math.max(lows[i]!, h));
    const [a, x] = place(t);
    const lim = ceilingX(a, y);
    const cx = athwart ? Math.max(-lim, Math.min(lim, x)) : x;
    return new Vector3(cx, shipY(y), shipZ(a));
  }));
  const inDoor = (i: number, j: number) => doors.some((d) => (ts[i]! + ts[i + 1]!) / 2 > d - half && (ts[i]! + ts[i + 1]!) / 2 < d + half && (hs[j]! + hs[j + 1]!) / 2 < lo + DOOR.height);
  // Athwart: columns run to starboard; faces aft unless flipped. Along: columns run forward; faces starboard unless flipped.
  sheet(z.wood, grid, { ...BUFF, plank: BULKHEAD_BOARD }, (i, j) => [hs[j]!, ts[i]!], (i, j) => !inDoor(i, j), athwart ? facing > 0 : facing < 0);
  // The casing round each doorway on this face.
  for (const d of doors) {
    const floor = floorAt(s, ...place(d)), y = shipY(floor + DOOR.height / 2);
    for (const e of [d - half - CASING / 2, d + half + CASING / 2]) {
      const [a, x] = place(e);
      box(z.wood, new Matrix4().makeTranslation(x, y, shipZ(a)), athwart ? [CASING, DOOR.height, CASING] : [CASING, DOOR.height, CASING], OAK, SMALL_BEVEL, 1);
    }
    const [a, x] = place(d);
    box(z.wood, new Matrix4().makeTranslation(x, shipY(floor + DOOR.height + CASING / 2), shipZ(a)), athwart ? [DOOR.width + 2 * CASING, CASING, CASING] : [CASING, CASING, DOOR.width + 2 * CASING], OAK, SMALL_BEVEL, athwart ? 0 : 2);
  }
}

/** The berth deck's beams, seen from the hold, each piece in the zone below it. */
function buildBerthBeams(ctx: DeckContext): void {
  const { plan, zones, parts } = ctx;
  const holds = plan.spaces.filter((s) => s.level === 'hold');
  const from = Math.min(...holds.map((s) => s.aft)), to = Math.max(...holds.map((s) => s.fore));
  const holes = openingsOn(plan, 'berth');
  for (let k = Math.ceil(from / DECK_BEAM.spacing); k <= Math.floor(to / DECK_BEAM.spacing); k++) {
    const a = k * DECK_BEAM.spacing, a0 = a - DECK_BEAM.sided / 2, a1 = a + DECK_BEAM.sided / 2;
    const topH = berthDeck(a) - PLANKING.berthDeck, inner = ceilingX(a, topH - BERTH_BEAM);
    let spans: [number, number][] = [[-inner, inner]];
    for (const h of holes) if (!(a1 <= h.aft || a0 >= h.fore)) spans = spans.flatMap(([p, q]) => subtract(p, q, [[h.port, h.starboard]]));
    for (const [p, q] of spans) {
      const z = zoneUnder(plan, zones, 'hold', a, (p + q) / 2);
      if (z) bentBeam(parts.zone(z), [p, (p + q) / 2, q], a0, a1, BERTH_BEAM, () => topH);
    }
  }
}

/** Her ladders: two stringers at the ladder's slope from the floor below to its opening's end, treads a step apart. */
function buildLadders(ctx: DeckContext): void {
  const { plan, parts, zones } = ctx;
  for (const row of LADDERS) {
    const way = plan.ways.find((w) => w.id === row.id)!, o = plan.openings.find((x) => x.id === row.opening)!;
    const [da, dx] = DIRECTION[row.head];
    const rise = way.rise * way.steps, run = rise / Math.tan(LADDER.slope);
    const foot = { along: way.from.along + da * WAY_STANDOFF, across: way.from.across + dx * WAY_STANDOFF };
    const below = plan.spaces.find((x) => x.id === row.below)!;
    const bottom = floorAt(below, foot.along, foot.across);
    const z = parts.zone(zones.get(below.id)!);
    const dir = new Vector3(dx, 0, -da), up = new Vector3(0, 1, 0);
    const side = new Vector3().crossVectors(up, dir).normalize();
    const start = new Vector3(foot.across, shipY(bottom), shipZ(foot.along));
    const end = start.clone().addScaledVector(dir, run).setY(shipY(bottom + rise));
    const len = start.distanceTo(end), slopeDir = direction(start, end);
    const basis = new Matrix4().makeBasis(side, slopeDir, new Vector3().crossVectors(side, slopeDir));
    const half = Math.min(LADDER.width, o.starboard - o.port, o.fore - o.aft) / 2;
    for (const s of [-1, 1]) {
      const mid = start.clone().lerp(end, 1 / 2).addScaledVector(side, s * (half - STRINGER.thick / 2));
      box(z.wood, basis.clone().setPosition(mid), [STRINGER.thick, len, STRINGER.deep], OAK, SMALL_BEVEL, 1);
    }
    for (let k = 1; k < way.steps; k++) {
      const p = start.clone().lerp(end, k / way.steps);
      box(z.wood, new Matrix4().makeBasis(side, up, new Vector3().crossVectors(side, up)).setPosition(p), [2 * half - STRINGER.thick, TREAD.thick, TREAD.deep], { ...OAK, seed: k }, SMALL_BEVEL, 0);
    }
  }
}

/** Every door: a panel of upright boards with two ledges and a latch, hinged at one side of its doorway, and shut. */
function buildDoors(ctx: DeckContext): void {
  const { plan, parts, zones } = ctx;
  for (const d of DOORS) {
    const a = plan.spaces.find((x) => x.id === d.between[0])!, b = plan.spaces.find((x) => x.id === d.between[1])!;
    const athwart = doorAthwart(a, b), floor = Math.max(floorAt(a, d.along, d.across), floorAt(b, d.along, d.across));
    const wood = new Solid(), iron = new Solid(), w = DOOR.width, h = DOOR.height;
    box(wood, new Matrix4().makeTranslation(w / 2, h / 2, 0), [w, h, DOOR_PANEL.thick], { ...BUFF, plank: BULKHEAD_BOARD }, SMALL_BEVEL, 1);
    for (const f of LEDGES) for (const s of [-1, 1]) box(wood, new Matrix4().makeTranslation(w / 2, h * f, s * (DOOR_PANEL.thick + DOOR_PANEL.ledge) / 2), [w - CASING, DOOR_PANEL.ledgeWidth, DOOR_PANEL.ledge], OAK, SMALL_BEVEL, 0);
    for (const s of [-1, 1]) box(iron, new Matrix4().makeTranslation(w - CASING, h / 2, s * (DOOR_PANEL.thick / 2 + DOOR_PANEL.latch / 2)), [DOOR_PANEL.latch, DOOR_PANEL.latch * 2, DOOR_PANEL.latch], IRON, SMALL_BEVEL / 2, 1);
    const hinge: [number, number, number] = athwart ? [d.across - w / 2, shipY(floor), shipZ(d.along)] : [d.across, shipY(floor), shipZ(d.along - w / 2)];
    parts.doors.push({ id: d.id, wood, iron, hinge, shut: athwart ? 0 : QUARTER, opens: 1, zones: [zones.get(a.id)!, zones.get(b.id)!] });
  }
}

/** The lanterns, each hung from the beams over its place, and where each flame burns. */
function buildLanterns(ctx: DeckContext, fittings: Fittings): Lamp[] {
  const { plan, parts, zones } = ctx, lamps: Lamp[] = [];
  for (const [space, along, across] of LANTERNS) {
    const s = plan.spaces.find((x) => x.id === space)!, zone = zones.get(s.id)!, z = parts.zone(zone);
    const beam = s.level === 'berth' ? weatherDeck(along, across) - PLANKING.deck - DECK_BEAM.moulded : berthDeck(along) - PLANKING.berthDeck - BERTH_BEAM;
    const hook = new Vector3(across, shipY(beam), shipZ(along));
    const foot = hook.clone().setY(hook.y - LANTERN.below - LANTERN.height);
    place(fittings, 'prop_horn_lantern', new Matrix4().setPosition(foot), { tin: { solid: z.iron, paint: 1 }, horn: { solid: z.glow, paint: 1 }, candle: { solid: z.glow, paint: 1 } });
    z.ropes.line([hook, hook.clone().setY(foot.y + LANTERN.height)], ROPE_LANYARD, 1);
    lamps.push({ zone, at: foot.clone().setY(foot.y + LANTERN.flame) });
  }
  return lamps;
}
/** The lantern's lanyard's radius, m (a ratline's). */
const ROPE_LANYARD = 0.005;
