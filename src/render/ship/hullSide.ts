/**
 * Her outside, the whole length of her (plan N2.4): the hull's planking from the keel to the top of her side, laid on
 * the fair surface of her lines (sim/ship/hull.ts), copper below the waterline, black paint above, the ochre band
 * along her ports, the wales standing proud, the gun ports cut through, the keel, stem and sternpost (her square
 * stern is stern.ts's); and above the deck the bulwarks' inside, the rail, the ports' linings, and the channels (the
 * lids swing with the guns: gunsView.ts).
 *
 * Her side's grain runs along her (u: ship-space z) and up her girth (v: m from the bottom of her hull at that
 * place), which is also how the damage map lays out her planking (damageMap.ts) and how the plan's planking cells
 * are numbered, so a shot's hole is drawn where the plan says it struck.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import {
  BODY_STATIONS, BULWARK, CEILING, FRAME_DEPTH, KEEL_DEPTH, KEEL_HALF_SIDING, PLANKING, PORTS, TRANSOM, WALE, WATERWAY,
} from '../../sim/rules/ships';
import {
  HULL_AFT, HULL_FORE, designWaterline, hullBottom, hullEnds, hullHalfBreadth, keelBottom, sheer, sideTop,
} from '../../sim/ship/hull';
import { linearCurve } from '../../sim/curve';
import { shipY, shipZ } from '../../sim/ship/section';
import { box, roundedProfile, sheet, sweep } from './shapes';
import type { ZoneParts } from './parts';
import { BLACK, COPPER, OAK, OCHRE, RED, SIDE_PLANKS } from './looks';
import type { Finish } from './solid';
import { DAMAGE } from './damageMap';

/** The longest step between rows along her, m; near her ends, where her shape turns fast, a finer one. */
export const ROW_STEP = 0.3;
const END_ROW_STEP = 0.12;
/** How far from each end the finer rows reach, m. */
const END_REACH = 1.6;
/** Girth between points up her side, m. */
const GIRTH_STEP = 0.07;
/** Samples up a section when its girth is measured. */
const GIRTH_SAMPLES = 96;
/** Two heights or places this close are one, m. */
export const EPSILON = 1e-6;
/** How far above the load waterline her copper reaches, m (a hand's breadth, so she shows copper when she rolls). */
export const COPPER_ABOVE_WATER = 0.28;
/** The ochre band: how far below the port sills and above the port tops it reaches, m. */
const BAND_BELOW_SILL = 0.09;
const BAND_ABOVE_TOP = 0.05;
/** How far the wales stand out beyond her planking, m. */
const WALE_PROUD = PLANKING.wale - PLANKING.side;
/** Rounding of timber edges, m: big timbers, small ones. */
export const BEVEL = 0.02;
export const SMALL_BEVEL = 0.008;
/** The bulwark's thickness: her outside planking, its timbers and the inside boards, m. */
export const BULWARK_THICK = PLANKING.side + BULWARK.timber + BULWARK.insideBoard;
/** The least half-breadth the bulwark's inside keeps at her bow, where her two sides close, m. */
const LEAST_INSIDE = 0.05;
/** Ambient occlusion baked into corners, and how far its shade reaches, m. */
export const CORNER_AO = 0.55;
export const CORNER_REACH = 0.35;

/** The dead flat, where the draught's midship section was read: the wales' and the band's heights are given there. */
const DEAD_FLAT = BODY_STATIONS.find((s) => s.name === '⊗')!.along;
/** How far the sheer stands above the dead flat's at a place along her, m: her wales and band follow it. */
const sheerRise = (along: number): number => sheer(along) - sheer(DEAD_FLAT);

/** The port line: each port's sill and top across its width, straight between ports, and following the sheer beyond the end ports. */
const PORT_EDGES = PORTS.flatMap(([, along, , , w]) => [along - w / 2, along + w / 2]);
const SILL_OVER_SHEER = linearCurve(PORT_EDGES, PORTS.flatMap(([, along, sill, , w]) => [sill - sheer(along - w / 2), sill - sheer(along + w / 2)]));
const TOP_OVER_SHEER = linearCurve(PORT_EDGES, PORTS.flatMap(([, along, , top, w]) => [top - sheer(along - w / 2), top - sheer(along + w / 2)]));
export const sillAt = (along: number): number => sheer(along) + SILL_OVER_SHEER(along);
export const portTopAt = (along: number): number => sheer(along) + TOP_OVER_SHEER(along);

/** Her outside's half-breadth at a place and height: the moulded line and her planking, the wales standing proud. */
export function outsideX(along: number, h: number, wale = false): number {
  return hullHalfBreadth(along, Math.min(h, sideTop(along))) + PLANKING.side + (wale ? WALE_PROUD : 0);
}

/** The inside of her bulwark at a place and height above the deck, m from the centreline. */
export function bulwarkInside(along: number, h: number): number {
  return Math.max(LEAST_INSIDE, outsideX(along, h) - BULWARK_THICK);
}

/** The inside of her side below the deck (the ceiling on her frames), m from the centreline; 0 where she has no room inside. */
export function ceilingX(along: number, h: number): number {
  return Math.max(0, hullHalfBreadth(along, h) - FRAME_DEPTH - CEILING);
}

/** Her deck's ends: where the weather deck meets her stern and her stem, m forward of the mainmast. */
export function deckEnds(): { aft: number; fore: number } {
  // Walk in from each end of the hull to where her side reaches the deck's height.
  const find = (from: number, to: number) => {
    let a = from, b = to;
    for (let k = 0; k < BISECTIONS; k++) {
      const m = (a + b) / 2;
      if (hullBottom(m) < sheer(m) - EPSILON) b = m; else a = m;
    }
    return b;
  };
  return { aft: find(HULL_AFT, 0), fore: find(HULL_FORE, 0) };
}
/** Numbers closer than this are one row, m. */
const DISTINCT = 1e-4;
/** Halvings that find a place to well under a millimetre. */
const BISECTIONS = 40;

/** The sorted, distinct numbers of a list. */
export function rowsOf(list: readonly number[]): number[] {
  return [...list].sort((a, b) => a - b).filter((v, i, a) => i === 0 || v - a[i - 1]! > DISTINCT);
}

/** Steps from a to b no longer than `step`, both ends included, plus any `cuts` between. */
export function steps(a: number, b: number, step: number, cuts: readonly number[] = []): number[] {
  const n = Math.max(1, Math.ceil((b - a) / step)), out: number[] = [];
  for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
  return rowsOf([...out, ...cuts.filter((c) => c > a && c < b)]);
}

/** Rows along her between two places: `step` apart, finer near her ends, with cuts at every port's edges. */
export function rowsAlong(aft: number, fore: number, step = ROW_STEP, cuts: readonly number[] = []): number[] {
  const out = [...steps(aft, Math.min(fore, HULL_AFT + END_REACH), END_ROW_STEP), ...steps(aft, fore, step), ...steps(Math.max(aft, HULL_FORE - END_REACH), fore, END_ROW_STEP)];
  return rowsOf([...out.filter((a) => a >= aft - EPSILON && a <= fore + EPSILON), ...PORT_EDGES.filter((e) => e > aft && e < fore), ...cuts.filter((c) => c > aft && c < fore)]);
}

/** Her girth at a place along her, as a function of height (m from the bottom of her hull up her moulded line), and its total. */
export function girthOf(along: number): { at: (h: number) => number; heightAt: (g: number) => number; total: number; bottom: number; top: number } {
  const bottom = hullBottom(along), top = Math.max(bottom, sideTop(along));
  const hs: number[] = [], gs: number[] = [];
  let g = 0, lastX = hullHalfBreadth(along, bottom), lastH = bottom;
  for (let i = 0; i <= GIRTH_SAMPLES; i++) {
    const h = bottom + ((top - bottom) * i) / GIRTH_SAMPLES, x = hullHalfBreadth(along, h);
    g += Math.hypot(x - lastX, h - lastH);
    hs.push(h); gs.push(g);
    lastX = x; lastH = h;
  }
  const look = (from: number[], to: number[], v: number) => {
    if (v <= from[0]!) return to[0]!;
    for (let i = 1; i < from.length; i++) if (v <= from[i]!) return to[i - 1]! + ((to[i]! - to[i - 1]!) * (v - from[i - 1]!)) / Math.max(from[i]! - from[i - 1]!, EPSILON);
    return to[to.length - 1]!;
  };
  return { at: (h) => look(hs, gs, h), heightAt: (v) => look(gs, hs, v), total: g, bottom, top };
}

/** How the side is detailed: rows' step along her and points' step up her girth (the far ship's are coarser). */
export interface Detail {
  readonly rowStep: number;
  readonly girthStep: number;
}
export const FULL_DETAIL: Detail = { rowStep: ROW_STEP, girthStep: GIRTH_STEP };

/** The heights where her side changes finish at a place along her, bottom to top, each held between her bottom and top. */
function bandEdges(along: number, bottom: number, top: number): number[] {
  const raw = [
    bottom, designWaterline(along) + COPPER_ABOVE_WATER, WALE.lower + sheerRise(along), WALE.upper + sheerRise(along),
    sillAt(along) - BAND_BELOW_SILL, sillAt(along), portTopAt(along), portTopAt(along) + BAND_ABOVE_TOP, top,
  ];
  let last = bottom;
  return raw.map((h) => (last = Math.min(top, Math.max(last, h))));
}
/** The bands between the edges: which is copper, the wale, and where the ports are cut. */
const BAND = { copper: 0, wale: 2, ports: 5 } as const;
/** Bands painted ochre: from below the sills to above the port tops. */
const OCHRE_BANDS = [4, 5, 6];

/**
 * Her outside from the keel to the top of her side, both sides: copper below the copper line, paint above, the
 * wales standing proud with a step at each edge, the gun ports cut through. Each band is one sheet, so each finish
 * ends on a crisp line.
 */
export function buildOutside(out: ZoneParts, detail: Detail = FULL_DETAIL): void {
  // Rows from bow to stern (ship-space z rising), as all her sheets run.
  // A row at the wing transom, where her sternpost's face ends and her counter begins.
  const alongs = rowsAlong(HULL_AFT, HULL_FORE, detail.rowStep, [hullEnds(TRANSOM.wing).aft]).reverse();
  const sections = alongs.map((a) => {
    const girth = girthOf(a);
    return { a, girth, edges: bandEdges(a, girth.bottom, girth.top) };
  });
  const bands = sections[0]!.edges.length - 1;
  const inPort = (a0: number, a1: number) => PORTS.some(([, along, , , w]) => Math.min(a0, a1) >= along - w / 2 - EPSILON && Math.max(a0, a1) <= along + w / 2 + EPSILON);
  for (const side of [1, -1]) {
    const damage = side > 0 ? DAMAGE.starboardSide : DAMAGE.portSide;
    for (let k = 0; k < bands; k++) {
      // Points up each band evenly by girth, as many as the band's longest girth needs.
      const most = Math.max(...sections.map((s) => s.girth.at(s.edges[k + 1]!) - s.girth.at(s.edges[k]!)));
      if (most < EPSILON) continue;
      const n = Math.max(1, Math.ceil(most / detail.girthStep));
      const rows = sections.map((s) => {
        const g0 = s.girth.at(s.edges[k]!), g1 = s.girth.at(s.edges[k + 1]!);
        return Array.from({ length: n + 1 }, (_, j) => s.girth.heightAt(g0 + ((g1 - g0) * j) / n));
      });
      const grid = rows.map((hs, i) => hs.map((h) => new Vector3(side * outsideX(sections[i]!.a, h, k === BAND.wale), shipY(h), shipZ(sections[i]!.a))));
      const finish: Finish = { ...(k === BAND.copper ? COPPER : SIDE_PLANKS(OCHRE_BANDS.includes(k) ? OCHRE : BLACK)), damage };
      const solid = k === BAND.copper ? out.copper : out.wood;
      sheet(solid, grid, finish, (i, j) => [shipZ(sections[i]!.a), sections[i]!.girth.at(rows[i]![j]!)],
        (i) => rows[i]![n]! - rows[i]![0]! > EPSILON || rows[i + 1]![n]! - rows[i + 1]![0]! > EPSILON ? !(k === BAND.ports && inPort(sections[i]!.a, sections[i + 1]!.a)) : false,
        side > 0);
    }
    // The wale's edges: the step from her planking out to the wale's face.
    for (const e of [BAND.wale, BAND.wale + 1]) {
      const grid = sections.map((s) => [new Vector3(side * outsideX(s.a, s.edges[e]!), shipY(s.edges[e]!), shipZ(s.a)), new Vector3(side * outsideX(s.a, s.edges[e]!, true), shipY(s.edges[e]!), shipZ(s.a))]);
      sheet(out.wood, grid, SIDE_PLANKS(BLACK), (i, j) => [shipZ(sections[i]!.a), sections[i]!.girth.at(sections[i]!.edges[e]!) + j * WALE_PROUD],
        (i) => sections[i]!.edges[BAND.wale + 1]! - sections[i]!.edges[BAND.wale]! > EPSILON, (side > 0) !== (e === BAND.wale + 1));
    }
  }
  buildBackbone(out, alongs);
}

/**
 * The keel, stem and sternpost: where her two sides' planking ends at her bottom, the keel's sides and underside
 * below the rabbet amidships, and at her ends the stem's and the sternpost's faces up to the wing transom (above it
 * her counter is the stern board's: stern.ts). Coppered as far as her copper.
 */
function buildBackbone(out: ZoneParts, alongs: readonly number[]): void {
  const rows = alongs.map((a) => {
    const b = hullBottom(a), bx = hullHalfBreadth(a, b) + PLANKING.side, keel = b <= keelBottom(a) + KEEL_DEPTH + EPSILON ? keelBottom(a) : b;
    return [[-bx, b], [-KEEL_HALF_SIDING, b], [-KEEL_HALF_SIDING, keel], [KEEL_HALF_SIDING, keel], [KEEL_HALF_SIDING, b], [bx, b]].map(([x, h]) => new Vector3(x!, shipY(h!), shipZ(a)));
  });
  const copperTop = (a: number) => designWaterline(a) + COPPER_ABOVE_WATER;
  sheet((i) => (hullBottom(alongs[i]!) < copperTop(alongs[i]!) ? out.copper : out.wood), rows, { ...COPPER, plank: 0 },
    (i, j) => [shipZ(alongs[i]!), j * KEEL_HALF_SIDING], (i) => Math.max(hullBottom(alongs[i]!), hullBottom(alongs[i + 1]!)) <= TRANSOM.wing + EPSILON, true);
}

/**
 * Above the deck, both sides: the bulwark's inside from the waterway to the rail, red, with the ports through it and
 * their linings and lids; the rail on top; the waterway along the deck's edge.
 */
export function buildBulwarks(out: ZoneParts, deckAft: number, deckFore: number, detail: Detail = FULL_DETAIL): void {
  const alongs = rowsAlong(deckAft, deckFore, detail.rowStep).reverse();
  const railFoot = (a: number) => sideTop(a);
  for (const side of [1, -1]) {
    const damage = side > 0 ? DAMAGE.starboardBulwark : DAMAGE.portBulwark;
    // Heights per row: the waterway's top, two steps to the sill, PORT_ROWS across the port, one above, the rail's foot.
    const hsOf = (a: number) => {
      const base = sheer(a) + WATERWAY.rise, sill = Math.max(base, sillAt(a)), top = Math.min(railFoot(a), Math.max(sill, portTopAt(a)));
      return [base, (base + sill) / 2, ...Array.from({ length: PORT_ROWS + 1 }, (_, k) => sill + ((top - sill) * k) / PORT_ROWS), railFoot(a)];
    };
    const sillRow = 2, topRow = sillRow + PORT_ROWS;
    const hss = alongs.map(hsOf);
    const grid = hss.map((hs, i) => hs.map((h) => new Vector3(side * bulwarkInside(alongs[i]!, h), shipY(h), shipZ(alongs[i]!))));
    const inPort = (i: number, j: number) => j >= sillRow && j < topRow && PORTS.some(([, along, , , w]) => Math.min(alongs[i]!, alongs[i + 1]!) >= along - w / 2 - EPSILON && Math.max(alongs[i]!, alongs[i + 1]!) <= along + w / 2 + EPSILON);
    sheet(out.wood, grid, { ...RED, plank: BULWARK.railWidth, damage }, (i, j) => [shipZ(alongs[i]!), hss[i]![j]! - sheer(alongs[i]!)], (i, j) => !inPort(i, j), side < 0,
      (i, j) => CORNER_AO + (1 - CORNER_AO) * Math.min(1, (hss[i]![j]! - sheer(alongs[i]!)) / CORNER_REACH));
    // The rail on top, black, rounded, following her sheer and her side.
    const rail = alongs.map((a) => ({ x: side * (outsideX(a, railFoot(a)) - BULWARK_THICK / 2 - BULWARK.railWidth / 2), y: shipY(railFoot(a)), z: shipZ(a) }));
    sweep(out.wood, rail, roundedProfile(BULWARK.railWidth, BULWARK.railThick, BEVEL), side, BLACK);
    // The waterway: a heavy timber along the deck's edge, against the bulwark, rounded on its inner edge.
    const way = alongs.map((a) => ({ x: side * (bulwarkInside(a, sheer(a)) - WATERWAY.width), y: shipY(sheer(a) - PLANKING.deck), z: shipZ(a) }));
    sweep(out.wood, way, roundedProfile(WATERWAY.width, WATERWAY.rise + PLANKING.deck, BEVEL * 2), side, OAK, CORNER_AO);
    for (const port of PORTS) buildPort(out, port, side);
  }
  // At her bow the two bulwarks close: the knightheads' face between them, and the rail across their tops.
  const bow = alongs[0]!, base = sheer(bow), foot = railFoot(bow), z = shipZ(bow);
  const at = (side: number, h: number) => new Vector3(side * bulwarkInside(bow, h), shipY(h), z);
  sheet(out.wood, [[at(-1, base), at(-1, foot)], [at(1, base), at(1, foot)]], RED, (i, j) => [i, j * (foot - base)]);
  const across = 2 * (outsideX(bow, foot) - BULWARK_THICK / 2);
  box(out.wood, new Matrix4().makeTranslation(0, shipY(foot) + BULWARK.railThick / 2, z - BULWARK.railWidth / 2), [across, BULWARK.railThick, BULWARK.railWidth], BLACK, BEVEL, 0);
}

/** Rows of the bulwark's face across a port's height. */
const PORT_ROWS = 3;

/** One gun port's linings through the bulwark (its lid swings on its hinge with the guns: gunPlaces.ts, gunsView.ts). */
function buildPort(out: ZoneParts, [, along, sill, top, width]: (typeof PORTS)[number], side: number): void {
  const z0 = shipZ(along + width / 2), z1 = shipZ(along - width / 2);
  const xo = (h: number) => side * outsideX(along, h), xi = (h: number) => side * bulwarkInside(along, h);
  const thick = BULWARK_THICK;
  const faces: [Vector3, Vector3, Vector3, Vector3][] = [
    [new Vector3(xi(sill), shipY(sill), z0), new Vector3(xo(sill), shipY(sill), z0), new Vector3(xo(sill), shipY(sill), z1), new Vector3(xi(sill), shipY(sill), z1)],
    [new Vector3(xi(top), shipY(top), z1), new Vector3(xo(top), shipY(top), z1), new Vector3(xo(top), shipY(top), z0), new Vector3(xi(top), shipY(top), z0)],
    [new Vector3(xi(top), shipY(top), z0), new Vector3(xo(top), shipY(top), z0), new Vector3(xo(sill), shipY(sill), z0), new Vector3(xi(sill), shipY(sill), z0)],
    [new Vector3(xi(sill), shipY(sill), z1), new Vector3(xo(sill), shipY(sill), z1), new Vector3(xo(top), shipY(top), z1), new Vector3(xi(top), shipY(top), z1)],
  ];
  for (const f of faces) sheet(out.wood, [[f[0], f[3]], [f[1], f[2]]], RED, (i, j) => [i * thick, j * width], () => true, side > 0);
}

