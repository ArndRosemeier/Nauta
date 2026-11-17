/**
 * The brig's plan (pure, N2.1): her spaces, the openings and ladders between them, the doors in her bulkheads, what
 * stands in the way, her guns and their crews' places, the stations where orders are given, the rails where lines
 * are made fast, and the numbered cells damage is kept in. One plan, five uses (ship.md): floating, walking, the
 * crew's routes, damage and drawing all read it. Numbers are in rules/ships.ts; her shape in hull.ts.
 *
 * Places are m forward of the mainmast (`along`), m from the centreline, + to starboard (`across`), heights m above
 * her base; section.ts turns them into ship space.
 */
import {
  BELAY_HEIGHT, BERTH_BEAM, BODY, BERTH_HEADROOM, BULWARK, CEILING, CELL, DECK_BEAM, DOOR, DOORS, FITTINGS, FORE_SHROUDS, FRAME_DEPTH,
  GUN_CREW, GUN_FOOTPRINT, LADDER, LADDERS, MAIN_SHROUDS, MASTS, OPEN_JOINS, OPENINGS, PARTNERS, PIN_CLEAR_OF_PORT, PIN_RAIL,
  PLANKING, PORT_GUNS, PORTS, RAILS, SPACES, STATIONS, WAY_STANDOFF,
  type GunKind, type Level, type OpeningKind, type SpaceRow,
} from '../rules/ships';
import { HULL_AFT, HULL_FORE, hullBottom, hullHalfBreadth, sheer, sideTop, weatherDeck, weatherDeckUnderside } from './hull';

/** An oblong in plan, m: along her and across her. */
export interface Rect {
  readonly aft: number;
  readonly fore: number;
  readonly port: number;
  readonly starboard: number;
}
/** A place on a space's floor. */
export interface Spot {
  readonly space: string;
  readonly along: number;
  readonly across: number;
}

/** A space with what it needs answered: its oblong (clipped to her sides at its floor), its floor and its overhead. */
export interface Space extends Rect {
  readonly id: string;
  readonly name: string;
  readonly level: Level;
  readonly use: string;
  /** A flat floor's height (the hold's spaces), or null: the floor follows a deck. */
  readonly flat: number | null;
}

/** A hole in a deck, as the plan keeps it. */
export interface Opening extends Rect {
  readonly id: string;
  readonly name: string;
  readonly kind: OpeningKind;
  readonly level: Level;
  readonly coaming: number;
}

/** Something that stands in the way of walking on a level: a fitting, a mast, an opening's coaming, a gun. */
export interface Obstacle extends Rect {
  readonly id: string;
  readonly level: Level;
}

/** A way between two spaces: a ladder through an opening, a door in a bulkhead, or the open floor where two spaces meet without one. */
export interface Way {
  readonly id: string;
  readonly kind: 'ladder' | 'door' | 'open';
  readonly from: Spot;
  readonly to: Spot;
  /** Its clear width and height for a body, m (a ladder's height is its hatch's clear opening along her). */
  readonly width: number;
  readonly height: number;
  /** A ladder's rise between its steps and their count; a door's or an open join's step between the two floors (no steps). */
  readonly rise: number;
  readonly steps: number;
  /** The opening a ladder goes through. */
  readonly opening: string | null;
}

/** A bulkhead between two spaces of a level: a straight wall in plan, along her (`across` fixed) or athwart her (`along` fixed). */
export interface Bulkhead {
  readonly between: readonly [string, string];
  readonly level: Level;
  readonly athwart: boolean;
  /** Where it stands: the fixed coordinate, and its extent along the other. */
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

/** A gun port and the gun behind it. */
export interface GunPlace {
  readonly id: string;
  readonly port: string;
  readonly side: 1 | -1;
  readonly along: number;
  readonly gun: GunKind;
  /** A chase port: the gun is shifted here only to fire ahead, so its place is clear of the deck otherwise. */
  readonly chase: boolean;
  readonly sill: number;
  readonly top: number;
  readonly width: number;
  /** Where the gun stands on deck when run out, and its crew's places. */
  readonly footprint: Rect;
  readonly crew: readonly Spot[];
}

/** A point a line is made fast to, and which way from it the man hauling on it stands (along, across). */
export interface Belay {
  readonly id: string;
  readonly rail: string;
  readonly along: number;
  readonly across: number;
  readonly height: number;
  readonly toward: readonly [number, number];
}

/** A crew place: where a man stands for a task, and what it is for. */
export interface CrewPlace extends Spot {
  readonly id: string;
  readonly kind: 'gun' | 'pin' | 'ladder' | 'shroud' | 'station';
  readonly of: string;
}

/** A station where orders are given (rules: STATIONS). */
export interface Station extends Spot {
  readonly id: string;
  readonly name: string;
  readonly who: string;
  readonly orders: readonly string[];
}

/** Where a mast is stepped: its place along her, its heel's height, and its partners' square through each deck. */
export interface MastStep {
  readonly mast: 'fore' | 'main';
  readonly along: number;
  readonly heel: number;
}

/** A cell damage is kept in: a planking panel or a frame (by side, along, girth), a deck panel (by level, along, across), or a bulwark section. */
export interface Cell {
  readonly id: number;
  readonly kind: 'planking' | 'frame' | 'deck' | 'bulwark';
  readonly side: 1 | -1;
  readonly level: Level | null;
  readonly aft: number;
  readonly fore: number;
  /** Planking and frames: girth from the keel's rabbet, m. Decks: m from the centreline. Bulwarks: heights above the base. */
  readonly from: number;
  readonly to: number;
  /** Its area, m² (a frame's: the planking it carries). */
  readonly area: number;
}

export interface ShipPlan {
  readonly spaces: readonly Space[];
  readonly openings: readonly Opening[];
  readonly obstacles: readonly Obstacle[];
  readonly ways: readonly Way[];
  readonly bulkheads: readonly Bulkhead[];
  readonly guns: readonly GunPlace[];
  readonly belays: readonly Belay[];
  readonly places: readonly CrewPlace[];
  readonly stations: readonly Station[];
  readonly masts: readonly MastStep[];
  readonly cells: readonly Cell[];
}

// --- Levels: floors and overheads -------------------------------------------------------------------------------

/** The berth deck's upper side at a place along her, m above the base: BERTH_HEADROOM below the weather deck's beams, level across. */
export const berthDeck = (along: number): number => weatherDeckUnderside(along) - DECK_BEAM.moulded - BERTH_HEADROOM;

/** A space's floor at a place, m above the base. */
export function floorAt(space: Space, along: number, across: number): number {
  if (space.flat !== null) return space.flat;
  return space.level === 'weather' ? weatherDeck(along, across) : berthDeck(along);
}

/** The underside of what is over a space at a place (the beams of the deck above), m above the base; Infinity under the sky. */
export function overheadAt(space: Space, along: number, across: number): number {
  if (space.level === 'weather') return Infinity;
  if (space.level === 'berth') return weatherDeck(along, across) - PLANKING.deck - DECK_BEAM.moulded;
  return berthDeck(along) - PLANKING.berthDeck - BERTH_BEAM;
}

/** How far inboard of her moulded line the inside of her side is: the frames and the ceiling (the bulwark's timbers above the deck). */
const SIDE_INSIDE = FRAME_DEPTH + CEILING;

/** The inside of her side at a place and height: m from the centreline; 0 where she has no hull. */
export function insideBreadth(along: number, h: number): number {
  const top = sideTop(along);
  // Above the top of her side the bulwark stands on it, plumb.
  const moulded = hullHalfBreadth(along, Math.min(h, top));
  return moulded > SIDE_INSIDE ? moulded - SIDE_INSIDE : 0;
}

/** Every floor under a place, lowest first: the spaces whose oblong holds it (what the walker stands on, N2.3). */
export function floorsUnder(plan: ShipPlan, along: number, across: number): { space: Space; floor: number }[] {
  return plan.spaces
    .filter((s) => along >= s.aft && along <= s.fore && across >= s.port && across <= s.starboard)
    .map((space) => ({ space, floor: floorAt(space, along, across) }))
    .sort((a, b) => a.floor - b.floor);
}

// --- Building the plan --------------------------------------------------------------------------------------------

/** The widest a space is across, before clipping by her sides, m: wider than her beam. */
const FULL_ACROSS = 6;

function makeSpace(row: SpaceRow): Space {
  const [port, starboard] = row.across ?? [-FULL_ACROSS, FULL_ACROSS];
  return { id: row.id, name: row.name, level: row.level, use: row.use, aft: row.aft, fore: row.fore, port, starboard, flat: row.floor ?? null };
}

const rect = (aft: number, fore: number, port: number, starboard: number): Rect => ({ aft, fore, port, starboard });

/** The gun ports of both sides, with each gun's footprint and crew. */
function makeGuns(): GunPlace[] {
  const out: GunPlace[] = [];
  for (const side of [-1, 1] as const) {
    for (const [mark, along, sill, top, width] of PORTS) {
      const { gun, chase } = PORT_GUNS[mark]!;
      const inside = insideBreadth(along, sheer(along)), foot = GUN_FOOTPRINT[gun];
      const half = foot.width / 2, inner = inside - foot.inboard;
      const footprint = side > 0 ? rect(along - half, along + half, inner, inside) : rect(along - half, along + half, -inside, -inner);
      // At a chase port the bow closes in forward of the gun, so its crew stands abaft it.
      const crew = GUN_CREW.filter(([, off]) => !chase || off <= 0).map(([inboard, off]) => ({ space: 'deck', along: along + off, across: side * (inside - inboard) }));
      out.push({ id: `${mark}${side > 0 ? 's' : 'p'}`, port: mark, side, along, gun, chase, sill, top, width, footprint, crew });
    }
  }
  return out;
}

/** Everything in the way on each level: fittings, masts' partners, openings with their coamings, guns. */
function makeObstacles(openings: readonly Opening[], guns: readonly GunPlace[]): Obstacle[] {
  const out: Obstacle[] = FITTINGS.map((f) => ({ id: f.id, level: f.level, ...rect(f.aft, f.fore, f.across[0], f.across[1]) }));
  for (const o of openings) out.push({ id: o.id, level: o.level, ...rect(o.aft, o.fore, o.port, o.starboard) });
  for (const [name, m] of Object.entries(MASTS)) {
    const r = PARTNERS / 2;
    for (const level of ['weather', 'berth', 'hold'] as const) out.push({ id: `${name}mast-${level}`, level, ...rect(m.along - r, m.along + r, -r, r) });
  }
  for (const g of guns) if (!g.chase) out.push({ id: `gun-${g.id}`, level: 'weather', ...g.footprint });
  return out;
}

/** The ladders and doors as ways between spots. */
function makeWays(spaces: ReadonlyMap<string, Space>, openings: ReadonlyMap<string, Opening>): Way[] {
  const out: Way[] = [];
  for (const l of LADDERS) {
    const o = openings.get(l.opening)!, below = spaces.get(l.below)!, above = spaces.get(l.above)!;
    // The ladder climbs toward its head's end of the opening: (da, dx) points that way in plan.
    const [da, dx] = DIRECTION[l.head];
    const midAlong = (o.aft + o.fore) / 2, midAcross = (o.port + o.starboard) / 2;
    const headAlong = da > 0 ? o.fore : da < 0 ? o.aft : midAlong, headAcross = dx > 0 ? o.starboard : dx < 0 ? o.port : midAcross;
    const top = floorAt(above, headAlong, headAcross), bottom = floorAt(below, headAlong, headAcross);
    const rise = top - bottom, run = rise / Math.tan(LADDER.slope);
    const steps = Math.max(1, Math.ceil(rise / LADDER.rise));
    // The head is stepped onto beyond the coaming at its end, or from beside the opening (`step`), just inside the end.
    let to: Spot = { space: above.id, along: headAlong + da * WAY_STANDOFF, across: headAcross + dx * WAY_STANDOFF };
    if (l.step) {
      const [sa, sx] = DIRECTION[l.step];
      const edgeAlong = sa > 0 ? o.fore : sa < 0 ? o.aft : headAlong - da * SIDE_STEP_IN;
      const edgeAcross = sx > 0 ? o.starboard : sx < 0 ? o.port : headAcross - dx * SIDE_STEP_IN;
      to = { space: above.id, along: edgeAlong + sa * SIDE_STEP, across: edgeAcross + sx * SIDE_STEP };
    }
    const along = Math.abs(da) * (o.fore - o.aft) + Math.abs(dx) * (o.starboard - o.port);
    const athwart = Math.abs(dx) * (o.fore - o.aft) + Math.abs(da) * (o.starboard - o.port);
    out.push({
      id: l.id, kind: 'ladder', opening: o.id, rise: rise / steps, steps, width: Math.min(LADDER.width, athwart), height: along,
      from: { space: below.id, along: headAlong - da * (run + WAY_STANDOFF), across: headAcross - dx * (run + WAY_STANDOFF) },
      to,
    });
  }
  for (const d of DOORS) {
    const a = spaces.get(d.between[0])!, b = spaces.get(d.between[1])!;
    // The door's wall: athwart her when the two spaces meet end to end, else along her.
    const athwart = Math.abs(a.fore - b.aft) < SAME || Math.abs(b.fore - a.aft) < SAME;
    const offset = (s: Space): Spot => athwart
      ? { space: s.id, along: d.along + (s.aft >= d.along - SAME ? WAY_STANDOFF : -WAY_STANDOFF), across: d.across }
      : { space: s.id, along: d.along, across: d.across + (s.port >= d.across - SAME ? WAY_STANDOFF : -WAY_STANDOFF) };
    const from = offset(a), to = offset(b);
    const rise = Math.abs(floorAt(a, from.along, from.across) - floorAt(b, to.along, to.across));
    out.push({ id: d.id, kind: 'door', opening: null, rise, steps: 0, width: DOOR.width, height: DOOR.height, from, to });
  }
  for (const { between: [ia, ib], across } of OPEN_JOINS) {
    const a = spaces.get(ia)!, b = spaces.get(ib)!;
    // They meet end to end: the way crosses the edge they share where the rules say, clear of what stands there.
    const forward = Math.abs(a.fore - b.aft) < SAME, at = forward ? a.fore : a.aft, sign = forward ? 1 : -1;
    const from = { space: a.id, along: at - sign * OPEN_STANDOFF, across }, to = { space: b.id, along: at + sign * OPEN_STANDOFF, across };
    const width = Math.min(a.starboard, b.starboard) - Math.max(a.port, b.port);
    const rise = Math.abs(floorAt(a, from.along, across) - floorAt(b, to.along, across));
    out.push({ id: `${ia}-${ib}`, kind: 'open', opening: null, rise, steps: 0, width, height: Infinity, from, to });
  }
  return out;
}
/** Two plan coordinates this close are one, m. */
const SAME = 1e-6;
/** The ways a ladder can climb or a head be stepped onto, in plan: [along, across]. */
const DIRECTION = { aft: [-1, 0], fore: [1, 0], port: [0, -1], starboard: [0, 1] } as const;
/** Stepping onto a ladder's head from beside the opening: how far out from the coaming one stands, and how far in from its end, m. */
const SIDE_STEP = 0.35;
const SIDE_STEP_IN = 0.3;
/** Where two open spaces meet, the floor runs on: the way's ends stand a square either side of the edge, m. */
const OPEN_STANDOFF = 0.1;

/** Bulkheads: wherever two spaces of a level meet edge to edge. */
function makeBulkheads(spaces: readonly Space[]): Bulkhead[] {
  const out: Bulkhead[] = [];
  for (let i = 0; i < spaces.length; i++) {
    for (let j = i + 1; j < spaces.length; j++) {
      const a = spaces[i]!, b = spaces[j]!;
      if (a.level !== b.level || OPEN_JOINS.some(({ between: [p, q] }) => (p === a.id && q === b.id) || (p === b.id && q === a.id))) continue;
      const between = [a.id, b.id] as const;
      const acrossFrom = Math.max(a.port, b.port), acrossTo = Math.min(a.starboard, b.starboard);
      const alongFrom = Math.max(a.aft, b.aft), alongTo = Math.min(a.fore, b.fore);
      const acrossOverlap = acrossTo > acrossFrom + SAME, alongOverlap = alongTo > alongFrom + SAME;
      // An athwart bulkhead ends at her sides.
      const athwart = (at: number) => {
        const side = insideBreadth(at, Math.max(floorAt(a, at, 0), floorAt(b, at, 0)) + BODY.height / 2);
        out.push({ between, level: a.level, athwart: true, at, from: Math.max(acrossFrom, -side), to: Math.min(acrossTo, side) });
      };
      if (acrossOverlap && Math.abs(a.fore - b.aft) < SAME) athwart(a.fore);
      if (acrossOverlap && Math.abs(b.fore - a.aft) < SAME) athwart(a.aft);
      if (alongOverlap && Math.abs(a.starboard - b.port) < SAME) out.push({ between, level: a.level, athwart: false, at: a.starboard, from: alongFrom, to: alongTo });
      if (alongOverlap && Math.abs(b.starboard - a.port) < SAME) out.push({ between, level: a.level, athwart: false, at: a.port, from: alongFrom, to: alongTo });
    }
  }
  return out;
}

/** The pins of the pin rails and fife rails. */
function makeBelays(): Belay[] {
  const out: Belay[] = [];
  for (const r of RAILS) {
    if (r.kind === 'pin rail') {
      const count = Math.floor((r.fore - r.aft) / PIN_RAIL.pitch) + 1;
      for (const side of [-1, 1] as const) {
        for (let k = 0; k < count; k++) {
          const along = r.aft + k * PIN_RAIL.pitch;
          if (PORTS.some((p) => Math.abs(p[1] - along) < PIN_CLEAR_OF_PORT)) continue;
          const deck = sheer(along), across = side * (insideBreadth(along, deck + PIN_RAIL.height) - PIN_RAIL.width / 2);
          out.push({ id: `${r.id}-${side > 0 ? 's' : 'p'}${k + 1}`, rail: r.id, along, across, height: deck + PIN_RAIL.height, toward: [0, -side] });
        }
      }
    } else {
      r.pins.forEach((across, k) => {
        out.push({ id: `${r.id}-${k + 1}`, rail: r.id, along: r.at, across, height: weatherDeck(r.at, across) + BELAY_HEIGHT, toward: [r.toward, 0] });
      });
    }
  }
  return out;
}

/** The crew's places: at each gun, before each pin, at each ladder's ends, at the foot of each set of shrouds, at each station. */
function makePlaces(guns: readonly GunPlace[], belays: readonly Belay[], ways: readonly Way[], stations: readonly Station[]): CrewPlace[] {
  const out: CrewPlace[] = [];
  for (const g of guns) g.crew.forEach((c, k) => out.push({ id: `gun-${g.id}-${k + 1}`, kind: 'gun', of: g.id, ...c }));
  for (const b of belays) {
    // A man hauling stands a stride from his pin, on its open side.
    const along = b.along + b.toward[0] * PIN_STANDOFF, across = b.across + b.toward[1] * PIN_STANDOFF;
    out.push({ id: `pin-${b.id}`, kind: 'pin', of: b.id, space: 'deck', along, across });
  }
  for (const w of ways) {
    if (w.kind !== 'ladder') continue;
    out.push({ id: `ladder-${w.id}-foot`, kind: 'ladder', of: w.id, ...w.from });
    out.push({ id: `ladder-${w.id}-head`, kind: 'ladder', of: w.id, ...w.to });
  }
  for (const [mast, shrouds] of [['main', MAIN_SHROUDS], ['fore', FORE_SHROUDS]] as const) {
    // A man goes aloft by the deadeye farthest from any gun port.
    const clear = (a: number) => Math.min(...PORTS.map((p) => Math.abs(p[1] - a)));
    const along = shrouds.reduce((best, a) => (clear(a) > clear(best) ? a : best));
    for (const side of [-1, 1] as const) {
      const across = side * (insideBreadth(along, sheer(along)) - SHROUD_STANDOFF);
      out.push({ id: `shroud-${mast}-${side > 0 ? 's' : 'p'}`, kind: 'shroud', of: `${mast} shrouds`, space: 'deck', along, across });
    }
  }
  for (const s of stations) out.push({ id: `station-${s.id}`, kind: 'station', of: s.id, space: s.space, along: s.along, across: s.across });
  return out;
}
/** How far inboard of a pin its hand stands, and of her side the man going aloft at the shrouds, m. */
const PIN_STANDOFF = 0.55;
const SHROUD_STANDOFF = 0.6;

/** The damage cells: planking and frame panels by girth on both sides, deck panels on both decks, bulwark sections. */
function makeCells(): Cell[] {
  const out: Cell[] = [];
  let id = 0;
  const bands = Math.ceil((HULL_FORE - HULL_AFT) / CELL.along);
  for (const side of [-1, 1] as const) {
    for (let b = 0; b < bands; b++) {
      const aft = HULL_AFT + b * CELL.along, fore = Math.min(HULL_FORE, aft + CELL.along), mid = (aft + fore) / 2;
      const girth = sectionGirth(mid);
      if (girth <= 0) continue;
      const panels = Math.max(1, Math.round(girth / CELL.girth));
      for (let k = 0; k < panels; k++) {
        const from = (girth * k) / panels, to = (girth * (k + 1)) / panels, area = (to - from) * (fore - aft);
        out.push({ id: id++, kind: 'planking', side, level: null, aft, fore, from, to, area });
      }
      out.push({ id: id++, kind: 'frame', side, level: null, aft, fore, from: 0, to: girth, area: girth * (fore - aft) });
      // The bulwark above the deck, from the deck at her side to the rail.
      const deck = sheer(mid);
      out.push({ id: id++, kind: 'bulwark', side, level: 'weather', aft, fore, from: deck, to: sideTop(mid) + BULWARK.railThick, area: (sideTop(mid) - deck) * (fore - aft) });
      // Deck panels outward from the centreline, on both decks.
      for (const [level, h] of [['weather', deck], ['berth', berthDeck(mid)]] as const) {
        const half = insideBreadth(mid, h);
        const n = Math.max(1, Math.round(half / CELL.across));
        for (let k = 0; k < n && half > 0; k++) {
          const from = (half * k) / n, to = (half * (k + 1)) / n;
          out.push({ id: id++, kind: 'deck', side, level, aft, fore, from, to, area: (to - from) * (fore - aft) });
        }
      }
    }
  }
  return out;
}

/** Her moulded girth on one side at a place along her, from the bottom of her hull to the top of her side, m. */
export function sectionGirth(along: number): number {
  const bottom = hullBottom(along), top = sideTop(along);
  if (!(top > bottom)) return 0;
  const n = GIRTH_SAMPLES;
  let girth = 0, lastX = hullHalfBreadth(along, bottom), lastH = bottom;
  for (let i = 1; i <= n; i++) {
    const h = bottom + ((top - bottom) * i) / n, x = hullHalfBreadth(along, h);
    girth += Math.hypot(x - lastX, h - lastH);
    lastX = x;
    lastH = h;
  }
  return girth;
}
/** Samples up a section when measuring its girth. */
const GIRTH_SAMPLES = 120;

let built: ShipPlan | null = null;

/** The brig's plan, built once from the rules and frozen. */
export function shipPlan(): ShipPlan {
  if (built) return built;
  const spaces = SPACES.map(makeSpace);
  const openings: Opening[] = OPENINGS.map((o) => ({ id: o.id, name: o.name, kind: o.kind, level: o.level, coaming: o.coaming, ...rect(o.aft, o.fore, o.across[0], o.across[1]) }));
  const guns = makeGuns();
  const ways = makeWays(new Map(spaces.map((s) => [s.id, s])), new Map(openings.map((o) => [o.id, o])));
  const stations: Station[] = STATIONS.map((s) => ({ id: s.id, name: s.name, who: s.who, orders: s.orders, space: s.space, along: s.along, across: s.across }));
  const belays = makeBelays();
  const masts: MastStep[] = (Object.keys(MASTS) as ('fore' | 'main')[]).map((m) => ({ mast: m, along: MASTS[m].along, heel: MASTS[m].step }));
  built = deepFreeze({
    spaces, openings, obstacles: makeObstacles(openings, guns), ways, bulkheads: makeBulkheads(spaces), guns, belays,
    places: makePlaces(guns, belays, ways, stations), stations, masts, cells: makeCells(),
  });
  return built;
}

function deepFreeze<T>(v: T): T {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze((v as Record<string, unknown>)[k]);
  }
  return v;
}
