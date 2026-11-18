/**
 * The brig's whole hull form (pure): the table of offsets taken off the Cruizer draught (rules/ships.ts) as one fair
 * surface, read as her moulded half-breadth at any place along her and any height. Floating (N2.2), walking (N2.3),
 * the damage cells and the drawing (N2.4) all read her shape here; the midship section (section.ts) is the dead flat
 * station of the same table.
 *
 * **How the surface is made.** Each station of the body plan is a monotone curve of half-breadth over height. At a
 * height, the stations that reach it and the two ends of the hull at that height (the stem's face forward; aft the
 * sternpost's face, or the transom above the wing transom) give points along her, and a monotone curve through them
 * gives the breadth at any place along. The result is sampled once on a fine grid and read bilinearly, so a lookup is
 * cheap enough for every pressure point of every step.
 *
 * Positions are metres forward of the mainmast (`along`), heights metres above her base (the keel's underside at the
 * mainmast), as in rules/ships.ts; section.ts turns them into ship space.
 */
import { linearCurve, monotoneCurve, type Curve } from '../curve';
import {
  BODY_STATIONS, DESIGN_WATERLINE, KEEL_DEPTH, KEEL_HALF_SIDING, PROFILE, STEM, STERN, TRANSOM, DECK_CAMBER, PLANKING,
} from '../rules/ships';

/** The grid the surface is sampled on: steps along her and up, m. */
const GRID_ALONG = 0.05;
const GRID_UP = 0.025;
/** How much a lookup may stand outside the hull's ends before it reads as outside, m (a grid step's rounding). */
const END_SLACK = 1e-9;

const col = <T extends readonly number[]>(rows: readonly T[], i: number) => rows.map((r) => r[i]!);

/** Her profile as curves along her: the keel's underside, the rabbet, the deck at side, the top of her side. */
const ALONGS = col(PROFILE, 0);
const KEEL_BOTTOM: Curve = linearCurve(ALONGS, col(PROFILE, 1));
const RABBET: Curve = linearCurve(ALONGS, col(PROFILE, 2));
const SHEER: Curve = monotoneCurve(ALONGS, col(PROFILE, 3));
const SIDE_TOP: Curve = monotoneCurve(ALONGS, col(PROFILE, 4));
/** The hull's ends at a height: forward the stem's face, aft the sternpost's face and above it the counter and transom. */
const STEM_AT: Curve = monotoneCurve(col(STEM, 0), col(STEM, 1));
const STERN_AT: Curve = monotoneCurve(col(STERN, 0), col(STERN, 1));
const TRANSOM_HALF: Curve = monotoneCurve(col(TRANSOM.outline, 0), col(TRANSOM.outline, 1));
/** Each station's half-breadth over height. */
const STATIONS = BODY_STATIONS.map((s) => ({ ...s, curve: monotoneCurve(col(s.offsets, 0), col(s.offsets, 1)) }));

/** The lowest and highest heights of her hull, and her ends along her. */
export const HULL_LOW = Math.min(...col(PROFILE, 2));
export const HULL_HIGH = Math.max(...col(PROFILE, 4), ...col(STEM, 0), ...col(STERN, 0));
export const HULL_AFT = Math.min(...col(STERN, 1), ALONGS[0]!);
export const HULL_FORE = Math.max(...col(STEM, 1), ALONGS[ALONGS.length - 1]!);

/** The keel's underside at a place along her, m above the base (she draws more aft: the keel's drag). */
export const keelBottom = (along: number): number => KEEL_BOTTOM(along);
/** The weather deck's upper side at her side, m above the base: the sheer, rising toward bow and stern. */
export const sheer = (along: number): number => SHEER(along);
/** The top of her side (the plank-sheer under the rail), m above the base. */
export const sideTop = (along: number): number => SIDE_TOP(along);

/** The weather deck's upper side at a place, m above the base: the sheer at her side plus the round of her beams. */
export function weatherDeck(along: number, x: number): number {
  const half = hullHalfBreadth(along, sheer(along));
  const f = half > 0 ? Math.min(1, Math.abs(x) / half) : 1;
  return sheer(along) + DECK_CAMBER * (1 - f * f);
}
/** The underside of the weather deck's planking on the centreline, m above the base. */
export const weatherDeckUnderside = (along: number): number => weatherDeck(along, 0) - PLANKING.deck;

/** Her ends at a height: the aftmost and foremost place of the moulded hull, m forward of the mainmast. */
export function hullEnds(h: number): { aft: number; fore: number } {
  return { aft: STERN_AT(h), fore: STEM_AT(h) };
}

/** The lowest height of her moulded hull at a place along her: the rabbet amidships, the stem's or the counter's edge at the ends. */
export function hullBottom(along: number): number {
  const fromProfile = RABBET(along);
  // At the ends the bottom climbs the stem or the stern: the lowest height whose end lies beyond this place.
  if (along > STEM_AT(fromProfile)) return endHeight(along, STEM, STEM_AT, 1);
  if (along < STERN_AT(fromProfile)) return endHeight(along, STERN, STERN_AT, -1);
  return fromProfile;
}

/** The height where an end curve reaches `along` (bisection; the curve runs outward as it climbs). */
function endHeight(along: number, rows: readonly (readonly [number, number])[], at: Curve, outward: number): number {
  let lo = rows[0]![0], hi = rows[rows.length - 1]![0];
  for (let k = 0; k < BISECTIONS; k++) {
    const mid = (lo + hi) / 2;
    if ((at(mid) - along) * outward < 0) lo = mid; else hi = mid;
  }
  return hi;
}
/** Halvings that find an end's height to well under a millimetre. */
const BISECTIONS = 40;

/** Her half-breadth at the very end of a height: the transom's breadth aft above the wing transom, else the stem's or post's siding. */
function endBreadth(h: number, aft: boolean): number {
  return aft && h >= TRANSOM.wing ? TRANSOM_HALF(h) : KEEL_HALF_SIDING;
}

/** The surface worked out at one height: breadth at each place along, from the stations and the ends. */
function breadthAlong(h: number): Curve | null {
  const { aft, fore } = hullEnds(h);
  if (!(fore > aft)) return null;
  const xs: number[] = [aft], ys: number[] = [endBreadth(h, true)];
  for (const s of STATIONS) {
    if (s.along <= aft || s.along >= fore) continue;
    // Below a station's rising the hull there is the deadwood, as wide as the keel.
    ys.push(h <= s.rising ? KEEL_HALF_SIDING : Math.max(KEEL_HALF_SIDING, s.curve(h)));
    xs.push(s.along);
  }
  xs.push(fore);
  ys.push(endBreadth(h, false));
  return monotoneCurve(xs, ys);
}

/** The sampled surface: rows by height, columns by place along. */
interface Grid {
  readonly cols: number;
  readonly rows: number;
  readonly values: Float64Array;
}
let grid: Grid | null = null;

function sampleGrid(): Grid {
  const cols = Math.ceil((HULL_FORE - HULL_AFT) / GRID_ALONG) + 1;
  const rows = Math.ceil((HULL_HIGH - HULL_LOW) / GRID_UP) + 1;
  const values = new Float64Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const h = HULL_LOW + r * GRID_UP, along = breadthAlong(h);
    if (!along) continue;
    for (let c = 0; c < cols; c++) values[r * cols + c] = along(HULL_AFT + c * GRID_ALONG);
  }
  return { cols, rows, values };
}

/**
 * Her moulded half-breadth (to the outside of her frames) at a place along her and a height above the base, m; 0
 * outside her hull (beyond her ends, below her bottom or above the top of her side).
 */
export function hullHalfBreadth(along: number, h: number): number {
  if (h < hullBottom(along) - END_SLACK || h > sideTop(along) + END_SLACK) return 0;
  const { aft, fore } = hullEnds(h);
  if (along < aft - END_SLACK || along > fore + END_SLACK) return 0;
  const g = (grid ??= sampleGrid());
  const fc = Math.min(g.cols - 1 - END_SLACK, Math.max(0, (along - HULL_AFT) / GRID_ALONG));
  const fr = Math.min(g.rows - 1 - END_SLACK, Math.max(0, (h - HULL_LOW) / GRID_UP));
  const c = Math.floor(fc), r = Math.floor(fr), u = fc - c, v = fr - r;
  const sample = (rr: number, cc: number) => g.values[rr * g.cols + cc]!;
  const low = sample(r, c) * (1 - u) + sample(r, c + 1) * u, high = sample(r + 1, c) * (1 - u) + sample(r + 1, c + 1) * u;
  return Math.max(KEEL_HALF_SIDING, low * (1 - v) + high * v);
}

/** The draught's load waterline at a place along her, m above the base: straight, deeper aft. */
export function designWaterline(along: number): number {
  const [a0, h0] = DESIGN_WATERLINE.aft, [a1, h1] = DESIGN_WATERLINE.fore;
  return h0 + ((h1 - h0) * (along - a0)) / (a1 - a0);
}

/**
 * Her displaced volume below a waterline (m above the base at each place along her; the draught's own by default),
 * m³: the moulded hull by Simpson's rule in both directions, the outside planking (its thickness over the wetted
 * girth) and the keel below the rabbet.
 */
export function displacedVolume(waterlineAt: (along: number) => number = designWaterline, stepAlong = DISPLACEMENT_STEP, stepUp = DISPLACEMENT_STEP): number {
  return displaced(waterlineAt, stepAlong, stepUp).volume;
}

/** Her centre of buoyancy below a waterline (the draught's own by default): m forward of the mainmast. */
export function buoyancyAlong(waterlineAt: (along: number) => number = designWaterline): number {
  const d = displaced(waterlineAt, DISPLACEMENT_STEP, DISPLACEMENT_STEP);
  return d.moment / d.volume;
}

/** Her displaced volume below a waterline, and its moment about the mainmast (m⁴, forward positive). */
function displaced(waterlineAt: (along: number) => number, stepAlong: number, stepUp: number): { volume: number; moment: number } {
  const along = simpsonPoints(HULL_AFT, HULL_FORE, stepAlong);
  let volume = 0, moment = 0;
  for (const [a, wa] of along) {
    const bottom = hullBottom(a), waterline = waterlineAt(a);
    if (bottom >= waterline) continue;
    // The section's area below the waterline, and its wetted girth for the planking.
    let area = 0, girth = 0, lastX = 0, lastH = bottom;
    for (const [h, wh] of simpsonPoints(bottom, waterline, stepUp)) {
      const x = hullHalfBreadth(a, h);
      area += 2 * x * wh;
      if (h > bottom) girth += 2 * Math.hypot(x - lastX, h - lastH);
      lastX = x;
      lastH = h;
    }
    const keel = 2 * KEEL_HALF_SIDING * Math.max(0, Math.min(KEEL_DEPTH, bottom - keelBottom(a)));
    const slice = (area + girth * PLANKING.side + keel) * wa;
    volume += slice;
    moment += slice * a;
  }
  return { volume, moment };
}
/** The step of the displacement's integration, m. */
const DISPLACEMENT_STEP = 0.1;

/** Points and weights of Simpson's rule over [a, b] at about `step` apart (an even count of intervals). */
export function simpsonPoints(a: number, b: number, step: number): [number, number][] {
  const n = Math.max(2, 2 * Math.ceil((b - a) / (2 * step))), h = (b - a) / n, out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const w = i === 0 || i === n ? 1 : i % 2 === 1 ? SIMPSON_ODD : 2;
    out.push([a + i * h, (w * h) / SIMPSON_DIVISOR]);
  }
  return out;
}
/** Simpson's rule: weights 1, 4, 2, 4, ..., 1 over 3. */
const SIMPSON_ODD = 4;
const SIMPSON_DIVISOR = 3;

/** Corners of a triangle. */
const TRIANGLE = 3;

/** A closed surface of her moulded hull: points (x, height, along) and triangles, both sides, her bottom edge and a lid at the top of her side. */
export interface HullMesh {
  readonly points: Float64Array;
  readonly triangles: Uint32Array;
}

/**
 * Her moulded hull as one closed surface: `sections` sections from her after end to her fore end, each `rows` points
 * from the bottom of her hull to the top of her side on each side, joined across her bottom edge (keel, stem, the
 * counter and transom) and across the top (a lid), and closed at both ends. Faces turn outward.
 */
export function hullMesh(sections: number, rows: number): HullMesh {
  const pts: number[] = [], tris: number[] = [];
  const per = 2 * (rows + 1);
  for (let i = 0; i <= sections; i++) {
    const a = HULL_AFT + ((HULL_FORE - HULL_AFT) * i) / sections, bottom = hullBottom(a), top = Math.max(bottom, sideTop(a));
    for (const side of [1, -1]) {
      for (let j = 0; j <= rows; j++) {
        const h = bottom + ((top - bottom) * j) / rows;
        pts.push(side * hullHalfBreadth(a, h), h, a);
      }
    }
  }
  const vertex = (i: number, side: number, j: number) => i * per + side * (rows + 1) + j;
  const face4 = (p: number, q: number, r: number, s: number) => tris.push(p, q, r, p, r, s);
  for (let i = 0; i < sections; i++) {
    for (let j = 0; j < rows; j++) {
      face4(vertex(i, 0, j), vertex(i + 1, 0, j), vertex(i + 1, 0, j + 1), vertex(i, 0, j + 1));
      face4(vertex(i, 1, j), vertex(i, 1, j + 1), vertex(i + 1, 1, j + 1), vertex(i + 1, 1, j));
    }
    face4(vertex(i, 0, 0), vertex(i, 1, 0), vertex(i + 1, 1, 0), vertex(i + 1, 0, 0));
    face4(vertex(i, 0, rows), vertex(i + 1, 0, rows), vertex(i + 1, 1, rows), vertex(i, 1, rows));
  }
  // The end caps: each end section's outline (starboard up, port down) as a fan.
  for (const [i, flip] of [[0, false], [sections, true]] as const) {
    const ring: number[] = [];
    for (let j = 0; j <= rows; j++) ring.push(vertex(i, 0, j));
    for (let j = rows; j >= 0; j--) ring.push(vertex(i, 1, j));
    for (let k = 1; k < ring.length - 1; k++) {
      if (flip) tris.push(ring[0]!, ring[k + 1]!, ring[k]!); else tris.push(ring[0]!, ring[k]!, ring[k + 1]!);
    }
  }
  // Wound above so each face turns inward; reverse every triangle to turn them out.
  for (let k = 0; k < tris.length; k += TRIANGLE) [tris[k + 1], tris[k + 2]] = [tris[k + 2]!, tris[k + 1]!];
  return { points: new Float64Array(pts), triangles: new Uint32Array(tris) };
}
