/**
 * Rope as the rope kind draws it (materials.ts SHIP_ROPE, ropeMaterial.ts): every line a tube round its centre line.
 * The vertex stage pushes each vertex out from the centre to the rope's radius, or to half a pixel where the rope is
 * thinner than that, and the fragment stage fades it by how much of the pixel the real rope covers, so far rigging
 * never breaks into a shimmer (ship.md). So a vertex carries its centre (position), which way it lies from the
 * centre (normal), and `rope`: the way round (0..1), metres along the rope, the radius, and how tarred it is.
 */
import { Vector3 } from 'three/webgpu';
import { Gathered } from './gathered';

/** Sides of a rope's tube: enough to shade round at arm's length (the lay's normals do the rest). */
const SIDES = 6;
/** Numbers per attribute. */
const XYZ = 3;
const ROPE = 4;
/** f(1 - f) at the middle of a span, where a hanging rope sags most. */
const PARABOLA_PEAK = 1 / 4;
/** A line shorter than this is left out, m. */
const SHORTEST = 1e-4;

/** The attributes of the rope kind's meshes. */
export const ROPE_ATTRIBUTES = ['position', 'normal', 'rope', 'along'] as const;
export const ROPE_STRIDES: Readonly<Record<string, number>> = { rope: ROPE, along: XYZ };

/** All the lines of one mesh. */
export class Ropes extends Gathered {
  private readonly pos = this.array('position', XYZ);
  private readonly nor = this.array('normal', XYZ);
  private readonly rope = this.array('rope', ROPE);
  private readonly along = this.array('along', XYZ);
  /** Metres of rope laid, for the budget notes. */
  length = 0;

  /** A rope through `points` (ship space), of `radius` m; `tar` 0 (plain hemp) to 1 (tarred black). */
  line(points: readonly Vector3[], radius: number, tar: number): void {
    if (points.length < 2) return;
    const t = new Vector3(), n = new Vector3(), b = new Vector3(), prevT = new Vector3(), axis = new Vector3();
    let run = 0;
    const base = this.pos.length / XYZ;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      // The tangent from the neighbours; the frame carried along it without twisting (parallel transport).
      t.subVectors(points[Math.min(points.length - 1, i + 1)]!, points[Math.max(0, i - 1)]!);
      if (t.lengthSq() < SHORTEST * SHORTEST) t.set(0, 1, 0);
      t.normalize();
      if (i === 0) {
        n.set(0, 1, 0).cross(t);
        if (n.lengthSq() < SHORTEST) n.set(1, 0, 0).cross(t);
        n.normalize();
      } else {
        axis.crossVectors(prevT, t);
        const s = axis.length();
        if (s > SHORTEST) n.applyAxisAngle(axis.normalize(), Math.asin(Math.min(1, s)));
        run += p.distanceTo(points[i - 1]!);
      }
      prevT.copy(t);
      b.crossVectors(t, n);
      for (let k = 0; k <= SIDES; k++) {
        const a = (k / SIDES) * 2 * Math.PI;
        const rx = n.x * Math.cos(a) + b.x * Math.sin(a), ry = n.y * Math.cos(a) + b.y * Math.sin(a), rz = n.z * Math.cos(a) + b.z * Math.sin(a);
        this.pos.push(p.x, p.y, p.z);
        this.nor.push(rx, ry, rz);
        this.rope.push(k / SIDES, run, radius, tar);
        this.along.push(t.x, t.y, t.z);
      }
    }
    this.length += run;
    const ring = SIDES + 1;
    for (let i = 0; i < points.length - 1; i++) {
      for (let k = 0; k < SIDES; k++) {
        const a = base + i * ring + k, c = a + ring;
        this.idx.push(a, c, c + 1, a, c + 1, a + 1);
      }
    }
  }
}

/** Points along a straight line, `steps` pieces. */
export function straight(a: Vector3, b: Vector3, steps = 1): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i <= steps; i++) out.push(new Vector3().lerpVectors(a, b, i / steps));
  return out;
}

/** Points along a rope hanging between a and b, sagging `sag` m below the chord at its middle (a parabola, close to a catenary for any sag a line on board shows). */
export function hanging(a: Vector3, b: Vector3, sag: number, steps: number): Vector3[] {
  const out: Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps, p = new Vector3().lerpVectors(a, b, f);
    p.y -= sag * f * (1 - f) / PARABOLA_PEAK;
    out.push(p);
  }
  return out;
}
