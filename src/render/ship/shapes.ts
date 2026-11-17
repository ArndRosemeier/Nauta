/**
 * The shapes her timber and iron are built of, written into a Solid (solid.ts): boxes with rounded edges (nothing
 * on her has a knife edge; a worn edge catches the light), turned pieces, and surfaces swept along her length.
 */
import { Matrix3, Matrix4, Vector3 } from 'three/webgpu';
import type { Finish, Solid } from './solid';

/** Below this rounding a box is built with plain square edges, m. */
const NO_BEVEL = 0.001;
/** How much a fully rounded edge counts as worn (the kinds wear paint and dirt off by it). */
const EDGE_WEAR = 2.5;
/** The most of a box's half size its rounding may take. */
const MOST_BEVEL = 0.45;
/** A turn, rad. */
const TURN = 2 * Math.PI;
/** Axes of a box: x, y, z. */
const AXES = 3;

const tmp = new Vector3(), tmpN = new Vector3(), q = new Vector3(), d = new Vector3();

/**
 * A box of `size` (m) round the origin of `frame` (its axes are the box's), its edges rounded by `bevel` m. The
 * grain runs along the frame's axis `grain` (0, 1 or 2): every face's u is the position along it, v across.
 */
export function box(s: Solid, frame: Matrix4, size: readonly [number, number, number], f: Finish, bevel = 0, grain = 0, ao = 1): void {
  const h = [size[0] / 2, size[1] / 2, size[2] / 2] as const;
  const c = Math.min(bevel, h[0] * MOST_BEVEL, h[1] * MOST_BEVEL, h[2] * MOST_BEVEL);
  const normalM = new Matrix3().getNormalMatrix(frame);
  for (let axis = 0; axis < AXES; axis++) {
    for (const sign of [-1, 1]) {
      // The face's two in-plane axes, ordered so the quads face outward.
      const a1 = (axis + (sign > 0 ? 1 : 2)) % AXES, a2 = (axis + (sign > 0 ? 2 : 1)) % AXES;
      const ts1 = c > NO_BEVEL ? [-h[a1], -h[a1] + c, h[a1] - c, h[a1]] : [-h[a1], h[a1]];
      const ts2 = c > NO_BEVEL ? [-h[a2], -h[a2] + c, h[a2] - c, h[a2]] : [-h[a2], h[a2]];
      const face = new Vector3().setComponent(axis, sign);
      const ids: number[][] = [];
      for (const t1 of ts1) {
        const row: number[] = [];
        for (const t2 of ts2) {
          const p = new Vector3().setComponent(axis, sign * h[axis]).setComponent(a1, t1).setComponent(a2, t2);
          let n = face.clone();
          let pos = p;
          if (c > NO_BEVEL) {
            // On a box shrunk by the bevel, pushed out by it: a rounded edge with smooth normals.
            q.set(Math.max(-h[0] + c, Math.min(h[0] - c, p.x)), Math.max(-h[1] + c, Math.min(h[1] - c, p.y)), Math.max(-h[2] + c, Math.min(h[2] - c, p.z)));
            d.subVectors(p, q).normalize();
            n = d.clone();
            pos = q.clone().addScaledVector(d, c);
          }
          const wear = Math.min(1, (1 - n.dot(face)) * EDGE_WEAR);
          // The grain: along the grain axis, and across it on this face (end grain is laid across, as sawn).
          const across = a1 === grain ? a2 : a1;
          const u = axis === grain ? pos.getComponent(a1) : pos.getComponent(grain);
          const v = axis === grain ? pos.getComponent(a2) : pos.getComponent(across) + sign * (axis + 1);
          tmp.copy(pos).applyMatrix4(frame);
          tmpN.copy(n).applyMatrix3(normalM).normalize();
          row.push(s.vertex(tmp, tmpN, f, u, v, ao, wear));
        }
        ids.push(row);
      }
      for (let i = 0; i < ids.length - 1; i++) {
        for (let j = 0; j < ids[i]!.length - 1; j++) s.quad(ids[i]![j]!, ids[i + 1]![j]!, ids[i + 1]![j + 1]!, ids[i]![j + 1]!);
      }
    }
  }
}

/**
 * A turned piece about the frame's y axis: `profile` is [radius, y] from bottom to top, `sides` round. A radius of 0
 * closes it on the axis. The grain runs along the axis.
 */
export function lathe(s: Solid, frame: Matrix4, profile: readonly (readonly [number, number])[], sides: number, f: Finish, ao = 1): void {
  const normalM = new Matrix3().getNormalMatrix(frame);
  const rows: number[][] = [];
  for (let i = 0; i < profile.length; i++) {
    const [r, y] = profile[i]!;
    // The profile's slope here gives the normal's tilt (from the neighbours, so a smooth turn shades smooth).
    const prev = profile[Math.max(0, i - 1)]!, next = profile[Math.min(profile.length - 1, i + 1)]!;
    const dr = next[0] - prev[0], dy = next[1] - prev[1], len = Math.hypot(dr, dy) || 1;
    const row: number[] = [];
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * TURN, cs = Math.cos(a), sn = Math.sin(a);
      tmp.set(r * cs, y, r * sn).applyMatrix4(frame);
      tmpN.set((dy / len) * cs, -dr / len, (dy / len) * sn).applyMatrix3(normalM).normalize();
      row.push(s.vertex(tmp, tmpN, f, y, a * Math.max(r, NO_BEVEL), ao));
    }
    rows.push(row);
  }
  for (let i = 0; i < rows.length - 1; i++) {
    for (let k = 0; k < sides; k++) s.quad(rows[i]![k]!, rows[i + 1]![k]!, rows[i + 1]![k + 1]!, rows[i]![k + 1]!);
  }
}

/** A rod between two points in ship space (iron bars, bolts, the bars of the grating are boxes), `sides` round. */
export function rod(s: Solid, a: Vector3, b: Vector3, radius: number, sides: number, f: Finish, ao = 1): void {
  const len = a.distanceTo(b);
  lathe(s, frameAlong(a, b), [[0, 0], [radius, 0], [radius, len], [0, len]], sides, f, ao);
}

/** A frame whose origin is `a` and whose y axis points to `b` (x chosen level where it can be). */
export function frameAlong(a: Vector3, b: Vector3): Matrix4 {
  const y = new Vector3().subVectors(b, a).normalize();
  const side = Math.abs(y.y) > 1 - NO_BEVEL ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const x = new Vector3().crossVectors(y, side).normalize(), z = new Vector3().crossVectors(x, y);
  return new Matrix4().makeBasis(x, y, z).setPosition(a);
}

/**
 * A surface through rows of points (each row one line across the surface, the rows one after another), with its
 * normals from the grid. `uv(i, j)` gives each vertex's grain coordinates. Faces whose cell `keep(i, j)` says no are
 * left out (gun ports, hatches). `flip` turns the faces round.
 */
export function sheet(s: Solid, rows: readonly (readonly Vector3[])[], f: Finish, uv: (i: number, j: number) => [number, number], keep: (i: number, j: number) => boolean = () => true, flip = false, ao: (i: number, j: number) => number = () => 1): void {
  const ids: number[][] = [];
  const n = new Vector3(), du = new Vector3(), dv = new Vector3();
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!, out: number[] = [];
    for (let j = 0; j < row.length; j++) {
      const ip = rows[Math.max(0, i - 1)]![j]!, inx = rows[Math.min(rows.length - 1, i + 1)]![j]!;
      const jp = row[Math.max(0, j - 1)]!, jn = row[Math.min(row.length - 1, j + 1)]!;
      du.subVectors(inx, ip);
      dv.subVectors(jn, jp);
      n.crossVectors(du, dv).normalize();
      if (flip) n.negate();
      const [u, v] = uv(i, j);
      out.push(s.vertex(row[j]!, n, f, u, v, ao(i, j)));
    }
    ids.push(out);
  }
  for (let i = 0; i < ids.length - 1; i++) {
    for (let j = 0; j < ids[i]!.length - 1; j++) {
      if (!keep(i, j)) continue;
      const a = ids[i]![j]!, b = ids[i + 1]![j]!, c = ids[i + 1]![j + 1]!, e = ids[i]![j + 1]!;
      if (flip) s.quad(a, e, c, b); else s.quad(a, b, c, e);
    }
  }
}
