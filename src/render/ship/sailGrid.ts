/**
 * The sails' and flags' grids (plan N3.10), built once in the worker with the rest of her (ship.ts): each sail a grid
 * over its cloth (u, v), each vertex carrying its sail's row and its place, so the sail kind's vertex stage shapes it
 * from the sail's numbers (sailForm.ts `clothAt`, sailMaterial.ts) and nothing is rebuilt as she sails. A vertex also
 * carries what its fragment draws: where it lies across the cloths (the seams), how far from the edge reefs are taken
 * from (reef bands), how far from the sail's edge (tablings and bolt rope), and its place in the sails' hole map
 * (`sailAtlas`, for the damage drawn, N6.5).
 */
import { Vector3 } from 'three/webgpu';
import { rigPlan } from '../../sim/ship/rig';
import { shipPlan } from '../../sim/ship/plan';
import { Gathered, type Packed } from './gathered';
import { SQUARE, bilerp, sailForms, type SailForm } from './sailForm';

/** The flags' rows after the sails', and how each is drawn on the cloth (the fragment's pattern). */
export const ENSIGN_PATTERN = 1;
export const PENNANT_PATTERN = 2;
/**
 * The flags (ship.md "Flags"): the ensign at the gaff's peak in action, the pennant at the main truck; hoist and fly, m,
 * and the pennant's taper (its fly end this share narrower). A brig's ensign in action, about 8 ft by 15 ft; the
 * pennant long and narrow. Estimated.
 */
export const FLAGS = [
  { id: 'ensign', pattern: ENSIGN_PATTERN, hoist: 2.4, fly: 4.6, taper: 0 },
  { id: 'pennant', pattern: PENNANT_PATTERN, hoist: 0.36, fly: 9.5, taper: 0.85 },
] as const;

/** Grid cells (along u, along v) of a square sail, a fore-and-aft sail and a flag, at each detail. */
export const SAIL_DETAIL = {
  fine: { square: [64, 40], foreAft: [40, 40], flag: [24, 8] },
  coarse: { square: [32, 20], foreAft: [20, 20], flag: [12, 4] },
  far: { square: [10, 6], foreAft: [6, 6], flag: [6, 2] },
} as const;
export type SailDetail = keyof typeof SAIL_DETAIL;

/** The hole map's texel, m, and its side, texels; the gap kept between two sails in it, texels. */
export const SAIL_TEXEL = 0.05;
export const SAIL_ATLAS_SIZE = 1024;
const ATLAS_GAP = 2;
/** A patch's edges, by its corners (P00, P10, P01, P11) round it. */
const EDGES = [[0, 1], [1, 3], [3, 2], [2, 0]] as const;
/** Corners closer than this make no edge, m. */
const NO_EDGE = 1e-3;

/** The attributes of the sail kind's meshes, and their numbers per vertex. */
export const SAIL_ATTRIBUTES = ['position', 'cloth', 'canvas', 'band'] as const;
const XYZ = 3;
const QUAD = 4;
export const SAIL_STRIDES: Readonly<Record<string, number>> = { cloth: XYZ, canvas: QUAD, band: QUAD };

/** A sail's place in the hole map: its corner (texels) and the least seam and drop coordinates it starts from (m). */
export interface AtlasRect {
  readonly x: number;
  readonly y: number;
  readonly seam0: number;
  readonly drop0: number;
  readonly width: number;
  readonly height: number;
}

/** How a point of a sail is reckoned in its cloth: across its cloths (m) and down from the edge its reefs are taken from (m), and to its nearest edge (m). */
export interface ClothPlace {
  readonly seam: number;
  readonly drop: number;
  readonly edge: number;
}

/** Where a point of a sail's flat patch lies in its cloth. */
export function clothPlace(form: SailForm, p: Vector3): ClothPlace {
  const r = form.rest;
  let seam: number, drop: number;
  if (form.kind === SQUARE) {
    // Cloths hang straight down a square sail; reefs are taken from the head.
    seam = p.x;
    drop = Math.max(0, r[0].y - p.y);
  } else {
    // A fore-and-aft sail's cloths run parallel to its leech (clew to peak or head); reefs are taken from its foot.
    seam = distanceToLine(p, r[1], r[3]);
    drop = distanceToLine(p, r[0], r[1]);
  }
  let edge = Infinity;
  for (const [a, b] of EDGES) if (r[a].distanceTo(r[b]) > NO_EDGE) edge = Math.min(edge, distanceToSegment(p, r[a], r[b]));
  return { seam, drop, edge };
}

/** The hole map: every sail's rectangle, packed in shelves (the sails' cloth coordinates at SAIL_TEXEL). */
export function sailAtlas(forms: readonly SailForm[]): AtlasRect[] {
  const rects = forms.map((f) => {
    const places = f.rest.map((r) => clothPlace(f, r));
    const seam0 = Math.min(...places.map((p) => p.seam)), drop0 = Math.min(...places.map((p) => p.drop));
    return { seam0, drop0, width: Math.ceil((Math.max(...places.map((p) => p.seam)) - seam0) / SAIL_TEXEL), height: Math.ceil((Math.max(...places.map((p) => p.drop)) - drop0) / SAIL_TEXEL) };
  });
  const order = rects.map((_, i) => i).sort((a, b) => rects[b]!.height - rects[a]!.height);
  const out: AtlasRect[] = new Array<AtlasRect>(rects.length);
  let x = 0, y = 0, shelf = 0;
  for (const i of order) {
    const r = rects[i]!;
    if (x + r.width > SAIL_ATLAS_SIZE) { x = 0; y += shelf + ATLAS_GAP; shelf = 0; }
    if (y + r.height > SAIL_ATLAS_SIZE) throw new Error('the sails do not fit their hole map');
    out[i] = { x, y, ...r };
    x += r.width + ATLAS_GAP;
    shelf = Math.max(shelf, r.height);
  }
  return out;
}

class SailMesh extends Gathered {
  readonly pos = this.array('position', XYZ);
  readonly cloth = this.array('cloth', XYZ);
  readonly canvas = this.array('canvas', QUAD);
  readonly band = this.array('band', QUAD);

  /** A grid of `cols` × `rows` cells; `vertex(u, v)` writes each vertex's attributes. */
  grid(cols: number, rows: number, vertex: (u: number, v: number) => void): void {
    const base = this.pos.length / XYZ;
    for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) vertex(i / cols, j / rows);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = base + j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1;
        // Wound so the face's normal is the patch's d/du × d/dv (sailMaterial.ts turns its normal by the face seen).
        this.idx.push(a, b, c, b, d, c);
      }
    }
  }
}

/** Every sail and both flags at a detail, as one mesh. */
export function buildSailGrids(detail: SailDetail): Packed {
  const rig = rigPlan(shipPlan()), forms = sailForms(rig), atlas = sailAtlas(forms), cells = SAIL_DETAIL[detail], mesh = new SailMesh();
  const p = new Vector3();
  for (const f of forms) {
    const [cols, rows] = f.kind === SQUARE ? cells.square : cells.foreAft, a = atlas[f.index]!;
    const reefSpacing = f.sail.reefShare * f.height;
    mesh.grid(cols, rows, (u, v) => {
      bilerp(f.rest, u, v, p);
      const c = clothPlace(f, p);
      mesh.pos.push(...p.toArray());
      mesh.cloth.push(f.index, u, v);
      mesh.canvas.push(c.seam, c.drop, c.edge, 0);
      mesh.band.push(reefSpacing, f.sail.reefs, (a.x + (c.seam - a.seam0) / SAIL_TEXEL) / SAIL_ATLAS_SIZE, (a.y + (c.drop - a.drop0) / SAIL_TEXEL) / SAIL_ATLAS_SIZE);
    });
  }
  FLAGS.forEach((flag, k) => {
    const [cols, rows] = cells.flag;
    mesh.grid(cols, rows, (u, v) => {
      // At rest a flag lies flat aft of her stern; its numbers place it (sailForm.ts).
      mesh.pos.push(0, -v * flag.hoist, u * flag.fly);
      mesh.cloth.push(forms.length + k, u, v);
      const edge = Math.min(u * flag.fly, (1 - u) * flag.fly, v * flag.hoist, (1 - v) * flag.hoist);
      mesh.canvas.push(u * flag.fly, v * flag.hoist, edge, flag.pattern);
      mesh.band.push(0, 0, 0, 0);
    });
  });
  return mesh.packed();
}

const ab = new Vector3(), ap = new Vector3();
/** The distance from `p` to the line through `a` and `b`. */
function distanceToLine(p: Vector3, a: Vector3, b: Vector3): number {
  ab.subVectors(b, a).normalize();
  ap.subVectors(p, a);
  return ap.sub(ab.multiplyScalar(ap.dot(ab))).length();
}
/** The distance from `p` to the segment from `a` to `b`. */
function distanceToSegment(p: Vector3, a: Vector3, b: Vector3): number {
  ab.subVectors(b, a);
  const t = Math.max(0, Math.min(1, ap.subVectors(p, a).dot(ab) / ab.lengthSq()));
  return ap.sub(ab.multiplyScalar(t)).length();
}
