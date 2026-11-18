/**
 * The sails' shape (plan N3.10, ship.md "Sails"): no cloth simulation. The simulation says how each sail stands (how
 * far set, its reefs, its brace or sheet, how hard the wind presses, aback or shivering: sailing.ts `sailsStanding`)
 * and the drawing shapes a fine grid from that. Each sail is a patch between its corners (a square sail's head and
 * clews; the boom sail's tack, throat, peak and clew; a headsail's or staysail's tack, clew and head), and a few
 * numbers bend it: a belly by the pressure, ripples running along a shivering sail, the gathered folds of a sail
 * being clewed up or hauled down, a square sail rolled up on its yard, a reef rolled at its head (or along the boom).
 *
 * The shape is one function, `clothAt`, of a sail's numbers (a row, laid out by `ROW`) and a point (u, v) of its
 * cloth. The sail kind's vertex stage runs the same function on the GPU (sailMaterial.ts), so the grid is built once
 * and never rebuilt; this copy places the lines made fast to a sail (its clews, bunt, bowlines, head) where the GPU
 * draws that point, through moving frames of their own (swings.ts, rope.ts `RopeFollow`).
 *
 * The flags (ensign at the gaff's peak, pennant at the main truck) are rows of the same kind: cloth streaming down the
 * true wind from their hoist.
 *
 * The cloth's own coordinates: u across a square sail (larboard 0 to starboard 1), v down it (head 0 to foot 1); on a
 * fore-and-aft sail u from luff to leech and v from foot to head. A headsail's or staysail's head is its patch's top
 * edge drawn to one point.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { SAILS } from '../../sim/rules/rig';
import { sparOf, type RigPlan } from '../../sim/ship/rig';
import { corner, type Sail } from '../../sim/ship/sails';
import type { RigLine } from '../../sim/ship/lines';
import { shipPoint, type Swing } from './swings';
import { CLEAR_FLOATS, cleared } from './sailClear';

/** What a row draws: a square sail, a fore-and-aft sail, a flag (the row's first texel's w). */
export const SQUARE = 0;
export const FORE_AFT = 1;
export const FLAG = 2;

/** Numbers per texel, and texels per row of the sails' state (sailMaterial.ts SAIL_TEXTURE). */
export const TEXEL = 4;
/** Texels of a row's shape (its numbers, `ROW`); the clearance table follows. */
export const SHAPE_TEXELS = 10;
export const ROW_TEXELS = SHAPE_TEXELS + CLEAR_FLOATS / TEXEL;
/** Floats per row. */
export const ROW_FLOATS = TEXEL * ROW_TEXELS;
/**
 * Where each number sits in a row (float offsets). A sail: its four corners, its kind, the belly's depth (m, along
 * `belly`), the shiver's and the breathing's amplitudes (m) and its phase; the belly's shape by edge (head or foot,
 * the other, the u = 0 and u = 1 edges, the middle); how much of its span stays as it is gathered (u, v) and the
 * share of its cloth rolled in a reef; the roll's up and how far rolled up; where its luff is (u), its folds' count
 * and depth (m) and the roll's radius (m); which way the folds run (u, v) and the yard's radius (m).
 * A flag: its hoist's top and foot (P00, P01), the way it streams (belly), its fly (m), its waves' depth (m), count
 * and rate (Hz), its taper, and how far it streams out (0 hanging, 1 flying).
 */
export const ROW = {
  p00: 0, kind: 3, p10: 4, depth: 7, p01: 8, shiver: 11, p11: 12, phase: 15,
  belly: 16, breathe: 19, edgeA: 20, edgeB: 21, edgeL: 22, edgeR: 23,
  middle: 24, uKeep: 25, vKeep: 26, taken: 27, rollUp: 28, roll: 31,
  luff: 32, folds: 33, foldDepth: 34, rollRadius: 35, foldU: 36, foldV: 37, yardRadius: 38, stream: 39,
  fly: 7, wave: 11, waves: 33, waveRate: 34, taper: 32,
  /** The masts' timber the sail keeps clear of (sailClear.ts), written once, to the row's end. */
  clear: SHAPE_TEXELS * TEXEL,
} as const;

// --- The shape's own numbers, shared with the shader (sailMaterial.ts).
/** A clewed-up square sail's foot hangs in scallops between its buntlines and clews, this deep as a share of the gathered drop. */
export const SCALLOP = 0.35;
/** The buntlines haul the foot up at these shares across it (between them and the clews it hangs in scallops). */
export const BUNT = 0.25;
/** A shivering sail's ripples: waves across it, their slant down it, how fast they run (Hz), and how much less they move away from the luff (share across). */
export const SHIVER_WAVES = 3;
export const SHIVER_SLANT = 0.4;
export const SHIVER_HZ = 2.3;
export const SHIVER_FALL = 0.7;
/** A full sail breathes with the wind: its rate (Hz) and how its phase runs across and down it (rad). */
export const BREATHE_HZ = 0.37;
export const BREATHE_U = 3.1;
export const BREATHE_V = 1.7;
/** A furled sail's roll: its radius at the yardarms as a share of the bunt's, turns of cloth round it, and how far each turn winds in (share). */
export const ROLL_ENDS = 0.35;
export const ROLL_TURNS = 1.5;
export const ROLL_IN = 0.6;
/** A reef's roll is this share of a furled sail's. */
export const REEF_ROLL = 0.45;
/** Below this, a share is none. */
export const NONE = 1e-4;
/** A turn, rad. */
const TURN = 2 * Math.PI;

/** How a sail is drawn, worked out once from the rig plan. */
export interface SailForm {
  readonly index: number;
  readonly sail: Sail;
  readonly kind: typeof SQUARE | typeof FORE_AFT;
  /** Its corners (ship space) set, unbraced, hoisted, flat: P00, P10, P01, P11 (a headsail's head twice). */
  readonly rest: readonly [Vector3, Vector3, Vector3, Vector3];
  /** The turning spar each corner moves with (null: her hull). */
  readonly carriers: readonly [string | null, string | null, string | null, string | null];
  /** The belly's shape by edge: the v = 0 edge, the v = 1 edge, the u = 0 and u = 1 edges, the middle (shares of its depth). */
  readonly edges: readonly [number, number, number, number, number];
  /** Its folds run along u, along v (weights of the gathering coordinate), so many in all. */
  readonly foldU: number;
  readonly foldV: number;
  readonly folds: number;
  /** Its breadth (along its head or foot) and height (a square sail's drop; a fore-and-aft sail's luff), m: the belly's depth goes by the breadth. */
  readonly breadth: number;
  readonly height: number;
  /** The yard a topsail or topgallant is hoisted on, and how far the yard drops from hoisted to lowered, m (null: none). */
  readonly hoisted: { readonly yard: string; readonly range: number } | null;
  readonly yardRadius: number;
}

/** A square sail's corners: head larboard and starboard, then clews larboard and starboard. */
const SQUARE_CORNERS = ['head-p', 'head-s', 'clew-p', 'clew-s'] as const;
/** The boom sail's: tack, clew (along the boom), throat, peak (along the gaff). */
const BOOM_CORNERS = ['tack', 'clew', 'throat', 'peak'] as const;
/** A headsail's or staysail's: tack, clew, head, head. */
const HEAD_CORNERS = ['tack', 'clew', 'head', 'head'] as const;
/** Belly shapes: a square sail's head is on its yard and its foot and leeches belly; the boom sail is held at its luff, foot and head; a headsail at its luff. */
const SQUARE_EDGES = [0, 0.4, 0.33, 0.33, 0.47] as const;
const BOOM_EDGES = [0, 0, 0, 0.45, 0.75] as const;
const HEAD_EDGES = [0.4, 0, 0, 0.35, 0.6] as const;
/** A fold of gathered cloth every this far along the way it gathers, m. */
const FOLD_PITCH = 0.9;

/** Each sail's form, in the rig plan's order. */
export function sailForms(rig: RigPlan): SailForm[] {
  return rig.sails.map((sail, index): SailForm => {
    const names = sail.kind === 'square' ? SQUARE_CORNERS : sail.kind === 'boom' ? BOOM_CORNERS : HEAD_CORNERS;
    const rest = names.map((n) => shipPoint(corner(sail, n))) as unknown as [Vector3, Vector3, Vector3, Vector3];
    const breadth = rest[0].distanceTo(rest[1]);
    if (sail.kind === 'square') {
      // A square sail's height is its drop, head to foot.
      const height = rest[0].y - rest[2].y;
      const yard = sparOf(rig, sail.on[0]!), below = sheetYard(sail);
      const range = yard.yard!.hoisted - yard.yard!.lowered;
      return {
        index, sail, kind: SQUARE, rest, carriers: [yard.id, yard.id, below, below], edges: SQUARE_EDGES,
        foldU: 0, foldV: 1, folds: Math.max(1, Math.round(height / FOLD_PITCH)), breadth, height,
        hoisted: range > NONE ? { yard: yard.id, range } : null, yardRadius: yard.diameter / 2,
      };
    }
    const height = rest[0].distanceTo(rest[2]);
    if (sail.kind === 'boom') {
      return {
        index, sail, kind: FORE_AFT, rest, carriers: ['boom', 'boom', 'gaff', 'gaff'], edges: BOOM_EDGES,
        foldU: 1, foldV: 0, folds: Math.max(1, Math.round(breadth / FOLD_PITCH)), breadth, height, hoisted: null, yardRadius: sparOf(rig, 'boom').diameter / 2,
      };
    }
    return {
      index, sail, kind: FORE_AFT, rest, carriers: [null, null, null, null], edges: HEAD_EDGES,
      foldU: 1 / 2, foldV: 1 / 2, folds: Math.max(1, Math.round(height / FOLD_PITCH)), breadth, height, hoisted: null, yardRadius: 0,
    };
  });
}

/** The yard a square sail's clews are sheeted to (a topsail's to the yard below), else its own (a course's clews swing with its yard). */
function sheetYard(sail: Sail): string {
  const row = SAILS.find((r) => r.id === sail.id);
  return (row?.kind === 'square' ? row.sheetedTo : null) ?? sail.on[0]!;
}

/** A point of a sail that a line is made fast to (a clew, the bunt, a bowline's bridle, the head), and the moving frame it is carried by. */
export interface SailPoint {
  readonly sail: number;
  readonly u: number;
  readonly v: number;
  /** Where it is with the sail set flat and unbraced (ship space): the rope is laid to it there. */
  readonly rest: Vector3;
  readonly frame: number;
}

/** Points nearer than this are one, in the cloth's coordinates. */
export const SAME_POINT = 1e-3;
/** Newton steps to find a point's place in its sail, and the least change worth another. */
const SOLVE_STEPS = 24;
const SOLVE_CLOSE = 1e-7;

/** Every point of a sail that a line ends on, each with a moving frame of its own numbered from `first`. */
export function sailPoints(rig: RigPlan, forms: readonly SailForm[], first: number): SailPoint[] {
  const out: SailPoint[] = [];
  for (const line of rig.lines) {
    for (const e of line.ends) {
      if (e.on !== 'sail') continue;
      const form = forms.find((f) => f.sail.id === e.id)!, at = shipPoint(e);
      const [u, v] = restUV(form, at);
      if (out.some((p) => p.sail === form.index && Math.abs(p.u - u) < SAME_POINT && Math.abs(p.v - v) < SAME_POINT)) continue;
      out.push({ sail: form.index, u, v, rest: bilerp(form.rest, u, v, new Vector3()), frame: first + out.length });
    }
  }
  return out;
}

/** The sail point a line's end on a sail is (by its sail and place). */
export function pointOfEnd(points: readonly SailPoint[], forms: readonly SailForm[], line: RigLine, end: number): SailPoint {
  const e = line.ends[end]!, form = forms.find((f) => f.sail.id === e.id)!, [u, v] = restUV(form, shipPoint(e));
  return points.find((p) => p.sail === form.index && Math.abs(p.u - u) < SAME_POINT && Math.abs(p.v - v) < SAME_POINT)!;
}

/** A point's place (u, v) in a sail's flat patch: its corners exactly, else the nearest place by Newton's steps. */
export function restUV(form: SailForm, p: Vector3): [number, number] {
  const c: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
  for (let i = 0; i < c.length; i++) if (form.rest[i]!.distanceTo(p) < SAME_POINT) return c[i]!;
  let u = 1 / 2, v = 1 / 2;
  const q = new Vector3(), du = new Vector3(), dv = new Vector3();
  for (let k = 0; k < SOLVE_STEPS; k++) {
    bilerp(form.rest, u, v, q);
    const r = q.sub(p);
    // The patch's derivatives along u and v at (u, v).
    du.copy(form.rest[1]).sub(form.rest[0]).multiplyScalar(1 - v).addScaledVector(new Vector3().subVectors(form.rest[3], form.rest[2]), v);
    dv.copy(form.rest[2]).sub(form.rest[0]).multiplyScalar(1 - u).addScaledVector(new Vector3().subVectors(form.rest[3], form.rest[1]), u);
    const a = du.dot(du), b = du.dot(dv), d = dv.dot(dv), e = -r.dot(du), f = -r.dot(dv), det = a * d - b * b;
    const su = (e * d - b * f) / det, sv = (a * f - b * e) / det;
    u = Math.min(1, Math.max(0, u + su));
    v = Math.min(1, Math.max(0, v + sv));
    if (su * su + sv * sv < SOLVE_CLOSE * SOLVE_CLOSE) break;
  }
  return [u, v];
}

/** The point (u, v) of a patch of four corners (P00, P10, P01, P11), into `out`. */
export function bilerp(p: readonly Vector3[], u: number, v: number, out: Vector3): Vector3 {
  const a = (1 - u) * (1 - v), b = u * (1 - v), c = (1 - u) * v, d = u * v;
  return out.set(
    p[0]!.x * a + p[1]!.x * b + p[2]!.x * c + p[3]!.x * d,
    p[0]!.y * a + p[1]!.y * b + p[2]!.y * c + p[3]!.y * d,
    p[0]!.z * a + p[1]!.z * b + p[2]!.z * c + p[3]!.z * d,
  );
}

const half = (x: number) => Math.sin(Math.PI * x);
/** How far the foot of a clewed-up square sail hangs below its line at `u`: a scallop between each buntline and its neighbours. */
export function scallop(u: number): number {
  const local = u < BUNT ? u / BUNT : u > 1 - BUNT ? (u - 1 + BUNT) / BUNT : (u - BUNT) / (1 - 2 * BUNT);
  return half(local);
}

const corners: Vector3[] = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
const vec = (row: ArrayLike<number>, at: number, out: Vector3) => out.set(row[at]!, row[at + 1]!, row[at + 2]!);
const belly = new Vector3(), rollUp = new Vector3(), headAt = new Vector3(), fly = new Vector3(), down = new Vector3(), side = new Vector3();

/**
 * Where the point (u, v) of a sail's cloth is drawn (ship space), from its row of numbers at time `t` (s): the one shape
 * the sail kind's vertex stage draws too (sailMaterial.ts `clothShape`, written alike line for line).
 */
export function clothAt(row: ArrayLike<number>, u: number, v: number, t: number, out = new Vector3()): Vector3 {
  for (let i = 0; i < corners.length; i++) vec(row, i * TEXEL, corners[i]!);
  const R = ROW;
  if (row[R.kind] === FLAG) return flagAt(row, u, v, t, out);
  const square = row[R.kind] === SQUARE ? 1 : 0, taken = row[R.taken]!, uKeep = row[R.uKeep]!, vKeep = row[R.vKeep]!;
  const vs = taken > NONE ? Math.min(1, Math.max(0, (v - taken) / (1 - taken))) : v;
  // Gathered: a square sail toward its yard's middle; a fore-and-aft sail toward its luff, a headsail (its head one
  // corner) as a smaller triangle whose head has come down its stay and whose clew has come in.
  const tri = !square && corners[2]!.distanceTo(corners[3]!) < SAME_POINT ? 1 : 0;
  const ug = square ? 1 / 2 + (u - 1 / 2) * (1 + (uKeep - 1) * vs) : (u * uKeep * (1 - vs * tri)) / Math.max(1 - vs * vKeep * tri, NONE);
  const vg = vs * vKeep + square * (1 - vKeep) * SCALLOP * vs * scallop(u);
  bilerp(corners, ug, vg, out);
  vec(row, R.belly, belly);
  const f = (1 - vs) * row[R.edgeA]! * half(u) + vs * row[R.edgeB]! * half(u) + (1 - u) * row[R.edgeL]! * half(vs) + u * row[R.edgeR]! * half(vs) + row[R.middle]! * half(u) * half(vs);
  const coord = row[R.foldU]! * u + row[R.foldV]! * vs, phase = row[R.phase]!;
  const shiverW = (1 - Math.abs(u - row[R.luff]!) * SHIVER_FALL) * half(vs);
  const off = row[R.depth]! * f
    + row[R.foldDepth]! * Math.sin(TURN * row[R.folds]! * coord)
    + row[R.shiver]! * shiverW * Math.sin(TURN * (SHIVER_WAVES * (u + SHIVER_SLANT * vs) - SHIVER_HZ * t) + phase)
    + row[R.breathe]! * half(u) * half(vs) * Math.sin(TURN * BREATHE_HZ * t + phase + BREATHE_U * u + BREATHE_V * vs);
  out.addScaledVector(belly, off);
  // Rolled up on the yard (a square sail furled), and the reef's roll at its head or along its boom.
  vec(row, R.rollUp, rollUp);
  bilerp(corners, u, 0, headAt);
  const radius = row[R.rollRadius]! * (ROLL_ENDS + (1 - ROLL_ENDS) * half(u)), roll = row[R.roll]! * square;
  if (roll > 0) out.lerp(rolled(headAt, rollUp, belly, row[R.yardRadius]!, radius, vs, new Vector3()), roll);
  if (taken > NONE && v < taken) rolled(headAt, rollUp, belly, row[R.yardRadius]!, radius * REEF_ROLL, v / taken, out);
  // Held clear of the masts' timber (sailClear.ts), last, so a rolled bunt and a sail aback keep clear too.
  cleared(row, R.clear, out);
  return out;
}

/** A point of cloth rolled round a spar: `t` (0..1) of the way round its turns, of `radius` at most, over a spar of `spar` m radius. */
function rolled(at: Vector3, up: Vector3, toward: Vector3, spar: number, radius: number, t: number, out: Vector3): Vector3 {
  const a = t * ROLL_TURNS * TURN, r = radius * (1 - ROLL_IN * t);
  return out.copy(at).addScaledVector(up, spar + radius - Math.cos(a) * r).addScaledVector(toward, Math.sin(a) * r);
}

/** A flag's cloth: from its hoist (v: top 0 to foot 1) out along its fly (u), streaming down the wind and waving. */
function flagAt(row: ArrayLike<number>, u: number, v: number, t: number, out: Vector3): Vector3 {
  const R = ROW, top = corners[0]!, foot = corners[2]!;
  down.subVectors(foot, top);
  const hoist = down.length();
  down.divideScalar(hoist);
  vec(row, R.belly, fly);
  const k = row[R.stream]!;
  side.crossVectors(fly, down).normalize();
  const along = new Vector3().copy(down).multiplyScalar(1 - k).addScaledVector(fly, k).normalize();
  const tv = 1 / 2 + (v - 1 / 2) * (1 - row[R.taper]! * u);
  const wave = row[R.wave]! * u * Math.sin(TURN * (row[R.waves]! * u - row[R.waveRate]! * t) + row[R.phase]!);
  return out.copy(top).addScaledVector(down, tv * hoist).addScaledVector(along, u * row[R.fly]!).addScaledVector(side, wave);
}

/** A matrix that carries `rest` to `now` (a sail point's moving frame: a shift). */
export function shiftFrame(rest: Vector3, now: Vector3, out = new Matrix4()): Matrix4 {
  return out.makeTranslation(now.x - rest.x, now.y - rest.y, now.z - rest.z);
}

/** The turning spar of `id` among `swings`, or null. */
export const swingNamed = (swings: readonly Swing[], id: string | null): Swing | null => (id ? swings.find((w) => w.id === id) ?? null : null);
