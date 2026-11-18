/**
 * Her spars going over the side (plan N6.5), worked out for the drawing from the simulation's damage alone: a part
 * broken (`Damage.fallen`) brings down its spar above the break and every spar stepped on it, with their yards, tops
 * and blocks, over the side its entry in `alongside` names. The wreck topples about the break, its foot sliding out to
 * her side, and lies trailing aft in the water alongside, rising and falling a little, until it is cut away; then it
 * drifts astern and sinks out of sight. What is made fast to it (her ropes, by its moving frames) goes with it while
 * it lies alongside and is cut at her side once it is cut away.
 *
 * Her outside's timber and iron name the spars that stand by runs of their index (`Gathered.tagged`): the triangles
 * of the spars that go are taken out of her outside's index and drawn as the wreck's own mesh, turned by its matrix,
 * so nothing is drawn twice and a sound ship draws exactly as before. Pure but for three's maths.
 */
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { sparParts } from '../../sim/damage/meet';
import { hullHalfBreadth, sheer } from '../../sim/ship/hull';
import { sparOf, type RigPlan } from '../../sim/ship/rig';
import { shipY, shipZ } from '../../sim/ship/section';
import type { Packed } from './gathered';
import { shipPoint } from './swings';

/** Seconds a fall takes per root of the metres from its break to its head (a falling pole's time goes as √length). */
const TOPPLE_PER_ROOT_M = 0.8;
/** It comes to lie this far aft of square out from her side, rad (dragged aft by her way), its foot this far off her side and this high over her waterline, m. */
const TRAIL = 1.05;
const CLEAR = 0.4;
const FLOATS = 0.1;
/** Lying alongside it rises and falls this much, m, every this many seconds. */
const BOB = 0.15;
const BOB_SECONDS = 4.5;
/** Cut away, it falls astern at this speed, m/s, and out from her at this, sinking this fast to this deep, m/s and m; this long after, it is gone, s. */
const DRIFT = { aft: 2.5, out: 0.4, sink: 0.12, deepest: 3, gone: 40 } as const;
/** Corners per triangle. */
const CORNERS = 3;
/** Numbers per position. */
const XYZ = 3;

/** How a broken spar goes: which spars it takes, the break, its direction, the side, and where and how it comes to lie. */
export interface FallShape {
  /** The part it broke at (`sparParts` place) and the spar it is of. */
  readonly part: number;
  readonly root: string;
  /** Every spar that goes: the root and all stepped on it. */
  readonly carried: ReadonlySet<string>;
  /** The break, ship space, and the root's direction from heel to head. */
  readonly hinge: Vector3;
  readonly axis: Vector3;
  /** The side it goes over: -1 larboard, 1 starboard. */
  readonly side: -1 | 1;
  /** Where the break comes to lie (ship space), the turn that lays it there, and how long the fall takes, s. */
  readonly landing: Vector3;
  readonly turn: Quaternion;
  readonly topple: number;
}

/** The fall of part `part` over side `side`. */
export function fallShape(rig: RigPlan, part: number, side: -1 | 1): FallShape {
  const p = sparParts()[part]!, root = sparOf(rig, p.spar), carried = new Set<string>([root.id]);
  // Spars are listed after the spar they are stepped on: one pass gathers all a fall takes.
  for (const s of rig.spars) if (s.on !== null && carried.has(s.on)) carried.add(s.id);
  const [along, across, height] = p.from;
  const hinge = new Vector3(across, shipY(height), shipZ(along));
  const axis = shipPoint(root.head).sub(shipPoint(root.heel)).normalize();
  const lying = new Vector3(side * Math.cos(TRAIL), 0, Math.sin(TRAIL)).normalize();
  const landing = new Vector3(side * (hullHalfBreadth(along, sheer(along)) + CLEAR), FLOATS, hinge.z);
  const reach = shipPoint(root.head).distanceTo(hinge);
  return { part, root: root.id, carried, hinge, axis, side, landing, turn: new Quaternion().setFromUnitVectors(axis, lying), topple: TOPPLE_PER_ROOT_M * Math.sqrt(reach) };
}

const turned = new Quaternion(), at = new Vector3(), one = new Vector3(1, 1, 1), back = new Matrix4(), NO_TURN = new Quaternion();

/**
 * The wreck's matrix (ship space to ship space) `since` s after it began to fall; `adrift`: s since it was cut away
 * (NaN while it lies alongside). Identity at the start; it falls faster as it goes (as a pole falls), its foot
 * sliding out over her side last.
 */
export function wreckMatrix(f: FallShape, since: number, adrift: number, out = new Matrix4()): Matrix4 {
  const s = Math.min(1, Math.max(0, since / f.topple)), fall = s * s;
  turned.slerpQuaternions(NO_TURN, f.turn, fall);
  at.lerpVectors(f.hinge, f.landing, fall * fall);
  // Lying alongside it rises and falls (one that fell before she was first drawn, `since` infinite, from the middle).
  if (s >= 1 && Number.isFinite(since)) at.y += BOB * Math.sin((2 * Math.PI * (since - f.topple)) / BOB_SECONDS);
  if (adrift >= 0) {
    at.z += DRIFT.aft * adrift;
    at.x += f.side * DRIFT.out * adrift;
    at.y -= Math.min(DRIFT.deepest, DRIFT.sink * adrift);
  }
  out.compose(at, turned, one);
  return out.multiply(back.makeTranslation(-f.hinge.x, -f.hinge.y, -f.hinge.z));
}

/** Whether a wreck cut away `adrift` s ago is gone from sight. */
export const driftedOff = (adrift: number): boolean => adrift >= DRIFT.gone;

/**
 * Where her ropes made fast to a wreck cut away are cut: all of a frame drawn into the point at her side where the
 * wreck came to lie (a rope from her to it ends there, one wholly on it is gone).
 */
export function cutAtSide(f: FallShape, out = new Matrix4()): Matrix4 {
  return out.makeScale(0, 0, 0).setPosition(f.landing);
}

/**
 * Which triangles of `packed` the fall takes, marked in `gone` (one flag a triangle, kept across falls): every run
 * named for a spar it carries, and of the root's own runs only what lies past the break. Returns the index of the
 * triangles it took (empty: none of this mesh goes).
 */
export function takeFallen(packed: Packed, f: FallShape, gone: Uint8Array): Uint32Array {
  const pos = packed.attributes.find((a) => a.name === 'position')!.data, idx = packed.index, out: number[] = [];
  const centre = new Vector3(), p = new Vector3();
  for (const [name, from, to] of packed.runs ?? []) {
    if (!f.carried.has(name)) continue;
    for (let i = from; i < to; i += CORNERS) {
      const tri = i / CORNERS;
      if (gone[tri]) continue;
      if (name === f.root) {
        centre.set(0, 0, 0);
        for (let k = 0; k < CORNERS; k++) centre.add(p.fromArray(pos, idx[i + k]! * XYZ));
        if (centre.divideScalar(CORNERS).sub(f.hinge).dot(f.axis) < 0) continue;
      }
      gone[tri] = 1;
      out.push(idx[i]!, idx[i + 1]!, idx[i + 2]!);
    }
  }
  return new Uint32Array(out);
}

/** `packed`'s index without the triangles marked `gone`. */
export function keptIndex(packed: Packed, gone: Uint8Array): Uint32Array {
  const idx = packed.index, out = new Uint32Array(idx.length);
  let n = 0;
  for (let i = 0; i < idx.length; i += CORNERS) {
    if (gone[i / CORNERS]) continue;
    out[n++] = idx[i]!; out[n++] = idx[i + 1]!; out[n++] = idx[i + 2]!;
  }
  return out.slice(0, n);
}
