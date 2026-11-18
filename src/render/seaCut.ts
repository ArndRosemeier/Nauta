// @ts-nocheck -- three's TSL typings infer vector widths poorly for shader math; checked by rendering it (npm run shot).
/**
 * The water inside her hull is not drawn (plan N2.0, N2.4): where a point of the sea's surface lies inside her hull
 * and below her deck at the side, the sea's shader leaves it out. Her berth deck lies below the waterline, so without
 * this the sea would run through it. The ship's view writes where she is each frame. N2.5 makes the waterline clean.
 */
import { Matrix4 } from 'three/webgpu';
import { abs, float, step, uniform, vec4 } from 'three/tsl';
import { hullAt } from './ship/hullNode';

export const SEA_CUT = {
  /** From the sea's own frame (its origin) into ship space. */
  toShip: uniform(new Matrix4()),
  /** 1 while a ship floats here, 0 for open sea. */
  on: uniform(0),
};

/** True where the sea is drawn: `placed` is a point of its surface in the sea's frame. */
export function seaCut(placed) {
  const C = SEA_CUT;
  const p = C.toShip.mul(vec4(placed, 1)).xyz;
  const hull = hullAt(p.z, p.y);
  const inside = step(abs(p.x), hull.half).mul(step(p.y, hull.deck));
  return inside.mul(C.on).lessThan(float(1 / 2));
}
