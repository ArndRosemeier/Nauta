/**
 * Where the captain looks: a heading and a tilt, turned by dragging (a finger on a tablet, the mouse on a desk).
 * Pure: the input (lookInput.ts) feeds it pixels, the view reads the direction.
 */

/** Looking no higher or lower than this (rad): just short of straight up and down, so the view never flips. */
export const PITCH_LIMIT = 1.5;

export interface Look {
  /** Heading, rad: 0 looks along -z, growing to the left (three's camera yaw about +y). */
  yaw: number;
  /** Tilt, rad: up is positive. */
  pitch: number;
}

/**
 * Turn by a drag of (dx, dy) pixels. The picture follows the finger: `radPerPixel` is the view's vertical angle
 * over its height in pixels, so a point under the finger stays under it (exactly at the view's middle).
 */
export function turn(look: Look, dx: number, dy: number, radPerPixel: number): Look {
  const yaw = wrap(look.yaw + dx * radPerPixel);
  const pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, look.pitch + dy * radPerPixel));
  return { yaw, pitch };
}

/** The unit direction looked along (x, y, z; +y up). */
export function lookDir(look: Look): [number, number, number] {
  const c = Math.cos(look.pitch);
  return [-Math.sin(look.yaw) * c, Math.sin(look.pitch), -Math.cos(look.yaw) * c];
}

/** An angle brought into -pi..pi, so a heading never grows without end. */
function wrap(a: number): number {
  const t = (a + Math.PI) % (2 * Math.PI);
  return (t < 0 ? t + 2 * Math.PI : t) - Math.PI;
}
