/**
 * The slice (plan N2.0): a section of the brig's waist, about 7 m of her from just abaft the main shrouds to the
 * main hatch, built to the full quality wanted so Arnd can judge it on the iPad before the whole ship is built.
 * Everything is laid out from her measures (sim/rules/ships.ts) in ship space (sim/ship/section.ts). What it builds
 * that stays is the way her parts are built (shapes.ts, rope.ts), her material kinds and the fittings' specs; the
 * section itself is replaced by the real ship (N2.4).
 *
 * The slice ends in bulkheads fore and aft below the deck, like a builder's half-model cut through, so her inside
 * is closed and the berth deck stays dark but for the hatch and the lantern.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import {
  BERTH_HEADROOM, BULWARK, CARLING, CEILING, DECK_AT_SIDE, DECK_BEAM, FRAME_DEPTH, GRATING, LOAD_WATERLINE, MAIN_HATCH,
  PLANKING, PORT, RAIL_TOP, ROPE, STRAKE_WIDTH, WAIST_PORTS, WALE, WATERWAY,
} from '../../sim/rules/ships';
import { deckY, halfBreadth, sectionOutline, shipY, shipZ } from '../../sim/ship/section';
import { box, lathe, sheet } from './shapes';
import { Solid } from './solid';
import { Ropes, hanging } from './rope';
import { BERTH_DECK, BLACK, BUFF, DECK, DECK_BELOW, IRON, OAK, OCHRE, RED, SIDE_PLANKS } from './looks';
import { place, type Fittings } from './fittings';
import { buildRig, type RigParts } from './rig';

/** The slice's ends, m forward of the mainmast: abaft the aftmost main shroud, and forward of the main hatch. */
export const SLICE_AFT = -4.3;
export const SLICE_FORE = 2.6;
/** The longest step between rows of her side and deck along her length, m. */
const ROW_STEP = 0.3;
/** Rows this close are one, m. */
const SAME_ROW = 1e-4;
/** Two heights or positions this close are one, m. */
const EPSILON = 1e-6;
/** Girth between rows of her side's outline, m. */
const GIRTH_STEP = 0.07;
/** How far above the load waterline her copper reaches, m (a hand's breadth above, so she shows copper when she rolls). */
const COPPER_ABOVE_WATER = 0.28;
/** The ochre band: how far below the port sills and above the port tops it reaches, m. */
const BAND_BELOW_SILL = 0.09;
const BAND_ABOVE_TOP = 0.05;
/** How far the wales stand out beyond her planking, m. */
const WALE_PROUD = PLANKING.wale - PLANKING.side;
/** Rounding of timber edges, m: big timbers, small ones. */
const BEVEL = 0.02;
const SMALL_BEVEL = 0.008;
/** Ambient occlusion baked into surfaces in corners: where deck meets bulwark, under the waterway. */
const CORNER_AO = 0.55;
/** How far from a corner its shade reaches, m. */
const CORNER_REACH = 0.35;
/** The berth deck's beams' clear distance below the weather deck's beams, m, and their own depth (only their tops show). */
const BERTH_BEAM = 0.2;
/** The mast hole through the deck: the partners' square round the mast, m across, and how high the partners stand. */
const PARTNERS = 0.82;
const PARTNERS_RISE = 0.06;
/** The hanging knees at the beams' ends: how far down her side they reach, m, and how far along the beam. */
const KNEE_DROP = 0.55;
const KNEE_ARM = 0.5;
/** A port lid: how far it is swung up from shut (rad), its thickness, how much bigger than the port it is, m. */
const LID_OPEN = 1.35;
const LID_THICK = 0.075;
const LID_LAP = 0.05;
/** A lid is two layers of board: black outside, red inside, each half its thickness; a layer's middle sits this far from the lid's. */
const LID_LAYER = LID_THICK / 2;
/** The port lid's lanyard runs to a hole this far below the rail, m. */
const LID_LANYARD_BELOW_RAIL = 0.12;
/** The lanyard's sag, m, and its pieces. */
const LANYARD_SAG = 0.03;
const LANYARD_STEPS = 6;
/** The breeching: its ring bolts on the bulwark either side of the port (m from the port's middle, m above the deck), and its slack. */
const BREECHING_BOLT = { out: 0.62, up: 0.55, sag: 0.16, steps: 10 } as const;
/** The carronade's breeching ring in the pack's model space (Blender's [0, 0.97, 0.70] turned Y up, front +Z). */
const BREECHING_RING = new Vector3(0, 0.7, -0.97);
/** Ring bolts: ring radius and thickness, m. */
const RING_BOLT = { radius: 0.035, thick: 0.012 } as const;
/** The lantern on the berth deck: where it hangs (m forward of the mast, m from the centreline) and how far below the beam. */
const LANTERN_AT = { forward: 0.6, across: 0.9, below: 0.16 } as const;
/** The lantern's flame above its foot, m. */
const FLAME_ABOVE_FOOT = 0.14;
/** Sides of the iron rings. */
const RING_SIDES = 10;
/** The pack's lantern stands 0.436 m tall: its hanging ring's top. */
const LANTERN_HEIGHT = 0.436;
/** A quarter turn, rad. */
const QUARTER = Math.PI / 2;

/** The slice's drawn parts: one solid per kind, the ropes, and where her lights and places are (ship space). */
export interface SliceParts {
  readonly wood: Solid;
  readonly iron: Solid;
  readonly copper: Solid;
  readonly glow: Solid;
  readonly ropes: Ropes;
  /** The lantern's hook and its flame when hanging still (ship space). */
  readonly lanternHook: Vector3;
  readonly flame: Vector3;
  /** The hatch's opening: its middle at deck height and its size (m), for the light that falls below. */
  readonly hatch: { readonly centre: Vector3; readonly width: number; readonly length: number };
  /** The deck's height at the centreline and the berth deck's, ship-space y. */
  readonly deckY: number;
  readonly berthY: number;
  /** Where the slice ends, ship-space z. */
  readonly zFore: number;
  readonly zAft: number;
  readonly rig: RigParts;
}

/** Her outside's half-breadth at a height above the base: the moulded line, her planking, and the wales standing proud. */
function outsideX(aboveBase: number, wale: boolean): number {
  return halfBreadth(aboveBase) + PLANKING.side + (wale ? WALE_PROUD : 0);
}

/** The sorted, distinct numbers of a list (rows of a grid). */
function rowsOf(list: number[]): number[] {
  return [...list].sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1]! > SAME_ROW);
}

/** Steps from a to b no longer than `step`, both ends included, plus any `cuts` between. */
function steps(a: number, b: number, step: number, cuts: number[] = []): number[] {
  const n = Math.max(1, Math.ceil((b - a) / step)), out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return rowsOf([...out, ...cuts.filter((c) => c > a && c < b)]);
}

/** The heights above the base where her side changes finish or steps out: the copper, the wale, the band, the ports. */
function sideBreaks(): number[] {
  return [LOAD_WATERLINE + COPPER_ABOVE_WATER, WALE.lower, WALE.upper, PORT.sill - BAND_BELOW_SILL, PORT.sill, PORT.top, PORT.top + BAND_ABOVE_TOP];
}

/** How her outside is finished at a height above the base. */
function sideFinish(h: number) {
  if (h >= PORT.sill - BAND_BELOW_SILL && h < PORT.top + BAND_ABOVE_TOP) return SIDE_PLANKS(OCHRE);
  return SIDE_PLANKS(BLACK);
}

/**
 * Her outside from the keel to the rail, both sides: copper below the copper line, paint above, the wales standing
 * proud with a step at each edge, the gun ports cut through. Its u runs along her (m), v up her girth (m), so planking
 * strakes and the damage panels (N6.5) are laid out in girth from the first hull on.
 */
function buildSide(s: Solid, copper: Solid, zs: number[], ports: number[]): void {
  const railFoot = RAIL_TOP - BULWARK.railThick;
  const outline = sectionOutline(railFoot, GIRTH_STEP);
  const girthAt = (h: number) => {
    for (let i = 1; i < outline.length; i++) {
      const a = outline[i - 1]!, b = outline[i]!, h0 = a.y + LOAD_WATERLINE, h1 = b.y + LOAD_WATERLINE;
      if (h <= h1 + EPSILON) return a.girth + ((b.girth - a.girth) * (h - h0)) / Math.max(h1 - h0, EPSILON);
    }
    return outline[outline.length - 1]!.girth;
  };
  const bottom = outline[0]!.y + LOAD_WATERLINE;
  const cuts = [bottom, ...rowsOf(sideBreaks()), railFoot];
  const copperTop = LOAD_WATERLINE + COPPER_ABOVE_WATER;
  const isPort = (z0: number, z1: number) => ports.some((pz) => {
    const zc = shipZ(pz), half = PORT.width / 2;
    return z0 >= zc - half - EPSILON && z1 <= zc + half + EPSILON;
  });
  for (const side of [1, -1]) {
    // One sheet per band between breaks, so each finish ends on a crisp line and the wale steps out at its edges.
    for (let k = 0; k < cuts.length - 1; k++) {
      const h0 = cuts[k]!, h1 = cuts[k + 1]!, mid = (h0 + h1) / 2;
      const wale = mid > WALE.lower && mid < WALE.upper;
      const hs = [h0, ...outline.map((p) => p.y + LOAD_WATERLINE).filter((h) => h > h0 + EPSILON && h < h1 - EPSILON), h1];
      const grid = zs.map((z) => hs.map((h) => new Vector3(side * outsideX(h, wale), shipY(h), z)));
      const target = mid < copperTop ? copper : s;
      const finish = mid < copperTop ? SIDE_PLANKS(BLACK) : sideFinish(mid);
      const port = h0 >= PORT.sill - EPSILON && h1 <= PORT.top + EPSILON;
      sheet(target, grid, finish, (i, j) => [zs[i]!, girthAt(hs[j]!)], (i) => !(port && isPort(zs[i]!, zs[i + 1]!)), side > 0);
    }
    // The wale's edges: the step from her planking out to the wale's face.
    for (const h of [WALE.lower, WALE.upper]) {
      const inner = zs.map((z) => [new Vector3(side * outsideX(h, false), shipY(h), z), new Vector3(side * outsideX(h, true), shipY(h), z)]);
      sheet(s, inner, SIDE_PLANKS(BLACK), (i, j) => [zs[i]!, girthAt(h) + j * WALE_PROUD], () => true, (side > 0) !== (h === WALE.upper));
    }
  }
}

/** The bulwark's inside face from the waterway to the rail, both sides, with the ports through it and their linings. */
function buildBulwark(s: Solid, iron: Solid, zs: number[], ports: number[]): void {
  const thick = PLANKING.side + BULWARK.timber + BULWARK.insideBoard;
  const deckSide = DECK_AT_SIDE, railFoot = RAIL_TOP - BULWARK.railThick;
  const hs = steps(deckSide + WATERWAY.rise, railFoot, ROW_STEP, [PORT.sill, PORT.top]);
  const inX = (h: number) => outsideX(h, false) - thick;
  for (const side of [1, -1]) {
    const grid = zs.map((z) => hs.map((h) => new Vector3(side * inX(h), shipY(h), z)));
    const inPort = (i: number, j: number) => ports.some((pz) => {
      const zc = shipZ(pz), half = PORT.width / 2;
      return zs[i]! >= zc - half - EPSILON && zs[i + 1]! <= zc + half + EPSILON && hs[j]! >= PORT.sill - EPSILON && hs[j + 1]! <= PORT.top + EPSILON;
    });
    // Its boards run fore and aft, so the grain's v is the height; shade where it meets the deck.
    sheet(s, grid, { ...RED, plank: BULWARK.railWidth }, (i, j) => [zs[i]!, hs[j]!], (i, j) => !inPort(i, j), side < 0,
      (_i, j) => CORNER_AO + (1 - CORNER_AO) * Math.min(1, (hs[j]! - deckSide) / CORNER_REACH));
    // The rail on top, black, rounded.
    const railX = side * (outsideX(railFoot, false) - thick / 2);
    const len = shipZ(SLICE_AFT) - shipZ(SLICE_FORE);
    box(s, new Matrix4().makeTranslation(railX, shipY(RAIL_TOP - BULWARK.railThick / 2), (shipZ(SLICE_AFT) + shipZ(SLICE_FORE)) / 2), [BULWARK.railWidth, BULWARK.railThick, len], BLACK, BEVEL, 2);
    // Each port's linings: sill, head and cheeks through the bulwark's thickness.
    for (const pz of ports) {
      const zc = shipZ(pz), half = PORT.width / 2;
      const xo = (h: number) => side * outsideX(h, false), xi = (h: number) => side * inX(h);
      const faces: [Vector3, Vector3, Vector3, Vector3][] = [
        // sill (faces up), head (faces down), the two cheeks
        [new Vector3(xi(PORT.sill), shipY(PORT.sill), zc - half), new Vector3(xo(PORT.sill), shipY(PORT.sill), zc - half), new Vector3(xo(PORT.sill), shipY(PORT.sill), zc + half), new Vector3(xi(PORT.sill), shipY(PORT.sill), zc + half)],
        [new Vector3(xi(PORT.top), shipY(PORT.top), zc + half), new Vector3(xo(PORT.top), shipY(PORT.top), zc + half), new Vector3(xo(PORT.top), shipY(PORT.top), zc - half), new Vector3(xi(PORT.top), shipY(PORT.top), zc - half)],
        [new Vector3(xi(PORT.top), shipY(PORT.top), zc - half), new Vector3(xo(PORT.top), shipY(PORT.top), zc - half), new Vector3(xo(PORT.sill), shipY(PORT.sill), zc - half), new Vector3(xi(PORT.sill), shipY(PORT.sill), zc - half)],
        [new Vector3(xi(PORT.sill), shipY(PORT.sill), zc + half), new Vector3(xo(PORT.sill), shipY(PORT.sill), zc + half), new Vector3(xo(PORT.top), shipY(PORT.top), zc + half), new Vector3(xi(PORT.top), shipY(PORT.top), zc + half)],
      ];
      for (const f of faces) sheet(s, [[f[0], f[3]], [f[1], f[2]]], RED, (i, j) => [i * thick, j * PORT.width], () => true, side > 0);
      // The lid, hinged at the port's top outside, swung up; black outside, red inside.
      const hinge = new Vector3(xo(PORT.top) + side * LID_THICK / 2, shipY(PORT.top + LID_LAP), zc);
      const h = PORT.top - PORT.sill + 2 * LID_LAP, w = PORT.width + 2 * LID_LAP;
      const swing = new Matrix4().makeRotationZ(side * LID_OPEN);
      const lid = new Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z).multiply(swing).multiply(new Matrix4().makeTranslation(0, -h / 2, 0));
      box(s, lid.clone().multiply(new Matrix4().makeTranslation(side * LID_LAYER / 2, 0, 0)), [LID_LAYER, h, w], BLACK, SMALL_BEVEL, 1);
      box(s, lid.clone().multiply(new Matrix4().makeTranslation(-side * LID_LAYER / 2, 0, 0)), [LID_LAYER, h, w], RED, SMALL_BEVEL, 1);
      // Ring bolts either side of the port for the breeching.
      for (const dz of [-BREECHING_BOLT.out, BREECHING_BOLT.out]) {
        const at = new Vector3(side * (inX(deckSide + BREECHING_BOLT.up)), shipY(deckSide + BREECHING_BOLT.up), zc + dz);
        lathe(iron, new Matrix4().makeRotationZ(side * QUARTER).setPosition(at), ringProfile(), RING_SIDES, IRON);
      }
    }
  }
}

/** A ring bolt's ring as a turned profile (a short eye standing off the timber). */
function ringProfile(): [number, number][] {
  const r = RING_BOLT.radius, t = RING_BOLT.thick;
  return [[0, -t], [t, -t], [t, r], [r, r + t], [r, r + 2 * t], [0, r + 2 * t]];
}

/** The weather deck: planks from waterway to waterway, cut for the hatch and the mast, its underside, and its ends. */
function buildDeck(s: Solid, zs: number[], hatchZ: [number, number], hatchX: number): void {
  const deckSide = DECK_AT_SIDE;
  // The deck runs out over her frames to her side planking, where it is let in (no light between).
  const edge = halfBreadth(deckSide) + LET_IN;
  const xs = steps(-edge, edge, ROW_STEP, [-hatchX, hatchX, -PARTNERS / 2, PARTNERS / 2]);
  const hole = (i: number, j: number) => {
    const z0 = zs[i]!, z1 = zs[i + 1]!, x0 = xs[j]!, x1 = xs[j + 1]!;
    const inHatch = z0 >= hatchZ[0] - EPSILON && z1 <= hatchZ[1] + EPSILON && x0 >= -hatchX - EPSILON && x1 <= hatchX + EPSILON;
    const inMast = Math.abs(z0 + z1) / 2 < PARTNERS / 2 && x0 >= -PARTNERS / 2 - EPSILON && x1 <= PARTNERS / 2 + EPSILON;
    return inHatch || inMast;
  };
  const top = zs.map((z) => xs.map((x) => new Vector3(x, deckY(x), z)));
  const under = zs.map((z) => xs.map((x) => new Vector3(x, deckY(x) - PLANKING.deck, z)));
  // The deck shades toward the waterways, where the bulwark shuts out half the sky.
  const ao = (_i: number, j: number) => CORNER_AO + (1 - CORNER_AO) * Math.min(1, (edge - Math.abs(xs[j]!)) / CORNER_REACH);
  sheet(s, top, DECK, (i, j) => [zs[i]!, xs[j]!], (i, j) => !hole(i, j), false, ao);
  sheet(s, under, DECK_BELOW, (i, j) => [zs[i]!, xs[j]!], (i, j) => !hole(i, j), true);
  // The deck's cut ends: a strip of plank ends at each end of the slice.
  for (const z of [zs[0]!, zs[zs.length - 1]!]) {
    const strip = [xs.map((x) => new Vector3(x, deckY(x), z)), xs.map((x) => new Vector3(x, deckY(x) - PLANKING.deck, z))];
    sheet(s, strip, DECK_BELOW, (i, j) => [i * PLANKING.deck, xs[j]!], () => true, z < 0);
  }
  // The waterways along each side: a heavy timber the deck's edge runs into, rounded on its inner edge.
  const len = zs[zs.length - 1]! - zs[0]!;
  for (const side of [1, -1]) {
    const x = side * (halfBreadth(deckSide) - FRAME_DEPTH - CEILING + WATERWAY.width / 2);
    box(s, new Matrix4().makeTranslation(x, shipY(deckSide) + WATERWAY.rise / 2 - PLANKING.deck / 2, (zs[0]! + zs[zs.length - 1]!) / 2), [WATERWAY.width, WATERWAY.rise + PLANKING.deck, len], OAK, BEVEL * 2, 2, CORNER_AO);
  }
}

/** The beams under the weather deck, cambered, with carlings along the hatch, and hanging knees down her sides. */
function buildBeams(s: Solid, zFore: number, zAft: number, hatchZ: [number, number], hatchX: number): void {
  const inner = halfBreadth(DECK_AT_SIDE - PLANKING.deck - DECK_BEAM.moulded) - FRAME_DEPTH - CEILING;
  const xs = steps(-inner, inner, ROW_STEP, [-hatchX, hatchX]);
  const first = Math.ceil(zFore / DECK_BEAM.spacing), last = Math.floor(zAft / DECK_BEAM.spacing);
  for (let k = first; k <= last; k++) {
    const z = k * DECK_BEAM.spacing;
    if (Math.abs(z) < PARTNERS / 2) continue; // the partners take the beam's place at the mast (they are drawn as the mast's)
    const z0 = z - DECK_BEAM.sided / 2, z1 = z + DECK_BEAM.sided / 2;
    const cut = z1 > hatchZ[0] && z0 < hatchZ[1];
    for (const [a, b] of cut ? [[-inner, -hatchX], [hatchX, inner]] : [[-inner, inner]]) {
      const bx = xs.filter((x) => x >= a! - EPSILON && x <= b! + EPSILON);
      bentBeam(s, bx, z0, z1, DECK_BEAM.moulded);
    }
    // Hanging knees: an arm under the beam's end and an arm down her side.
    for (const side of [1, -1]) {
      const x = side * (inner - KNEE_ARM / 2), y = deckY(inner) - PLANKING.deck - DECK_BEAM.moulded - CARLING.moulded / 2;
      box(s, new Matrix4().makeTranslation(x, y, z), [KNEE_ARM, CARLING.moulded, CARLING.sided], OAK, SMALL_BEVEL, 0);
      box(s, new Matrix4().makeTranslation(side * (inner - CARLING.sided / 2), y - KNEE_DROP / 2, z), [CARLING.sided, KNEE_DROP, CARLING.sided], OAK, SMALL_BEVEL, 1);
    }
  }
  // The carlings framing the hatch's sides, and its head ledges fore and aft.
  for (const side of [1, -1]) {
    const x = side * (hatchX + CARLING.sided / 2);
    const y = deckY(hatchX) - PLANKING.deck - CARLING.moulded / 2;
    const zFrom = hatchZ[0] - DECK_BEAM.sided, zTo = hatchZ[1] + DECK_BEAM.sided;
    box(s, new Matrix4().makeTranslation(x, y, (zFrom + zTo) / 2), [CARLING.sided, CARLING.moulded, zTo - zFrom], OAK, SMALL_BEVEL, 2);
  }
}

/** A beam whose top follows the deck's round: `xs` across, z0..z1 along, `depth` deep. */
function bentBeam(s: Solid, xs: number[], z0: number, z1: number, depth: number): void {
  const topY = (x: number) => deckY(x) - PLANKING.deck;
  const rows = (z: number, dy: number) => xs.map((x) => new Vector3(x, topY(x) - dy, z));
  const uv = (i: number, j: number): [number, number] => [xs[j]!, i * depth];
  // Underside, and the two faces fore and aft.
  sheet(s, [rows(z0, depth), rows(z1, depth)], OAK, uv, () => true, true);
  sheet(s, [rows(z0, 0), rows(z0, depth)], OAK, uv, () => true, true);
  sheet(s, [rows(z1, 0), rows(z1, depth)], OAK, uv, () => true, false);
}

/** The berth deck below, its sides (the ceiling) up to the weather deck's beams, and the bulkheads that close the slice. */
function buildBelow(s: Solid, zs: number[], berthY: number): void {
  const zFore = zs[0]!, zAft = zs[zs.length - 1]!;
  const berthH = berthY + LOAD_WATERLINE, topH = DECK_AT_SIDE - PLANKING.deck;
  const inner = (h: number) => halfBreadth(h) - FRAME_DEPTH - CEILING;
  const half = inner(berthH);
  const xs = steps(-half, half, ROW_STEP);
  sheet(s, zs.map((z) => xs.map((x) => new Vector3(x, berthY, z))), BERTH_DECK, (i, j) => [zs[i]!, xs[j]!], () => true, false,
    (_i, j) => CORNER_AO + (1 - CORNER_AO) * Math.min(1, (half - Math.abs(xs[j]!)) / CORNER_REACH));
  // The ceiling on her frames, both sides.
  const hs = steps(berthH, topH, ROW_STEP);
  // Its top meets the deck's underside, which the camber lifts a little inboard of her side.
  const ceilingY = (h: number) => h < topH - EPSILON ? shipY(h) : deckY(inner(h)) - PLANKING.deck + LET_IN;
  for (const side of [1, -1]) {
    sheet(s, zs.map((z) => hs.map((h) => new Vector3(side * inner(h), ceilingY(h), z))), { ...OAK, plank: STRAKE_WIDTH }, (i, j) => [zs[i]!, hs[j]!], () => true, side < 0);
  }
  // Bulkheads at both ends, from the berth deck to the deck's underside, boards upright.
  for (const z of [zFore, zAft]) {
    const ys = steps(berthH, topH + DECK_CAMBER_ROOM, ROW_STEP);
    const grid = ys.map((h) => {
      const w = inner(Math.min(h, topH));
      return steps(-w, w, ROW_STEP).map((x) => new Vector3(x, Math.min(shipY(h), deckY(x) - PLANKING.deck), z));
    });
    // Rows must be the same length for a sheet: resample each to the widest count.
    const n = Math.max(...grid.map((r) => r.length));
    const even = grid.map((r) => Array.from({ length: n }, (_, k) => {
      const t = k / (n - 1), w = r[r.length - 1]!.x;
      const x = -w + 2 * w * t, h = r[0]!.y;
      return new Vector3(x, Math.min(h, deckY(x) - PLANKING.deck), z);
    }));
    sheet(s, even, { ...BUFF, plank: DECK_PLANK_WIDTH_UPRIGHT }, (i, j) => [ys[i]!, even[i]![j]!.x], () => true, z < 0);
  }
  // Below the berth deck the slice is shut by its cut faces: her section from keel to berth deck, dark timber.
  const low = sectionOutline(berthH, GIRTH_STEP);
  for (const z of [zFore, zAft]) {
    const rows = low.map((p) => [new Vector3(-p.x - PLANKING.side, p.y, z), new Vector3(p.x + PLANKING.side, p.y, z)]);
    sheet(s, rows, OAK, (i, j) => [low[i]!.girth, j], () => true, z > 0, () => CORNER_AO);
  }
  // The berth deck's beams are under its planks; only the weather deck's are seen from it.
  void BERTH_BEAM;
}

/** Room above the deck's side height for the bulkheads to reach the cambered underside, m. */
/** The grating's cross bars are let into the fore-and-aft bars from below, half their depth. */
const GRATING_LEDGE = GRATING.depth / 2;
/** Timbers that meet are let into each other this far, m, so no light shows at the joint. */
const LET_IN = 0.01;
const DECK_CAMBER_ROOM = 0.2;
/** Bulkhead boards stand upright, as wide as deck planks. */
const DECK_PLANK_WIDTH_UPRIGHT = 0.18;

/** The main hatch: coamings standing on the deck and running down through it, and the grating on top. */
function buildHatch(s: Solid, hatchZ: [number, number], hatchX: number): void {
  const zc = (hatchZ[0] + hatchZ[1]) / 2, len = hatchZ[1] - hatchZ[0], w = 2 * hatchX;
  const t = MAIN_HATCH.coamingThick, rise = MAIN_HATCH.coamingHeight;
  const base = deckY(hatchX) - PLANKING.deck - CARLING.moulded, topY = deckY(0) + rise;
  const height = topY - base, midY = (topY + base) / 2;
  // Fore and aft coamings run across her (the head ledges), the side coamings along her.
  for (const dz of [-(len + t) / 2, (len + t) / 2]) box(s, new Matrix4().makeTranslation(0, midY, zc + dz), [w + 2 * t, height, t], OAK, BEVEL, 0);
  for (const dx of [-(w + t) / 2, (w + t) / 2]) box(s, new Matrix4().makeTranslation(dx, midY, zc), [t, height, len], OAK, BEVEL, 2);
  // The grating: battens fore and aft, ledges across, flush on top, holes between.
  const pitch = GRATING.bar + GRATING.hole;
  const nx = Math.floor(w / pitch), nz = Math.floor(len / pitch);
  const gy = topY - GRATING.depth / 2;
  // The outer bars lie against the coamings, the holes between share what is left.
  for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + GRATING.bar / 2 + (i * (w - GRATING.bar)) / nx;
    box(s, new Matrix4().makeTranslation(x, gy, zc), [GRATING.bar, GRATING.depth, len], { ...OAK, seed: i }, SMALL_BEVEL / 2, 2);
  }
  for (let k = 0; k <= nz; k++) {
    const z = hatchZ[0] + GRATING.bar / 2 + (k * (len - GRATING.bar)) / nz;
    box(s, new Matrix4().makeTranslation(0, gy - GRATING_LEDGE / 2, z), [w, GRATING_LEDGE, GRATING.bar], { ...OAK, seed: k + nx }, SMALL_BEVEL / 2, 0);
  }
}

/** The carronades: one at each waist port inside the slice, on both sides, run out, with their breechings. */
function buildGuns(fittings: Fittings, wood: Solid, iron: Solid, ropes: Ropes, ports: number[]): void {
  const thick = PLANKING.side + BULWARK.timber + BULWARK.insideBoard;
  for (const side of [1, -1]) {
    for (const pz of ports) {
      const zc = shipZ(pz);
      const xIn = side * (outsideX(PORT.sill, false) - thick);
      const frame = new Matrix4().makeRotationY(side * QUARTER).setPosition(xIn, deckY(xIn), zc);
      place(fittings, 'prop_carronade_32', frame, { iron: { solid: iron, paint: 1 }, wood: { solid: wood, paint: 1, rgb: RED.rgb } }, pz);
      // The breeching: from a ring bolt by the port, through the ring on the cascabel, to the other.
      const ring = BREECHING_RING.clone().applyMatrix4(frame);
      for (const dz of [-BREECHING_BOLT.out, BREECHING_BOLT.out]) {
        const bolt = new Vector3(xIn, shipY(DECK_AT_SIDE + BREECHING_BOLT.up), zc + dz);
        ropes.line(hanging(bolt, ring, BREECHING_BOLT.sag, BREECHING_BOLT.steps), ROPE.breeching / 2, 0);
      }
      // The lid's lanyard, from its lower edge up through the bulwark under the rail.
      const lidH = PORT.top - PORT.sill + 2 * LID_LAP;
      const edge = new Vector3(side * (outsideX(PORT.top, false) + LID_THICK / 2), shipY(PORT.top + LID_LAP), zc)
        .add(new Vector3(side * Math.sin(LID_OPEN) * lidH, -Math.cos(LID_OPEN) * lidH, 0));
      const hole = new Vector3(side * outsideX(RAIL_TOP, false), shipY(RAIL_TOP - BULWARK.railThick - LID_LANYARD_BELOW_RAIL), zc);
      ropes.line(hanging(edge, hole, LANYARD_SAG, LANYARD_STEPS), ROPE.running / 2, 1);
    }
  }
}

/** The whole slice, from her measures and the fittings pack. */
export function buildSlice(fittings: Fittings): SliceParts {
  const wood = new Solid(), iron = new Solid(), copper = new Solid(), glow = new Solid(), ropes = new Ropes();
  const zFore = shipZ(SLICE_FORE), zAft = shipZ(SLICE_AFT);
  const ports = WAIST_PORTS.filter((p) => p - PORT.width / 2 > SLICE_AFT && p + PORT.width / 2 < SLICE_FORE);
  const hatchZ: [number, number] = [shipZ(MAIN_HATCH.at) - MAIN_HATCH.length / 2, shipZ(MAIN_HATCH.at) + MAIN_HATCH.length / 2];
  const hatchX = MAIN_HATCH.breadth / 2;
  const portEdges = ports.flatMap((p) => [shipZ(p) - PORT.width / 2, shipZ(p) + PORT.width / 2]);
  const zs = steps(zFore, zAft, ROW_STEP, [...portEdges, ...hatchZ, -PARTNERS / 2, PARTNERS / 2]);
  const berthY = deckY(0) - PLANKING.deck - DECK_BEAM.moulded - BERTH_HEADROOM;

  buildSide(wood, copper, zs, ports);
  buildBulwark(wood, iron, zs, ports);
  buildDeck(wood, zs, hatchZ, hatchX);
  buildBeams(wood, zFore, zAft, hatchZ, hatchX);
  buildBelow(wood, zs, berthY);
  buildHatch(wood, hatchZ, hatchX);
  buildGuns(fittings, wood, iron, ropes, ports);
  const rig = buildRig(fittings, wood, iron, ropes, { zFore, zAft, berthY, partners: PARTNERS, partnersRise: PARTNERS_RISE, ports: ports.map(shipZ) });

  // The lantern, hanging from a beam on the berth deck.
  const beamUnder = deckY(LANTERN_AT.across) - PLANKING.deck - DECK_BEAM.moulded;
  const hook = new Vector3(LANTERN_AT.across, beamUnder, shipZ(LANTERN_AT.forward));
  const foot = hook.clone().setY(beamUnder - LANTERN_AT.below - LANTERN_HEIGHT);
  place(fittings, 'prop_horn_lantern', new Matrix4().makeTranslation(foot.x, foot.y, foot.z), { tin: { solid: iron, paint: 1 }, horn: { solid: glow, paint: 1 }, candle: { solid: glow, paint: 1 } });
  ropes.line([hook, hook.clone().setY(foot.y + LANTERN_HEIGHT)], ROPE.ratline / 2, 1);
  const flame = foot.clone().setY(foot.y + FLAME_ABOVE_FOOT);

  return {
    wood, iron, copper, glow, ropes, lanternHook: hook, flame,
    hatch: { centre: new Vector3(0, deckY(0), (hatchZ[0] + hatchZ[1]) / 2), width: 2 * hatchX, length: hatchZ[1] - hatchZ[0] },
    deckY: deckY(0), berthY, zFore, zAft, rig,
  };
}
