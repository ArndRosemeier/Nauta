/**
 * Her stern, as the draught ZAZ4607 draws it (sheer plan and the body plan's stern board): outside, the stern board
 * planked across from the wing transom to the taffrail, black, with the moulding where the counter meets it, the two
 * square windows under the quarterdeck (N2.12) and the quarter pieces at its corners; inside, red as her bulwarks are, from the deck's after
 * end up to the taffrail, her bulwarks carried aft along her quarters to meet it, the rail over them and the taffrail
 * across the top. And her rudder, hung on the sternpost by its pintles, in a group of its own that her helm turns
 * (ShipView `setRudder`, `rudderMatrix`).
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { BULWARK, KEEL_HALF_SIDING, PLANKING, RUDDER_BLADE, STERN, STERN_BOARD, TRANSOM } from '../../sim/rules/ships';
import { RUDDER } from '../../sim/rules/sailing';
import { HULL_AFT, designWaterline, hullBottom, hullEnds, sideTop, weatherDeck } from '../../sim/ship/hull';
import { linearCurve, monotoneCurve } from '../../sim/curve';
import { shipY, shipZ } from '../../sim/ship/section';
import { box, facing, rod, roundedProfile, sweep } from './shapes';
import type { ZoneParts } from './parts';
import { BLACK, BULWARK_BOARDS, COPPER, GLASS, IRON, OCHRE, RED, SIDE_PLANKS } from './looks';
import {
  BEVEL, BULWARK_THICK, COPPER_ABOVE_WATER, CORNER_AO, CORNER_REACH, EPSILON, SMALL_BEVEL, bulwarkInside, outsideX, steps,
} from './hullSide';

/** The id her rudder's parts are built under (ShipParts `swing`) and found by in the build. */
export const RUDDER_ID = 'rudder';

/** Rows up the stern board and its inside, at most this far apart, m. */
const ROW_STEP = 0.14;
/** Columns across the stern between its sides at most this far apart, m, inside this half-breadth (the board's sides follow her outline beyond it). */
const COLUMN_STEP = 0.36;
const INNER_REACH = 2.2;
/** The rows of the inside start this far above the deck's crown at her after end, m (below it the inside runs straight down to the deck's edge). */
const FOOT_RISE = 0.05;
/** Rows up her quarters' bulwarks. */
const QUARTER_ROWS = 8;
/** The moulding across the stern board: its depth and how far it stands proud, m. */
const MOULDING = { deep: 0.1, proud: 0.06 } as const;
/** The quarter pieces at the stern board's corners: their radius, how far above the taffrail their heads stand, the heads' radius and height, m; sides round. */
const QUARTER_PIECE = { radius: 0.09, above: 0.14, head: 0.12, headHigh: 0.16, sides: 10 } as const;
/** Her rudder hangs this far aft of the sternpost's face, m. */
const RUDDER_GAP = 0.02;
/** Rows up her rudder at most this far apart, m. */
const RUDDER_STEP = 0.5;
/** The pintles' straps on her rudder and the gudgeons' on the sternpost: how far each reaches from the hinge line, how high and thick it is, m. */
const STRAP = { onRudder: 0.5, onPost: 0.35, high: 0.08, thick: 0.015 } as const;
/** Half a breadth or a thickness. */
const HALF = 1 / 2;

/** The stern board's outside half-breadth at a height, planking on. */
const TRANSOM_HALF = monotoneCurve(TRANSOM.outline.map((r) => r[0]), TRANSOM.outline.map((r) => r[1]));
const boardHalf = (h: number): number => TRANSOM_HALF(h) + PLANKING.side;
/** The stern board's outside at a height: z ship space. */
const boardZ = (h: number): number => shipZ(hullEnds(h).aft) + PLANKING.side;
/** The taffrail's height, m above the base: the top of her stern, her quarterdeck's rail (N2.12; above the draught's counter the board stands upright). */
const TOP = sideTop(HULL_AFT);
/** The windows' glass is set this far in from the board's face, m. */
const GLASS_IN = 0.08;

/** The sternpost's after face, m forward of the mainmast at a height (straight from its foot to the wing transom). */
const POST = STERN.filter(([h]) => h <= TRANSOM.wing + EPSILON);
const postAlong = linearCurve(POST.map((r) => r[0]), POST.map((r) => r[1]));
/** Her rudder's hinge line: its foot (ship space) and its direction up the sternpost. */
const HINGE_FOOT = new Vector3(0, shipY(POST[0]![0]), shipZ(POST[0]![1] - RUDDER_GAP));
const HINGE_UP = new Vector3(0, shipY(POST[POST.length - 1]![0]), shipZ(POST[POST.length - 1]![1] - RUDDER_GAP)).sub(HINGE_FOOT).normalize();
/** Her rudder's breadth up from the heel: broad below, narrowing to the head under the wing transom. */
const BLADE = RUDDER_BLADE.breadth, HANCE = TRANSOM.wing - BLADE.hance.below, NECK = TRANSOM.wing - BLADE.neck.below;
const BREADTH = linearCurve([BLADE.heel[0], HANCE, NECK], [BLADE.heel[1], BLADE.hance.breadth, BLADE.neck.breadth]);

/** A box's frame: its middle at a point, ship space, square to her axes. */
const centredAt = (x: number, y: number, z: number): Matrix4 => new Matrix4().setPosition(x, y, z);

/** Columns across the stern at a half-breadth: its two sides and fixed places between, with cuts at the windows' sides. */
function columnsAcross(half: number): number[] {
  const p = STERN_BOARD.windows, cuts = [-1, 1].flatMap((s) => [s * (p.across - p.width * HALF), s * (p.across + p.width * HALF)]);
  return [-half, ...steps(-INNER_REACH, INNER_REACH, COLUMN_STEP, cuts), half];
}

/** Whether a cell between two heights and two places across lies in a stern window. */
function inWindow(h0: number, h1: number, x0: number, x1: number): boolean {
  const p = STERN_BOARD.windows, h = (h0 + h1) * HALF, x = Math.abs((x0 + x1) * HALF);
  return h > p.sill && h < p.top && x > p.across - p.width * HALF && x < p.across + p.width * HALF;
}

/** Where the inside of her stern stands: the deck's after end, the inside's top (m forward of the mainmast) and its height there. */
function insideLine(deckAft: number): { along: (h: number) => number; height: (along: number) => number; foot: number; top: number; topAlong: number } {
  // Her stern's thickness in from the board, but never forward of the deck's end: there (her raised quarterdeck reaching
  // well aft over the counter, N2.12) the inside stands upright.
  const topAlong = Math.min(HULL_AFT + BULWARK_THICK, deckAft), top = sideTop(topAlong), foot = weatherDeck(deckAft, bulwarkInside(deckAft, sideTop(deckAft)));
  const lean = topAlong - deckAft;
  const along = (h: number) => deckAft + ((h - foot) / (top - foot)) * lean;
  const height = (a: number) => (lean === 0 ? top : foot + ((a - deckAft) / lean) * (top - foot));
  return { along, height, foot, top, topAlong };
}

/** Her stern above the wing transom, outside and in, and the rails over it; `deckAft` is the weather deck's after end. */
export function buildStern(out: ZoneParts, deckAft: number): void {
  const line = insideLine(deckAft);
  buildBoard(out);
  buildInside(out, deckAft, line);
  buildQuarters(out, deckAft, line);
  // The taffrail across the top, over the inside's top and the board's: black, as her rails are.
  const zIn = shipZ(line.topAlong), zOut = boardZ(TOP), y0 = shipY(line.top), y1 = shipY(TOP) + BULWARK.railThick;
  box(out.wood, centredAt(0, (y0 + y1) * HALF, (zIn + zOut) * HALF), [2 * boardHalf(TOP), y1 - y0, zOut - zIn], BLACK, BEVEL, 0);
}

/** The stern board outside: planked across, black, its windows glazed, the moulding, the quarter pieces. */
function buildBoard(out: ZoneParts): void {
  const p = STERN_BOARD.windows;
  const hs = steps(TRANSOM.wing, TOP, ROW_STEP, [...STERN.map((r) => r[0]), p.sill, p.top]);
  const grid = hs.map((h) => columnsAcross(boardHalf(h)).map((x) => new Vector3(x, shipY(h), boardZ(h))));
  facing(out.wood, grid, SIDE_PLANKS(BLACK), (i, j) => [grid[i]![j]!.x, hs[i]!], new Vector3(0, 0, 1),
    (i, j) => !inWindow(hs[i]!, hs[i + 1]!, grid[i]![j]!.x, grid[i]![j + 1]!.x));
  buildWindows(out);
  // The moulding where the counter meets the upright stern.
  const m = STERN_BOARD.moulding;
  box(out.wood, centredAt(0, shipY(m), boardZ(m) + MOULDING.proud * HALF), [2 * boardHalf(m), MOULDING.deep, MOULDING.proud], OCHRE, SMALL_BEVEL, 0);
  // The quarter pieces up the board's corners from the moulding to above the taffrail, a round head on each.
  for (const s of [1, -1]) {
    const foot = new Vector3(s * boardHalf(m), shipY(m), boardZ(m)), head = new Vector3(s * boardHalf(TOP), shipY(TOP) + QUARTER_PIECE.above, boardZ(TOP));
    rod(out.wood, foot, head, QUARTER_PIECE.radius, QUARTER_PIECE.sides, BLACK);
    const up = new Vector3().subVectors(head, foot).normalize().multiplyScalar(QUARTER_PIECE.headHigh);
    rod(out.wood, head, head.clone().add(up), QUARTER_PIECE.head, QUARTER_PIECE.sides, OCHRE);
  }
}

/** The stern windows: their linings from the board's face in to the glass, red, and the glass. */
function buildWindows(out: ZoneParts): void {
  const p = STERN_BOARD.windows;
  for (const s of [1, -1]) {
    const x0 = s * p.across - p.width * HALF, x1 = s * p.across + p.width * HALF;
    const at = (x: number, h: number, outside: boolean) => new Vector3(x, shipY(h), boardZ(h) - (outside ? 0 : GLASS_IN));
    const faces: [Vector3[][], Vector3][] = [
      [[[at(x0, p.sill, true), at(x1, p.sill, true)], [at(x0, p.sill, false), at(x1, p.sill, false)]], new Vector3(0, 1, 0)],
      [[[at(x0, p.top, true), at(x1, p.top, true)], [at(x0, p.top, false), at(x1, p.top, false)]], new Vector3(0, -1, 0)],
      [[[at(x0, p.sill, true), at(x0, p.top, true)], [at(x0, p.sill, false), at(x0, p.top, false)]], new Vector3(1, 0, 0)],
      [[[at(x1, p.sill, true), at(x1, p.top, true)], [at(x1, p.sill, false), at(x1, p.top, false)]], new Vector3(-1, 0, 0)],
    ];
    for (const [rows, want] of faces) facing(out.wood, rows, RED, (i, j) => [i * GLASS_IN, j * p.width], want);
    facing(out.wood, [[at(x0, p.sill, false), at(x0, p.top, false)], [at(x1, p.sill, false), at(x1, p.top, false)]], GLASS, (i, j) => [i * p.width, j * (p.top - p.sill)], new Vector3(0, 0, 1));
  }
}

/** The stern's inside: from the quarterdeck's after edge up to the taffrail, red. */
function buildInside(out: ZoneParts, deckAft: number, line: ReturnType<typeof insideLine>): void {
  const crown = weatherDeck(deckAft, 0) + FOOT_RISE;
  const hs = steps(crown, line.top, ROW_STEP);
  const insideHalf = (h: number) => bulwarkInside(line.along(h), h);
  // The first row stands on the deck's after edge, following its camber; the rest up the inside's line.
  const foot = columnsAcross(bulwarkInside(deckAft, line.foot)).map((x) => new Vector3(x, shipY(weatherDeck(deckAft, Math.abs(x))), shipZ(deckAft)));
  const grid = [foot, ...hs.map((h) => columnsAcross(insideHalf(h)).map((x) => new Vector3(x, shipY(h), shipZ(line.along(h)))))];
  const heights = [line.foot, ...hs];
  facing(out.wood, grid, BULWARK_BOARDS, (i, j) => [grid[i]![j]!.x, heights[i]! - line.foot], new Vector3(0, 0, -1),
    () => true,
    (i) => CORNER_AO + (1 - CORNER_AO) * Math.min(1, (heights[i]! - line.foot) / CORNER_REACH));
}

/** Her bulwarks carried aft along her quarters, aft of the deck's end, to meet the stern's inside; the rail on top. */
function buildQuarters(out: ZoneParts, deckAft: number, line: ReturnType<typeof insideLine>): void {
  const alongs = steps(line.topAlong, deckAft, ROW_STEP).reverse();
  // Her inside standing upright at the deck's end, there is nothing aft of it to carry them along.
  if (alongs.length < 2) return;
  for (const side of [1, -1]) {
    const hss = alongs.map((a) => [...Array(QUARTER_ROWS + 1).keys()].map((k) => line.height(a) + ((sideTop(a) - line.height(a)) * k) / QUARTER_ROWS));
    const grid = hss.map((hs, i) => hs.map((h) => new Vector3(side * bulwarkInside(alongs[i]!, h), shipY(h), shipZ(alongs[i]!))));
    facing(out.wood, grid, BULWARK_BOARDS, (i, j) => [shipZ(alongs[i]!), hss[i]![j]! - line.foot], new Vector3(-side, 0, 0), () => true,
      (i, j) => CORNER_AO + (1 - CORNER_AO) * Math.min(1, (hss[i]![j]! - line.height(alongs[i]!)) / CORNER_REACH));
    const rail = alongs.map((a) => ({ x: side * (outsideX(a, sideTop(a)) - BULWARK_THICK * HALF - BULWARK.railWidth * HALF), y: shipY(sideTop(a)), z: shipZ(a) }));
    sweep(out.wood, rail, roundedProfile(BULWARK.railWidth, BULWARK.railThick, BEVEL), side, BLACK);
  }
}

/** Her rudder's blade at a height: its fore and after edges, m forward of the mainmast. */
const bladeAt = (h: number) => {
  const fore = postAlong(h) - RUDDER_GAP;
  return { fore, aft: fore - BREADTH(h) };
};

/**
 * Her rudder, in ship space as it hangs amidships: the blade from its heel up, broad below and narrowing to the head
 * that runs up under her counter, thick at the fore edge and thinner aft, coppered as far as her bottom is, its
 * pintles' straps across it; into `rudder` (turned by her helm). The gudgeons' straps on the sternpost go into `out`.
 */
export function buildRudder(rudder: ZoneParts, out: ZoneParts): void {
  const heel = BLADE.heel[0];
  const copperTop = designWaterline(postAlong(heel)) + COPPER_ABOVE_WATER;
  const t = RUDDER_BLADE.thick;
  // The head runs up into her counter: its fore edge above the wing transom, its after edge above the counter there.
  const fore = TRANSOM.wing + RUDDER_BLADE.intoCounter, head = { fore, aft: hullBottom(bladeAt(fore).aft) + RUDDER_BLADE.intoCounter };
  // Each row: its heights at the fore and after edges (the head's top follows her counter) and its edges along her.
  const row = (h: number) => ({ fore: h, aft: h, edge: bladeAt(h) });
  const top = { fore: head.fore, aft: head.aft, edge: { fore: bladeAt(head.fore).fore, aft: bladeAt(head.aft).aft } };
  const rows = [...steps(heel, NECK, RUDDER_STEP, [copperTop, HANCE]).map((h) => row(h)), top];
  const point = (r: (typeof rows)[number], s: number, aft: boolean) =>
    new Vector3(s * (aft ? t.aft : t.fore) * HALF, shipY(aft ? r.aft : r.fore), shipZ(aft ? r.edge.aft : r.edge.fore));
  for (const [lo, hi, solid, f] of [[heel, copperTop, rudder.copper, COPPER], [copperTop, Infinity, rudder.wood, SIDE_PLANKS(BLACK)]] as const) {
    const part = rows.filter((r) => r.fore >= lo - EPSILON && r.fore <= hi + EPSILON);
    if (part.length < 2) continue;
    const grainAt = (i: number, j: number): [number, number] => [part[i]!.fore, j];
    for (const s of [1, -1]) facing(solid, part.map((r) => [point(r, s, false), point(r, s, true)]), f, grainAt, new Vector3(s, 0, 0));
    facing(solid, part.map((r) => [point(r, -1, true), point(r, 1, true)]), f, grainAt, new Vector3(0, 0, 1));
    facing(solid, part.map((r) => [point(r, -1, false), point(r, 1, false)]), f, grainAt, new Vector3(0, 0, -1));
  }
  const bottom = rows[0]!;
  facing(rudder.copper, [[point(bottom, -1, false), point(bottom, -1, true)], [point(bottom, 1, false), point(bottom, 1, true)]], COPPER, (i, j) => [i, j], new Vector3(0, -1, 0));
  // The pintles' straps across the blade's fore part, and the gudgeons' on the sternpost they hang in.
  for (const h of RUDDER_BLADE.pintles) {
    const { fore } = bladeAt(h), f = h < copperTop ? COPPER : IRON, solid = h < copperTop ? rudder.copper : rudder.iron;
    const thick = t.fore + (t.aft - t.fore) * (STRAP.onRudder / BREADTH(h));
    box(solid, centredAt(0, shipY(h), shipZ(fore - STRAP.onRudder * HALF)), [thick + 2 * STRAP.thick, STRAP.high, STRAP.onRudder], f, SMALL_BEVEL, 0);
    box(h < copperTop ? out.copper : out.iron, centredAt(0, shipY(h), shipZ(postAlong(h) + STRAP.onPost * HALF)),
      [2 * KEEL_HALF_SIDING + 2 * STRAP.thick, STRAP.high, STRAP.onPost], f, SMALL_BEVEL, 0);
  }
}

const turn = new Matrix4(), shift = new Matrix4();
/** Her rudder's frame (ship space to ship space) put over `angle` rad (+: its after edge to starboard, turning her to starboard), held to its stops. */
export function rudderMatrix(angle: number, out = new Matrix4()): Matrix4 {
  const a = Math.max(-RUDDER.most, Math.min(RUDDER.most, angle));
  turn.makeRotationAxis(HINGE_UP, a);
  shift.makeTranslation(HINGE_FOOT.x, HINGE_FOOT.y, HINGE_FOOT.z);
  out.multiplyMatrices(shift, turn).multiply(shift.makeTranslation(-HINGE_FOOT.x, -HINGE_FOOT.y, -HINGE_FOOT.z));
  return out;
}
