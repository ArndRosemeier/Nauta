/**
 * Her weather deck (plan N2.4): the planking from stem to stern with its openings cut, its underside seen from the
 * berth deck, the beams that carry it with their carlings and hanging knees, the coamings round every opening, the
 * gratings over the hatches, the companion's hood and the officers' skylight. What lies under the deck is drawn in
 * the zone of the space it is over (zones.ts), so it is drawn only when that room can be seen.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { CARLING, DECK_BEAM, GRATING, MASTS, PARTNERS, PLANKING, type Level } from '../../sim/rules/ships';
import { hullHalfBreadth, sheer, weatherDeck } from '../../sim/ship/hull';
import type { Opening, Rect, ShipPlan } from '../../sim/ship/plan';
import { shipY, shipZ } from '../../sim/ship/section';
import { box, lathe, sheet } from './shapes';
import type { ShipParts, ZoneParts } from './parts';
import { BLACK, DECK, DECK_BELOW, OAK, TAR } from './looks';
import type { Finish } from './solid';
import { DAMAGE } from './damageMap';
import { BEVEL, CORNER_AO, CORNER_REACH, EPSILON, SMALL_BEVEL, ceilingX, rowsAlong, rowsOf, steps, ROW_STEP } from './hullSide';
import { OUTSIDE, openingsOn, rectCentre, zoneUnder } from './zones';

/** Timbers that meet are let into each other this far, m, so no light shows at the joint. */
export const LET_IN = 0.01;
/** Her widest half-breadth anywhere, m (columns across her decks are laid out to it). */
export const MOST_HALF = 4.7;
/** Hanging knees at the beams' ends: how far down her side they reach, and along the beam, m. */
const KNEE_DROP = 0.55;
const KNEE_ARM = 0.5;
/** How high the partners stand round a mast over the deck, m. */
const PARTNERS_RISE = 0.06;
/** The mast coat at the partners: how high up the mast and how far out on the partners, m. */
const COAT = { up: 0.28, out: 0.14, knee: 1 / 3 } as const;
/** The companion's hood: its boards' thickness and its roof's overhang, m. */
const HOOD = { board: 0.04, overhang: 0.06, roof: 0.06 } as const;
/** The skylight's glazed lids: their frame's width, how steep they stand (rad), and the bars across the glass, m. */
const SKYLIGHT = { frame: 0.06, pitch: 0.42, bar: 0.025, bars: 3 } as const;
/** The glass of the skylight, dark against the lit deck. */
const GLASS: Finish = { rgb: [0.012, 0.016, 0.018], paint: 1 };
/** Sides of turned pieces. */
const SIDES = 24;

/** What the deck builders need: the plan, which zone each space is drawn in, the parts. */
export interface DeckContext {
  readonly plan: ShipPlan;
  readonly zones: ReadonlyMap<string, string>;
  readonly parts: ShipParts;
  /** The far ship: a grating is drawn as one dark board, as it reads from off her. */
  readonly far?: boolean;
}

/** Whether a place lies inside an oblong. */
const inside = (r: Rect, along: number, across: number) => along > r.aft + EPSILON && along < r.fore - EPSILON && across > r.port + EPSILON && across < r.starboard - EPSILON;

/** A mast's partners as an oblong round it. */
const partners = (along: number): Rect => ({ aft: along - PARTNERS / 2, fore: along + PARTNERS / 2, port: -PARTNERS / 2, starboard: PARTNERS / 2 });

/**
 * Rows of points over a deck-like surface: `alongs` (bow first), `xs` across, each point held inside her side's
 * `edge` at its place, at the height `y(along, x)` (above the base).
 */
export function deckGrid(alongs: readonly number[], xs: readonly number[], edge: (a: number) => number, y: (a: number, x: number) => number): Vector3[][] {
  return alongs.map((a) => {
    const e = edge(a);
    return xs.map((x) => {
      const cx = Math.max(-e, Math.min(e, x));
      return new Vector3(cx, shipY(y(a, cx)), shipZ(a));
    });
  });
}

/**
 * A deck's planking over `alongs` and `xs` (deckGrid) at the height `y`, cut for `holes`: its rows of points, each
 * cell's middle, which cells are kept (inside her `edge`, within `reach` beyond it, not in a hole), and the shade
 * toward her side, where her side shuts out half the sky.
 */
export function deckCells(alongs: readonly number[], xs: readonly number[], edge: (a: number) => number, y: (a: number, x: number) => number, holes: readonly Rect[], reach = Infinity) {
  const top = deckGrid(alongs, xs, edge, y);
  const centre = (i: number, j: number) => [(alongs[i]! + alongs[i + 1]!) / 2, (xs[j]! + xs[j + 1]!) / 2] as const;
  const keep = (i: number, j: number) => {
    const [a, x] = centre(i, j);
    return Math.abs(x) < Math.min(edge(alongs[i]!), edge(alongs[i + 1]!)) + reach && top[i]![j + 1]!.x - top[i]![j]!.x > EPSILON && !holes.some((r) => inside(r, a, x));
  };
  const ao = (i: number, j: number) => CORNER_AO + (1 - CORNER_AO) * Math.min(1, (edge(alongs[i]!) - Math.abs(top[i]![j]!.x)) / CORNER_REACH);
  return { top, centre, keep, ao };
}

/** A deck's underside, `thick` under its top, each cell drawn in the zone of the room under it (none: left out). */
export function deckUnderside(ctx: DeckContext, alongs: readonly number[], xs: readonly number[], edge: (a: number) => number, y: (a: number, x: number) => number, cells: ReturnType<typeof deckCells>, level: Level): void {
  const { plan, zones, parts } = ctx;
  const under = deckGrid(alongs, xs, edge, y);
  sheet((i, j) => {
    const [a, x] = cells.centre(i, j), z = zoneUnder(plan, zones, level, a, x);
    return z ? parts.zone(z).wood : null;
  }, under, DECK_BELOW, (i, j) => [shipZ(alongs[i]!), under[i]![j]!.x], cells.keep, true);
}

/** Cuts across a deck: every edge of the openings and spaces, and of the partners. */
function acrossCuts(plan: ShipPlan): number[] {
  return rowsOf([...plan.openings.flatMap((o) => [o.port, o.starboard]), ...plan.spaces.flatMap((s) => [s.port, s.starboard]), -PARTNERS / 2, PARTNERS / 2].filter((x) => Math.abs(x) < MOST_HALF));
}
/** Cuts along her: every edge of the openings and spaces, and of the partners. */
function alongCuts(plan: ShipPlan): number[] {
  return [...plan.openings.flatMap((o) => [o.aft, o.fore]), ...plan.spaces.flatMap((s) => [s.aft, s.fore]), ...Object.values(MASTS).flatMap((m) => [m.along - PARTNERS / 2, m.along + PARTNERS / 2])];
}

/** The weather deck's edge at a place along her: under her side planking, where it is let in. */
const deckEdge = (a: number) => hullHalfBreadth(a, sheer(a)) + LET_IN;

/** The weather deck: planks from waterway to waterway, cut for every opening and the masts, and its underside. */
export function buildWeatherDeck(ctx: DeckContext, deckAft: number, deckFore: number, rowStep = ROW_STEP): void {
  const { plan, parts } = ctx;
  const alongs = rowsAlong(deckAft, deckFore, rowStep, alongCuts(plan)).reverse();
  const xs = steps(-MOST_HALF, MOST_HALF, rowStep, acrossCuts(plan));
  const holes = [...openingsOn(plan, 'weather'), ...Object.values(MASTS).map((m) => partners(m.along))];
  const cells = deckCells(alongs, xs, deckEdge, weatherDeck, holes, rowStep), { top } = cells;
  sheet(parts.zone(OUTSIDE).wood, top, { ...DECK, damage: DAMAGE.weatherDeck }, (i, j) => [shipZ(alongs[i]!), top[i]![j]!.x], cells.keep, false, cells.ao);
  deckUnderside(ctx, alongs, xs, deckEdge, (a, x) => weatherDeck(a, x) - PLANKING.deck, cells, 'berth');
}

/** The partners round each mast on the weather deck, with the tarred coat that keeps the water out (the masts are N3.6's). */
export function buildPartners(out: ZoneParts): void {
  for (const m of Object.values(MASTS)) {
    const deck = shipY(weatherDeck(m.along, 0)), z = shipZ(m.along), r = m.diameter / 2;
    box(out.wood, new Matrix4().makeTranslation(0, deck + PARTNERS_RISE / 2 - PLANKING.deck / 2, z), [PARTNERS, PARTNERS_RISE + PLANKING.deck, PARTNERS], OAK, BEVEL, 0);
    const base = deck + PARTNERS_RISE;
    const coat: [number, number][] = [[r + COAT.out, 0], [r + COAT.out / 2, COAT.up * COAT.knee], [r, COAT.up]];
    latheAt(out, z, base, coat);
  }
}
function latheAt(out: ZoneParts, z: number, base: number, profile: [number, number][]): void {
  lathe(out.wood, new Matrix4().makeTranslation(0, base, z), profile, SIDES, TAR);
}

/**
 * The weather deck's beams, cambered, three to a port, each cut where it crosses an opening or a mast, with the
 * carlings along the openings' sides and hanging knees down her sides. Each piece is drawn in the zone below it.
 */
export function buildDeckBeams(ctx: DeckContext, deckAft: number, deckFore: number): void {
  const { plan, zones, parts } = ctx;
  const holes = [...plan.openings.filter((o) => o.level === 'weather'), ...Object.values(MASTS).map((m) => partners(m.along))];
  const cuts = acrossCuts(plan);
  const first = Math.ceil((deckAft + DECK_BEAM.sided) / DECK_BEAM.spacing), last = Math.floor((deckFore - DECK_BEAM.sided) / DECK_BEAM.spacing);
  for (let k = first; k <= last; k++) {
    const a = k * DECK_BEAM.spacing, a0 = a - DECK_BEAM.sided / 2, a1 = a + DECK_BEAM.sided / 2;
    const beamH = sheer(a) - PLANKING.deck - DECK_BEAM.moulded;
    const inner = ceilingX(a, beamH);
    if (inner < DECK_BEAM.sided) continue;
    // Where it crosses a hole, the beam stops at the hole's sides (the carlings take it there).
    let spans: [number, number][] = [[-inner, inner]];
    for (const h of holes) {
      if (a1 <= h.aft || a0 >= h.fore) continue;
      spans = spans.flatMap(([p, q]): [number, number][] => (q <= h.port || p >= h.starboard ? [[p, q]] : [[p, Math.min(q, h.port)], [Math.max(p, h.starboard), q]].filter(([u, v]) => v - u > EPSILON) as [number, number][]));
    }
    for (const [p, q] of spans) {
      // Split at the spaces' sides below, so each piece goes to its own zone.
      const xs = steps(p, q, ROW_STEP, cuts);
      for (let j = 0; j < xs.length - 1; j++) {
        const z = zoneUnder(plan, zones, 'berth', a, (xs[j]! + xs[j + 1]!) / 2);
        if (z) bentBeam(parts.zone(z), [xs[j]!, (xs[j]! + xs[j + 1]!) / 2, xs[j + 1]!], a0, a1, DECK_BEAM.moulded, (x) => weatherDeck(a, x) - PLANKING.deck);
      }
    }
    // Hanging knees: an arm under the beam's end and an arm down her side.
    for (const side of [1, -1]) {
      const z = zoneUnder(plan, zones, 'berth', a, side * (inner - KNEE_ARM));
      if (!z) continue;
      const solid = parts.zone(z).wood, y = shipY(weatherDeck(a, inner) - PLANKING.deck - DECK_BEAM.moulded) - CARLING.moulded / 2;
      box(solid, new Matrix4().makeTranslation(side * (inner - KNEE_ARM / 2), y, shipZ(a)), [KNEE_ARM, CARLING.moulded, CARLING.sided], OAK, SMALL_BEVEL, 0);
      box(solid, new Matrix4().makeTranslation(side * (inner - CARLING.sided / 2), y - KNEE_DROP / 2, shipZ(a)), [CARLING.sided, KNEE_DROP, CARLING.sided], OAK, SMALL_BEVEL, 1);
    }
  }
  // The carlings along each weather opening's sides, from beam to beam.
  for (const o of openingsOn(plan, 'weather')) {
    for (const side of [1, -1]) {
      const x = side > 0 ? o.starboard + CARLING.sided / 2 : o.port - CARLING.sided / 2, mid = (o.aft + o.fore) / 2;
      const z = zoneUnder(plan, zones, 'berth', mid, x);
      if (!z) continue;
      const from = o.aft - DECK_BEAM.sided, to = o.fore + DECK_BEAM.sided;
      const y = shipY(weatherDeck(mid, x) - PLANKING.deck) - CARLING.moulded / 2;
      box(parts.zone(z).wood, new Matrix4().makeTranslation(x, y, shipZ((from + to) / 2)), [CARLING.sided, CARLING.moulded, to - from], OAK, SMALL_BEVEL, 2);
    }
  }
}

/** A beam whose top follows a deck's round: `xs` across, along from a0 to a1 (m forward of the mast), `depth` deep, its top at `top(x)` above the base. */
export function bentBeam(z: ZoneParts, xs: readonly number[], a0: number, a1: number, depth: number, top: (x: number) => number): void {
  const rows = (a: number, dy: number) => xs.map((x) => new Vector3(x, shipY(top(x)) - dy, shipZ(a)));
  const uv = (i: number, j: number): [number, number] => [xs[j]!, i * depth];
  // Underside, and the two faces fore and aft (a1 is forward: smaller z).
  sheet(z.wood, [rows(a1, depth), rows(a0, depth)], OAK, uv, () => true, true);
  sheet(z.wood, [rows(a1, 0), rows(a1, depth)], OAK, uv, () => true, true);
  sheet(z.wood, [rows(a0, 0), rows(a0, depth)], OAK, uv, () => true, false);
}

/** The deck's height under an opening's middle, and the level's floor (above the base). */
type DeckAt = (along: number, across: number) => number;

/**
 * An opening's coamings: standing on its deck to their height and running down through it to under the carlings.
 * The part above the deck is drawn in the zone above, the part below in the zone below.
 */
export function buildCoamings(above: ZoneParts, below: ZoneParts | null, o: Opening, deckAt: DeckAt, thick: number, height = o.coaming): void {
  const mid = (o.aft + o.fore) / 2, len = o.fore - o.aft, w = o.starboard - o.port, cx = (o.port + o.starboard) / 2;
  const deck = deckAt(mid, cx), topY = shipY(deck + height), deckY0 = shipY(deck), underY = shipY(deck - PLANKING.deck - CARLING.moulded);
  const zc = shipZ(mid);
  const pieces = (z: ZoneParts, y0: number, y1: number) => {
    const h = y1 - y0, y = (y0 + y1) / 2;
    for (const dz of [-(len + thick) / 2, (len + thick) / 2]) box(z.wood, new Matrix4().makeTranslation(cx, y, zc + dz), [w + 2 * thick, h, thick], OAK, BEVEL, 0);
    for (const dx of [-(w + thick) / 2, (w + thick) / 2]) box(z.wood, new Matrix4().makeTranslation(cx + dx, y, zc), [thick, h, len], OAK, BEVEL, 2);
  };
  pieces(above, deckY0 - PLANKING.deck / 2, topY);
  if (below) pieces(below, underY, deckY0 - PLANKING.deck / 2);
}

/** A grating over an opening at its coaming's top: battens along her, ledges across, flush on top, holes between. */
export function buildGrating(z: ZoneParts, o: Opening, topH: number): void {
  const len = o.fore - o.aft, w = o.starboard - o.port, cx = (o.port + o.starboard) / 2, zc = shipZ((o.aft + o.fore) / 2);
  const pitch = GRATING.bar + GRATING.hole, nx = Math.floor(w / pitch), nz = Math.floor(len / pitch);
  const gy = shipY(topH) - GRATING.depth / 2, ledge = GRATING.depth / 2;
  for (let i = 0; i <= nx; i++) {
    const x = cx - w / 2 + GRATING.bar / 2 + (i * (w - GRATING.bar)) / nx;
    box(z.wood, new Matrix4().makeTranslation(x, gy, zc), [GRATING.bar, GRATING.depth, len], { ...OAK, seed: i }, SMALL_BEVEL / 2, 2);
  }
  for (let k = 0; k <= nz; k++) {
    const zz = shipZ(o.fore) + GRATING.bar / 2 + (k * (len - GRATING.bar)) / nz;
    box(z.wood, new Matrix4().makeTranslation(cx, gy - ledge / 2, zz), [w, ledge, GRATING.bar], { ...OAK, seed: k + nx }, SMALL_BEVEL / 2, 0);
  }
}

/** The companion's hood over its ladder: boards on three sides, open on the side its ladder is stepped onto, a roof on top. */
export function buildHood(z: ZoneParts, o: Opening, open: 'port' | 'starboard' | 'fore' | 'aft', thick: number): void {
  const { along: mid, across: cx } = rectCentre(o), deck = weatherDeck(mid, cx);
  const len = o.fore - o.aft + 2 * thick, w = o.starboard - o.port + 2 * thick, top = shipY(deck + o.coaming);
  // The coamings stand all round; the hood's boards above them close all but the open side.
  const base = shipY(deck), h = top - base, y = (top + base) / 2, zc = shipZ(mid);
  const walls: [string, Matrix4, [number, number, number]][] = [
    ['fore', new Matrix4().makeTranslation(cx, y, shipZ(o.fore) - thick / 2), [w, h, HOOD.board]],
    ['aft', new Matrix4().makeTranslation(cx, y, shipZ(o.aft) + thick / 2), [w, h, HOOD.board]],
    ['port', new Matrix4().makeTranslation(o.port - thick / 2, y, zc), [HOOD.board, h, len]],
    ['starboard', new Matrix4().makeTranslation(o.starboard + thick / 2, y, zc), [HOOD.board, h, len]],
  ];
  for (const [side, m, size] of walls) if (side !== open) box(z.wood, m, size, BLACK, SMALL_BEVEL, 1);
  box(z.wood, new Matrix4().makeTranslation(cx, top + HOOD.roof / 2, zc), [w + 2 * HOOD.overhang, HOOD.roof, len + 2 * HOOD.overhang], BLACK, BEVEL, 2);
}

/** The skylight: its coaming and two glazed lids pitched like a roof, with bars across the glass. */
export function buildSkylight(z: ZoneParts, o: Opening): void {
  const { along: mid, across: cx } = rectCentre(o), deck = weatherDeck(mid, cx);
  const len = o.fore - o.aft, w = o.starboard - o.port, top = shipY(deck + o.coaming), zc = shipZ(mid);
  const half = w / 2, slope = half / Math.cos(SKYLIGHT.pitch), rise = half * Math.tan(SKYLIGHT.pitch);
  for (const side of [1, -1]) {
    const lid = new Matrix4().makeTranslation(cx + (side * half) / 2, top + rise / 2, zc).multiply(new Matrix4().makeRotationZ(-side * SKYLIGHT.pitch));
    box(z.iron, lid, [slope, SKYLIGHT.bar, len], GLASS, 0, 2);
    // The frame round the glass and the bars across it.
    for (const dz of [-(len - SKYLIGHT.frame) / 2, (len - SKYLIGHT.frame) / 2]) box(z.wood, lid.clone().multiply(new Matrix4().makeTranslation(0, SKYLIGHT.bar, dz)), [slope, SKYLIGHT.frame / 2, SKYLIGHT.frame], OAK, SMALL_BEVEL, 0);
    for (let b = 1; b <= SKYLIGHT.bars; b++) {
      const dz = -len / 2 + (b * len) / (SKYLIGHT.bars + 1);
      box(z.wood, lid.clone().multiply(new Matrix4().makeTranslation(0, SKYLIGHT.bar, dz)), [slope, SKYLIGHT.bar, SKYLIGHT.bar], OAK, SMALL_BEVEL, 0);
    }
  }
  // The ridge.
  box(z.wood, new Matrix4().makeTranslation(cx, top + rise, zc), [SKYLIGHT.frame, SKYLIGHT.frame, len], OAK, SMALL_BEVEL, 2);
}

/** The weather deck's openings: coamings above and below, gratings on the hatches, the companion's hood, the skylight. */
export function buildDeckOpenings(ctx: DeckContext, coamingThick: number): void {
  const { plan, zones, parts } = ctx;
  const out = parts.zone(OUTSIDE);
  for (const o of openingsOn(plan, 'weather')) {
    const { along: mid, across: cx } = rectCentre(o);
    const bz = zoneUnder(plan, zones, 'berth', mid, cx);
    const below = bz ? parts.zone(bz) : null;
    if (o.kind === 'companion') {
      buildCoamings(out, below, o, weatherDeck, coamingThick, COAMING_UNDER_HOOD);
      buildHood(out, o, 'starboard', coamingThick);
    } else if (o.kind === 'skylight') {
      buildCoamings(out, below, o, weatherDeck, coamingThick);
      buildSkylight(out, o);
    } else {
      buildCoamings(out, below, o, weatherDeck, coamingThick);
      if (o.kind !== 'hatch') continue;
      const top = weatherDeck(mid, cx) + o.coaming;
      if (ctx.far) box(out.wood, new Matrix4().makeTranslation(cx, shipY(top) - GRATING.depth / 2, shipZ(mid)), [o.starboard - o.port, GRATING.depth, o.fore - o.aft], { ...OAK, rgb: GRATING_FAR }, 0, 0);
      else buildGrating(out, o, top);
    }
  }
}
/** A grating seen from far off: its holes' dark through its bars. */
const GRATING_FAR = [0.035, 0.026, 0.018] as const;
/** Under the companion's hood its coaming is a deck coaming's height; the hood's boards stand on it. */
const COAMING_UNDER_HOOD = 0.3;
