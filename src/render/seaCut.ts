// @ts-nocheck -- three's TSL typings infer vector widths poorly for shader math; checked by rendering it (npm run shot).
/**
 * The water inside her hull is not drawn (plan N2.0): where a point of the sea's surface lies inside her section,
 * between the slice's ends and below her deck, the sea's shader leaves it out. Her berth deck lies below the
 * waterline, so without this the sea would run through it. The ship's view writes where she is each frame.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { abs, float, step, uniform, vec4 } from 'three/tsl';
import { hullHalfBreadth } from './ship/hullNode';

export const SEA_CUT = {
  /** From the sea's own frame (its origin) into ship space. */
  toShip: uniform(new Matrix4()),
  /** Where she is cut off: fore z, aft z, and her deck's height at the side (ship space); x 0 and y 0: no cut. */
  box: uniform(new Vector3()),
  /** 1 while a ship floats here, 0 for open sea. */
  on: uniform(0),
};

/** True where the sea is drawn: `placed` is a point of its surface in the sea's frame. */
export function seaCut(placed) {
  const C = SEA_CUT;
  const p = C.toShip.mul(vec4(placed, 1)).xyz;
  const inside = step(abs(p.x), hullHalfBreadth(p.y)).mul(step(C.box.x, p.z)).mul(step(p.z, C.box.y)).mul(step(p.y, C.box.z));
  return inside.mul(C.on).lessThan(float(1 / 2));
}
