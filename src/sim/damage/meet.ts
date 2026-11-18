/**
 * What a straight piece of a ball's path meets in a ship (pure, implementation plan N6.1): her timber where it
 * crosses her side, a bulwark or a deck (the plan's damage cell there, how thick and how square on), her guns, her
 * men, her spars, her lines and her sails as they are set, each where along the piece it is met. damage.ts takes the
 * meetings in order and decides what each does; nothing here changes anything.
 *
 * Places are the plan's: m forward of the mainmast (`along`), m from the centreline, + to starboard (`across`),
 * heights m above her base (`h`). Her rig is met as the rig plan lays it (yards square and hoisted, fore-and-aft sails
 * amidships); a sail only while set, a square sail's clews lifted as it is clewed up.
 *
 * **Her hull** is found by its zones: outside, above her inside her outline (over the rail), the open deck inside her
 * bulwarks, between her decks, and the hold. Walking the piece every `MARCH` and halving where the zone changes
 * gives where it crossed her side, a bulwark or a deck; a gun port or an open hatch is no timber.
 */
import { clamp, v3cross, v3dot, v3sub } from '@futuremagic/core';
import { GUN_HIGH, MAN_REACH, STEERING_REACH, TIMBER, WHEEL_HIGH } from '../rules/damage';
import { MODEL, ON_CENTRELINE, SOLID } from '../rules/fittings';
import { BODY, BULWARK, CELL, WALE, type Level } from '../rules/ships';
import { battery } from '../guns/guns';
import { HULL_AFT, HULL_FORE, HULL_LOW, hullBottom, hullEnds, hullHalfBreadth, inWaist, sheer, sideTop, weatherDeck } from '../ship/hull';
import { berthDeck, holds, shipPlan, type Cell } from '../ship/plan';
import { rigPlan } from '../ship/rig';
import { onSpar, type RigPoint } from '../ship/spars';

/** A place in her: along, across, height above her base, m. */
export type Place = readonly [along: number, across: number, h: number];

/** The parts of her timber a ball can cross (rules/damage.ts `TIMBER`). */
export type TimberPart = keyof typeof TIMBER;

interface Met {
  /** How far along the piece it is met, 0 at its start to 1 at its end. */
  readonly s: number;
  readonly at: Place;
}
/** Her timber crossed: which part, its damage cell (null where the plan keeps none), where in the cell (m), how square on (the cosine), and whether the ball was going in. */
export interface TimberMet extends Met {
  readonly kind: 'timber';
  readonly part: TimberPart;
  readonly cell: Cell | null;
  readonly u: number;
  readonly v: number;
  readonly cos: number;
  readonly inward: boolean;
}
export interface GunMet extends Met { readonly kind: 'gun'; readonly gun: number }
export interface ManMet extends Met { readonly kind: 'man'; readonly man: number }
/** A spar's part (`sparParts` index) and the chord the ball cuts through it, m. */
export interface SparMet extends Met { readonly kind: 'spar'; readonly part: number; readonly chord: number }
export interface LineMet extends Met { readonly kind: 'line'; readonly line: number }
export interface SailMet extends Met { readonly kind: 'sail'; readonly sail: number }
/** Her steering gear: the wheel and its tiller ropes (rules/damage.ts `STEERING_REACH`). */
export interface SteeringMet extends Met { readonly kind: 'steering' }
/** The hammocks stowed in the waist's nettings over its rail, at quarters (rules/damage.ts `HAMMOCKS`); how square on. */
export interface HammocksMet extends Met { readonly kind: 'hammocks'; readonly cos: number }
export type Meeting = TimberMet | GunMet | ManMet | SparMet | LineMet | SailMet | SteeringMet | HammocksMet;

/** Where a man stands (his feet, m) and so his body up to BODY.height over them; null for a man not met (killed). */
export type ManPlace = Place | null;

/** What of her can be met now: her men's places (by roster place), her guns still mounted (by battery place), how far each sail is set (0 furled, rig plan order). */
export interface Aboard {
  readonly men: readonly ManPlace[];
  readonly mounted: readonly boolean[];
  readonly sails: readonly number[];
  /** Her spars down and lines gone (rig plan places; damage/fall.ts): what is down is no longer where the plan lays it. Left out: all stands. */
  readonly down?: readonly boolean[];
  readonly gone?: readonly boolean[];
  /** Whether her steering gear is still there to be shot away. */
  readonly steering?: boolean;
  /** Whether her hammocks are stowed in the waist's nettings (she is at quarters). Left out: they are not. */
  readonly hammocks?: boolean;
}

/** One part of a spar between two places it can break (the rig plan's marks), and its spar. */
export interface SparPart {
  readonly spar: string;
  readonly from: Place;
  readonly to: Place;
  readonly radius: number;
}

const placeOf = (p: RigPoint): Place => [p.along, p.across, p.height];

let parts: readonly SparPart[] | null = null;
/** Every spar's parts, spar by spar from heel to head (rig plan order): what a wound is kept against. */
export function sparParts(): readonly SparPart[] {
  if (parts) return parts;
  const out: SparPart[] = [];
  for (const s of rigPlan().spars) {
    for (let k = 1; k < s.marks.length; k++) {
      out.push({ spar: s.id, from: placeOf(onSpar(s, s.marks[k - 1]!.at)), to: placeOf(onSpar(s, s.marks[k]!.at)), radius: s.diameter / 2 });
    }
  }
  parts = out;
  return out;
}

// ---- Boxes ----

/** A box in her, [least, most] of along, across and height. */
type Box = readonly [Place, Place];
/** Room round her hull's box and the rig's for a ball's reach, m. */
const BOX_ROOM = 1;

let boxes: { hull: Box; all: Box } | null = null;
function herBoxes(): { hull: Box; all: Box } {
  if (boxes) return boxes;
  let wide = 0, high = 0;
  for (let a = HULL_AFT; a <= HULL_FORE; a += CELL.along) { wide = Math.max(wide, hullHalfBreadth(a, sideTop(a))); high = Math.max(high, sideTop(a)); }
  const hull: Box = [[HULL_AFT - BOX_ROOM, -wide - BOX_ROOM, HULL_LOW - BOX_ROOM], [HULL_FORE + BOX_ROOM, wide + BOX_ROOM, high + BULWARK.railThick + BOX_ROOM]];
  const lo = [...hull[0]], hi = [...hull[1]];
  const grow = (p: Place) => { for (let i = 0; i < p.length; i++) { lo[i] = Math.min(lo[i]!, p[i]! - BOX_ROOM); hi[i] = Math.max(hi[i]!, p[i]! + BOX_ROOM); } };
  const rig = rigPlan();
  for (const s of rig.spars) { grow(placeOf(s.heel)); grow(placeOf(s.head)); }
  for (const l of rig.lines) { grow(placeOf(l.ends[0])); grow(placeOf(l.ends[1])); }
  boxes = { hull, all: [lo as unknown as Place, hi as unknown as Place] };
  return boxes;
}

/** The share of a piece from a to b inside a box, [enter, leave] between 0 and 1, or null if it misses it. */
function clip(a: Place, b: Place, box: Box): [number, number] | null {
  let s0 = 0, s1 = 1;
  for (let i = 0; i < a.length; i++) {
    const d = b[i]! - a[i]!, lo = box[0][i]!, hi = box[1][i]!;
    if (d === 0) { if (a[i]! < lo || a[i]! > hi) return null; continue; }
    let t0 = (lo - a[i]!) / d, t1 = (hi - a[i]!) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    s0 = Math.max(s0, t0); s1 = Math.min(s1, t1);
    if (s0 > s1) return null;
  }
  return [s0, s1];
}

// ---- Her hull ----

/** Where a place lies in her hull. */
const enum Zone { Out, Over, Deck, Between, Hold }

/** Her half-breadth at a place along and a height, the bulwark standing plumb on her side's top up to its rail; 0 where she is not. */
function breadthAt(along: number, h: number): number {
  return hullHalfBreadth(along, Math.min(h, sideTop(along)));
}

/** How finely her heights along her are kept for finding zones, m (read straight between). */
const TABLE_STEP = 0.05;
/** Her heights along her, kept every TABLE_STEP from her after end: her side's top, the deck at her side, the deck's crown (centreline) and the berth deck. */
interface Heights { readonly top: Float64Array; readonly side: Float64Array; readonly crown: Float64Array; readonly berth: Float64Array }
let heights: Heights | null = null;
function heightsAlong(): Heights {
  if (heights) return heights;
  const n = Math.ceil((HULL_FORE - HULL_AFT) / TABLE_STEP) + 2;
  const make = (f: (along: number) => number) => Float64Array.from({ length: n }, (_, i) => f(HULL_AFT + i * TABLE_STEP));
  heights = { top: make(sideTop), side: make(sheer), crown: make((a) => weatherDeck(a, 0)), berth: make(berthDeck) };
  return heights;
}
/** A kept height at a place along her. */
function heightAlong(table: Float64Array, along: number): number {
  const f = Math.max(0, Math.min(table.length - 1 - TINY, (along - HULL_AFT) / TABLE_STEP)), i = Math.floor(f), k = f - i;
  return table[i]! * (1 - k) + table[i + 1]! * k;
}

function zoneAt(along: number, across: number, h: number): Zone {
  if (along < HULL_AFT || along > HULL_FORE) return Zone.Out;
  const t = heightsAlong(), top = heightAlong(t.top, along), x = Math.abs(across);
  if (h > top + BULWARK.railThick) { const hb = hullHalfBreadth(along, top); return hb > 0 && x < hb ? Zone.Over : Zone.Out; }
  const hb = hullHalfBreadth(along, Math.min(h, top));
  if (!(hb > 0) || x >= hb) return Zone.Out;
  // The deck between its height at her side and its crown is worked out exactly; above or below that band it is plain.
  const deck = h > heightAlong(t.crown, along) ? -Infinity : h <= heightAlong(t.side, along) ? Infinity : weatherDeck(along, across);
  if (h > deck) return Zone.Deck;
  return h > heightAlong(t.berth, along) ? Zone.Between : Zone.Hold;
}

/** How far apart the hull is sampled along a piece, m: thinner than any space a ball could cross her in unseen. */
const MARCH = 0.2;
/** Halvings that find a crossing to well under a millimetre. */
const HALVINGS = 10;
/** A small step for her surface's slope, m. */
const SLOPE_STEP = 0.05;
/** The steps her girth is summed in, m. */
const GIRTH_STEP = 0.05;

const lerp3 = (a: Place, b: Place, s: number): Place => [a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s];
const zoneOf = (p: Place): Zone => zoneAt(p[0], p[1], p[2]);

/** Her girth from her bottom up to a height at a place along her, m (as the plan's cells are laid out). */
export function girthTo(along: number, h: number): number {
  const bottom = hullBottom(along), n = Math.max(1, Math.ceil((h - bottom) / GIRTH_STEP));
  let girth = 0, lastX = hullHalfBreadth(along, bottom), lastH = bottom;
  for (let i = 1; i <= n; i++) {
    const y = bottom + ((h - bottom) * i) / n, x = hullHalfBreadth(along, y);
    girth += Math.hypot(x - lastX, y - lastH);
    lastX = x; lastH = y;
  }
  return girth;
}

/** Where in her a spot of a planking cell is (`u` m along it from its after edge, `v` m up its girth): the place on her side, `girthTo` walked back. */
export function plankingPlace(cell: Cell, u: number, v: number): Place {
  const along = cell.aft + u, bottom = hullBottom(along), girth = cell.from + v;
  let walked = 0, lastX = hullHalfBreadth(along, bottom), lastH = bottom;
  for (let y = bottom + GIRTH_STEP; y <= sideTop(along); y += GIRTH_STEP) {
    const x = hullHalfBreadth(along, y), piece = Math.hypot(x - lastX, y - lastH);
    if (walked + piece >= girth) {
      const f = (girth - walked) / piece;
      return [along, cell.side * (lastX + (x - lastX) * f), lastH + (y - lastH) * f];
    }
    walked += piece; lastX = x; lastH = y;
  }
  return [along, cell.side * lastX, lastH];
}

let cellIndex: Map<string, Cell[]> | null = null;
/** The plan's cells by kind, side, level and band along her. */
function cellsAt(kind: Cell['kind'], side: number, level: Level | null, along: number): readonly Cell[] {
  if (!cellIndex) {
    cellIndex = new Map();
    for (const c of shipPlan().cells) {
      const key = `${c.kind}|${c.side}|${c.level}|${Math.floor((c.aft - HULL_AFT) / CELL.along)}`;
      let list = cellIndex.get(key);
      if (!list) cellIndex.set(key, (list = []));
      list.push(c);
    }
  }
  return cellIndex.get(`${kind}|${side}|${level}|${Math.floor((along - HULL_AFT) / CELL.along)}`) ?? [];
}
/** The cell of a list whose [from, to] holds a value (the last for a value past them all), or null. */
function cellBy(list: readonly Cell[], value: number): Cell | null {
  if (list.length === 0) return null;
  return list.find((c) => value <= c.to) ?? list[list.length - 1]!;
}

/** Whether a place on her side is in a gun port's opening. */
function throughPort(along: number, across: number, h: number): boolean {
  return shipPlan().guns.some((g) => g.side === Math.sign(across) && Math.abs(along - g.along) <= g.width / 2 && h >= g.sill && h <= g.top);
}
/** Whether a place on a deck is over an opening in it (a hatch, a scuttle, a companion). */
function inOpening(level: Level, along: number, across: number): boolean {
  return shipPlan().openings.some((o) => o.level === level && holds(o, along, across));
}

/** The cosine between a direction and her side's outward normal at a place (her flare and her run fore and aft taken in). */
function sideCos(d: Place, at: Place, plumb: boolean): number {
  const [along, across, h] = at, side = Math.sign(across) || 1, hFor = plumb ? sideTop(along) : h;
  const dAlong = (breadthAt(along + SLOPE_STEP, hFor) - breadthAt(along - SLOPE_STEP, hFor)) / (2 * SLOPE_STEP);
  const dUp = plumb ? 0 : (breadthAt(along, h + SLOPE_STEP) - breadthAt(along, h - SLOPE_STEP)) / (2 * SLOPE_STEP);
  const n: Place = [-dAlong, side, -dUp];
  return Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) / (Math.hypot(...d) * Math.hypot(...n));
}

/** How high the hammocks stand stowed in a netting over the top of her side, m (the netting model's room). */
const HAMMOCKS_HIGH = SOLID[MODEL.netting][0]!.y[1];

/** Whether a place over her side's top is in the hammocks stowed in the waist's nettings, over its rail. */
function inHammocks(along: number, h: number): boolean {
  const top = sideTop(along);
  return inWaist(along) && h > top + BULWARK.railThick && h <= top + HAMMOCKS_HIGH;
}

/**
 * The timber met where a piece crosses from zone `z0` to `z1` at `at` (d its direction), or null where it crosses
 * none; and over the waist's rail the hammocks, when they are stowed.
 */
function timberAt(z0: Zone, z1: Zone, s: number, at: Place, d: Place, hammocks: boolean): (TimberMet | HammocksMet)[] {
  const [along, across, h] = at, side = Math.sign(across) || 1;
  const pair = (a: Zone, b: Zone) => (z0 === a && z1 === b) || (z0 === b && z1 === a);
  if (pair(Zone.Out, Zone.Over)) return hammocks && inHammocks(along, h) ? [{ kind: 'hammocks', s, at, cos: sideCos(d, at, true) }] : [];
  const deck = (level: 'weather' | 'berth'): TimberMet | null => {
    if (inOpening(level, along, across)) return null;
    const cell = cellBy(cellsAt('deck', side, level, along), Math.abs(across));
    return { kind: 'timber', s, at, part: level, cell, u: cell ? along - cell.aft : 0, v: cell ? Math.abs(across) - cell.from : 0, cos: Math.abs(d[2]) / Math.hypot(...d), inward: d[2] < 0 };
  };
  const out: (TimberMet | null)[] = [];
  if (pair(Zone.Out, Zone.Deck)) {
    if (!throughPort(along, across, h)) {
      const cell = cellBy(cellsAt('bulwark', side, 'weather', along), h);
      out.push({ kind: 'timber', s, at, part: 'bulwark', cell, u: cell ? along - cell.aft : 0, v: cell ? h - cell.from : 0, cos: sideCos(d, at, true), inward: z0 === Zone.Out });
    }
  } else if (pair(Zone.Out, Zone.Between) || pair(Zone.Out, Zone.Hold)) {
    const girth = girthTo(along, h), cell = cellBy(cellsAt('planking', side, null, along), girth);
    out.push({ kind: 'timber', s, at, part: h >= WALE.lower && h <= WALE.upper ? 'wale' : 'side', cell, u: cell ? along - cell.aft : 0, v: cell ? girth - cell.from : 0, cos: sideCos(d, at, false), inward: z0 === Zone.Out });
  } else if (pair(Zone.Deck, Zone.Between) || pair(Zone.Over, Zone.Between)) {
    out.push(deck('weather'));
  } else if (pair(Zone.Between, Zone.Hold)) {
    out.push(deck('berth'));
  } else if (pair(Zone.Deck, Zone.Hold) || pair(Zone.Over, Zone.Hold)) {
    const both = [deck('weather'), deck('berth')];
    out.push(...(z0 === Zone.Hold ? both.reverse() : both));
  }
  return out.filter((m): m is TimberMet => m !== null);
}

/** Her timber crossed along the piece between shares s0 and s1 (and her hammocks, when they are stowed). */
function hullMeetings(a: Place, b: Place, s0: number, s1: number, hammocks: boolean, out: Meeting[]): void {
  const d: Place = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], length = Math.hypot(...d) * (s1 - s0);
  const n = Math.max(1, Math.ceil(length / MARCH));
  let sPrev = s0, zPrev = zoneOf(lerp3(a, b, s0));
  for (let k = 1; k <= n; k++) {
    const s = s0 + ((s1 - s0) * k) / n, z = zoneOf(lerp3(a, b, s));
    if (z !== zPrev) {
      // Halve toward the first change between the two samples.
      let lo = sPrev, hi = s, zHi = z;
      for (let i = 0; i < HALVINGS; i++) {
        const mid = (lo + hi) / 2, zm = zoneOf(lerp3(a, b, mid));
        if (zm === zPrev) lo = mid; else { hi = mid; zHi = zm; }
      }
      out.push(...timberAt(zPrev, zHi, hi, lerp3(a, b, hi), d, hammocks));
      // Whatever lies between that crossing and this sample is found from it on.
      if (zHi !== z) { sPrev = hi; zPrev = zHi; k--; continue; }
    }
    sPrev = s; zPrev = z;
  }
}

// ---- Things in the way ----

/**
 * The closest approach of piece a→b to piece c→e: the distance and the shares along each (Ericson, "Real-Time
 * Collision Detection" 5.1.9).
 */
export function closest(a: Place, b: Place, c: Place, e: Place): { d: number; s: number; t: number } {
  const d1x = b[0] - a[0], d1y = b[1] - a[1], d1z = b[2] - a[2], d2x = e[0] - c[0], d2y = e[1] - c[1], d2z = e[2] - c[2];
  const rx = a[0] - c[0], ry = a[1] - c[1], rz = a[2] - c[2];
  const aa = d1x * d1x + d1y * d1y + d1z * d1z, ee = d2x * d2x + d2y * d2y + d2z * d2z, f = d2x * rx + d2y * ry + d2z * rz;
  let s: number, t: number;
  if (aa <= TINY && ee <= TINY) { s = 0; t = 0; } else if (aa <= TINY) { s = 0; t = clamp(f / ee, 0, 1); } else {
    const cc = d1x * rx + d1y * ry + d1z * rz;
    if (ee <= TINY) { t = 0; s = clamp(-cc / aa, 0, 1); } else {
      const bb = d1x * d2x + d1y * d2y + d1z * d2z, den = aa * ee - bb * bb;
      s = den > TINY ? clamp((bb * f - cc * ee) / den, 0, 1) : 0;
      t = (bb * s + f) / ee;
      if (t < 0) { t = 0; s = clamp(-cc / aa, 0, 1); } else if (t > 1) { t = 1; s = clamp((bb - cc) / aa, 0, 1); }
    }
  }
  const px = rx + d1x * s - d2x * t, py = ry + d1y * s - d2y * t, pz = rz + d1z * s - d2z * t;
  return { d: Math.sqrt(px * px + py * py + pz * pz), s, t };
}
/** Lengths squared below this are a point, m². */
const TINY = 1e-12;

/** The guns met: each mounted gun's box, her footprint in the plan from her deck up GUN_HIGH. */
function gunMeetings(a: Place, b: Place, mounted: readonly boolean[], out: Meeting[]): void {
  battery().forEach((g, i) => {
    if (!mounted[i]) return;
    const f = g.footprint, deck = weatherDeck(g.along, (f.port + f.starboard) / 2);
    const hit = clip(a, b, [[f.aft, f.port, deck], [f.fore, f.starboard, deck + GUN_HIGH]]);
    if (hit) out.push({ kind: 'gun', s: hit[0], at: lerp3(a, b, hit[0]), gun: i });
  });
}

/** The men met: each body, from his feet up BODY.height, within MAN_REACH of the piece. */
function manMeetings(a: Place, b: Place, men: readonly ManPlace[], out: Meeting[]): void {
  men.forEach((m, i) => {
    if (!m) return;
    const head: Place = [m[0], m[1], m[2] + BODY.height];
    if (!boxesMeet(a, b, m, head, MAN_REACH)) return;
    const c = closest(a, b, m, head);
    if (c.d <= MAN_REACH) out.push({ kind: 'man', s: c.s, at: lerp3(a, b, c.s), man: i });
  });
}

/** Whether two boxes, each grown by `room`, overlap: a cheap test before a closest approach. */
function boxesMeet(a: Place, b: Place, c: Place, e: Place, room: number): boolean {
  for (let i = 0; i < a.length; i++) {
    if (Math.max(a[i]!, b[i]!) + room < Math.min(c[i]!, e[i]!) || Math.min(a[i]!, b[i]!) - room > Math.max(c[i]!, e[i]!)) return false;
  }
  return true;
}

/** The spars met: each part within its radius and the ball's reach (none of a spar that is down). */
function sparMeetings(a: Place, b: Place, reach: number, down: readonly boolean[] | undefined, out: Meeting[]): void {
  const spars = down && sparIndex();
  sparParts().forEach((p, i) => {
    if (spars && down[spars.get(p.spar)!]) return;
    const within = p.radius + reach;
    if (!boxesMeet(a, b, p.from, p.to, within)) return;
    const c = closest(a, b, p.from, p.to);
    if (c.d <= within) out.push({ kind: 'spar', s: c.s, at: lerp3(a, b, c.s), part: i, chord: 2 * Math.sqrt(Math.max(0, p.radius * p.radius - c.d * c.d)) });
  });
}

let linePieces: readonly { readonly line: number; readonly from: Place; readonly to: Place; readonly radius: number }[] | null = null;
/** Every straight piece of every line (between its ends and the blocks it leads through), with its line's place. */
function piecesOfLines(): NonNullable<typeof linePieces> {
  if (linePieces) return linePieces;
  linePieces = rigPlan().lines.flatMap((l, line) => {
    const pts = [l.ends[0], ...l.via, l.ends[1]].map(placeOf);
    return pts.slice(1).map((to, k) => ({ line, from: pts[k]!, to, radius: l.diameter / 2 }));
  });
  return linePieces;
}

/** The lines met: each piece of each line, within its thickness and the ball's reach (a line met twice counts once, where nearest; none that is gone). */
function lineMeetings(a: Place, b: Place, reach: number, gone: readonly boolean[] | undefined, out: Meeting[]): void {
  const best = new Map<number, { d: number; s: number }>();
  for (const p of piecesOfLines()) {
    if (gone?.[p.line]) continue;
    const within = p.radius + reach;
    if (!boxesMeet(a, b, p.from, p.to, within)) continue;
    const c = closest(a, b, p.from, p.to), was = best.get(p.line);
    if (c.d <= within && (!was || c.d < was.d)) best.set(p.line, c);
  }
  for (const [line, c] of best) out.push({ kind: 'line', s: c.s, at: lerp3(a, b, c.s), line });
}

let fullRings: readonly (readonly Place[])[] | null = null;
/** A sail's corners as it stands: a square sail clewed up by its share (its clews drawn up toward its head), the others as laid (each sail sheeted home kept). */
function sailRing(i: number, share: number): readonly Place[] {
  if (share < 1) return ringOf(i, share);
  fullRings ??= rigPlan().sails.map((_, k) => ringOf(k, 1));
  return fullRings[i]!;
}
function ringOf(i: number, share: number): Place[] {
  const sail = rigPlan().sails[i]!, at = new Map(sail.corners.map((c) => [c.name, placeOf(c.at)]));
  return sail.corners.map((c) => {
    const p = at.get(c.name)!;
    if (sail.kind !== 'square' || !c.name.startsWith('clew')) return p;
    return lerp3(at.get(c.name.replace('clew', 'head'))!, p, share);
  });
}

/** The sails met: where the piece goes through a set sail, its corners taken as a fan of flat triangles. */
function sailMeetings(a: Place, b: Place, sails: readonly number[], out: Meeting[]): void {
  sails.forEach((share, i) => {
    if (!(share > 0)) return;
    const ring = sailRing(i, share);
    for (let k = 2; k < ring.length; k++) {
      const s = throughTriangle(a, b, ring[0]!, ring[k - 1]!, ring[k]!);
      if (s !== null) { out.push({ kind: 'sail', s, at: lerp3(a, b, s), sail: i }); return; }
    }
  });
}

/** Where piece a→b goes through triangle p, q, r (Möller–Trumbore), as a share along the piece, or null. */
function throughTriangle(a: Place, b: Place, p: Place, q: Place, r: Place): number | null {
  const d = v3sub([...b], [...a]), e1 = v3sub([...q], [...p]), e2 = v3sub([...r], [...p]);
  const h = v3cross(d, e2), det = v3dot(e1, h);
  if (Math.abs(det) < TINY) return null;
  const t0 = v3sub([...a], [...p]), u = v3dot(t0, h) / det;
  if (u < 0 || u > 1) return null;
  const qv = v3cross(t0, e1), v = v3dot(d, qv) / det;
  if (v < 0 || u + v > 1) return null;
  const s = v3dot(e2, qv) / det;
  return s >= 0 && s <= 1 ? s : null;
}

let sparsById: ReadonlyMap<string, number> | null = null;
/** Each spar's rig plan place by its id. */
const sparIndex = (): ReadonlyMap<string, number> => (sparsById ??= new Map(rigPlan().spars.map((s, i) => [s.id, i])));

let gear: readonly [Place, Place] | null = null;
/** Her steering gear as one line: from the wheel's middle down and aft to her rudder head under her deck at her stern. */
function steeringGear(): readonly [Place, Place] {
  if (gear) return gear;
  const wheel = ON_CENTRELINE.wheel, stern = hullEnds(berthDeck(HULL_AFT)).aft;
  gear = [[wheel, 0, weatherDeck(wheel, 0) + WHEEL_HIGH], [stern, 0, berthDeck(stern)]];
  return gear;
}

/** Her steering gear met: the piece passing within STEERING_REACH (and the ball's reach) of it. */
function steeringMeeting(a: Place, b: Place, reach: number, out: Meeting[]): void {
  const [w, r] = steeringGear(), within = STEERING_REACH + reach;
  if (!boxesMeet(a, b, w, r, within)) return;
  const c = closest(a, b, w, r);
  if (c.d <= within) out.push({ kind: 'steering', s: c.s, at: lerp3(a, b, c.s) });
}

/** Whether a piece a→b comes near her at all (within her hull's and her rig's box). */
export const nearHer = (a: Place, b: Place): boolean => clip(a, b, herBoxes().all) !== null;

/**
 * Everything a straight piece of a ball's path from a to b meets in her, in order along it: her timber, her guns, her
 * men, her spars, lines and sails. `reach` is how near a line, spar or sail it passes to touch it (a ball's radius;
 * chain's whirl, rules/damage.ts `CHAIN_BITE`).
 */
export function meetings(a: Place, b: Place, reach: number, aboard: Aboard): Meeting[] {
  const { hull, all } = herBoxes();
  if (!clip(a, b, all)) return [];
  const out: Meeting[] = [];
  const inHull = clip(a, b, hull);
  if (inHull) {
    hullMeetings(a, b, inHull[0], inHull[1], aboard.hammocks === true, out);
    gunMeetings(a, b, aboard.mounted, out);
  }
  manMeetings(a, b, aboard.men, out);
  sparMeetings(a, b, reach, aboard.down, out);
  lineMeetings(a, b, reach, aboard.gone, out);
  sailMeetings(a, b, aboard.sails, out);
  if (aboard.steering !== false) steeringMeeting(a, b, reach, out);
  return out.sort((p, q) => p.s - q.s);
}
