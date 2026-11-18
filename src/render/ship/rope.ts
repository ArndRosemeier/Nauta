/**
 * Rope as the rope kind draws it (materials.ts SHIP_ROPE, ropeMaterial.ts): every line a tube round its centre line.
 * The vertex stage pushes each vertex out from the centre to the rope's radius, or to half a pixel where the rope is
 * thinner than that, and the fragment stage fades it by how much of the pixel the real rope covers, so far rigging
 * never breaks into a shimmer (ship.md). So a vertex carries its centre (position), which way it lies from the
 * centre (normal), and `rope`: the way round (0..1), metres along the rope, the radius, and how tarred it is.
 *
 * A rope made fast to a spar that turns (a yard bracing round, the boom swinging: swings.ts) follows it on the GPU:
 * each vertex says which two of the ship's moving frames its ends are carried by and where along between them it
 * lies (`follow`), and where those ends are (`anchorA`, `anchorB`). The vertex stage moves it as the ends move, so a
 * brace stays a line from the yardarm to its block however far the yard is braced, and nothing is rebuilt.
 */
import { Vector3 } from 'three/webgpu';
import { Gathered } from './gathered';

/** Sides of a rope's tube: enough to shade round at arm's length (the lay's normals do the rest). */
const SIDES = 6;
/** Numbers per attribute. */
const XYZ = 3;
const ROPE = 4;
/** How tarred a rope is drawn: standing rigging tarred black, running rigging plain hemp, a little darkened by use. */
export const TARRED = 1;
export const HEMP = 0.15;
/** The rope's sides near (enough to shade round at arm's length) and where a few will do (coils, the far ship). */
export const FEW_SIDES = 4;
/** f(1 - f) at the middle of a span, where a hanging rope sags most. */
const PARABOLA_PEAK = 1 / 4;
/** A line shorter than this is left out, m. */
const SHORTEST = 1e-4;

/** The attributes of the rope kind's meshes. */
export const ROPE_ATTRIBUTES = ['position', 'normal', 'rope', 'along', 'follow', 'anchorA', 'anchorB'] as const;
export const ROPE_STRIDES: Readonly<Record<string, number>> = { rope: ROPE, along: XYZ, follow: XYZ, anchorA: XYZ, anchorB: XYZ };

/**
 * Which of the ship's moving frames a point of a rope follows (0: her hull, still; swings.ts numbers the others): it
 * moves as frame `a` moves `A` and frame `b` moves `B`, blended by `t`. With `a` equal to `b` it turns rigidly with
 * that frame (a footrope under its yard).
 */
export interface RopeFollow {
  readonly a: number;
  readonly b: number;
  readonly t: number;
  readonly A: Vector3;
  readonly B: Vector3;
}
const ORIGIN = new Vector3();
/** Following nothing: on her hull. */
export const STILL: RopeFollow = { a: 0, b: 0, t: 0, A: ORIGIN, B: ORIGIN };
/** The follow of the points of a leg from `A` (on frame `a`) to `B` (on frame `b`), one per point of `points` (its share along it by index). */
export function legFollow(a: number, A: Vector3, b: number, B: Vector3, count: number): RopeFollow[] {
  return Array.from({ length: count }, (_, i) => ({ a, b, t: count > 1 ? i / (count - 1) : 0, A, B }));
}

/** All the lines of one mesh. */
export class Ropes extends Gathered {
  private readonly pos = this.array('position', XYZ);
  private readonly nor = this.array('normal', XYZ);
  private readonly rope = this.array('rope', ROPE);
  private readonly along = this.array('along', XYZ);
  private readonly follow = this.array('follow', XYZ);
  private readonly anchorA = this.array('anchorA', XYZ);
  private readonly anchorB = this.array('anchorB', XYZ);
  /** Metres of rope laid, for the budget notes. */
  length = 0;

  /**
   * A rope through `points` (ship space), of `radius` m; `tar` 0 (plain hemp) to 1 (tarred black); `sides` round;
   * `follow`: what each point moves with (all still if left out).
   */
  line(points: readonly Vector3[], radius: number, tar: number, sides = SIDES, follow?: readonly RopeFollow[]): void {
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
      const f = follow?.[i] ?? STILL;
      for (let k = 0; k <= sides; k++) {
        const a = (k / sides) * 2 * Math.PI;
        const rx = n.x * Math.cos(a) + b.x * Math.sin(a), ry = n.y * Math.cos(a) + b.y * Math.sin(a), rz = n.z * Math.cos(a) + b.z * Math.sin(a);
        this.pos.push(p.x, p.y, p.z);
        this.nor.push(rx, ry, rz);
        this.rope.push(k / sides, run, radius, tar);
        this.along.push(t.x, t.y, t.z);
        this.follow.push(f.a, f.b, f.t);
        this.anchorA.push(f.A.x, f.A.y, f.A.z);
        this.anchorB.push(f.B.x, f.B.y, f.B.z);
      }
    }
    this.length += run;
    const ring = sides + 1;
    for (let i = 0; i < points.length - 1; i++) {
      for (let k = 0; k < sides; k++) {
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

/** Straight down. */
const DOWN = new Vector3(0, -1, 0);
/**
 * Points along a rope hanging between a and b, `sag` m at its middle for a level span: it hangs across its chord, so
 * a steep rope sags less, and one hanging straight up and down not at all (a parabola, close to a catenary for any sag a line on board shows).
 */
export function sagging(a: Vector3, b: Vector3, sag: number, steps: number): Vector3[] {
  const chord = new Vector3().subVectors(b, a), len = chord.length();
  const across = DOWN.clone();
  if (len > SHORTEST) across.addScaledVector(chord, -DOWN.dot(chord) / (len * len));
  const out: Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    out.push(new Vector3().lerpVectors(a, b, f).addScaledVector(across, sag * f * (1 - f) / PARABOLA_PEAK));
  }
  return out;
}
