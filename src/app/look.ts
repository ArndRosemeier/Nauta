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

/** What drags the look: a finger (or pen) on the glass, or the mouse on a desk. */
export type Dragger = 'finger' | 'mouse';

/** How a drag turns the look besides the natural (the player's settings, plan N7.3). */
export interface LookFeel {
  /** Times the natural turn: 1 keeps the picture under a finger. */
  readonly speed: number;
  /** The mouse moved up looks down, as a flight stick does (a finger always drags the picture). */
  readonly inverted: boolean;
}

/** The natural feel: the picture under the finger, the mouse up looking up. */
export const NATURAL: LookFeel = { speed: 1, inverted: false };

/**
 * Turn by a drag of (dx, dy) pixels. Under a finger the picture follows it: `radPerPixel` is the view's vertical
 * angle over its height in pixels, so a point under the finger stays under it (exactly at the view's middle). The
 * mouse steers the head instead, as on every desk game: moved right, he looks right (Arnd 2026-11-18, "mouselook is
 * left/right inverted"), moved up, he looks up, unless the player inverts it. `feel` scales the turn.
 */
export function turn(look: Look, dx: number, dy: number, radPerPixel: number, by: Dragger = 'finger', feel: LookFeel = NATURAL): Look {
  const k = radPerPixel * feel.speed, head = by === 'mouse' ? -1 : 1, nod = by === 'mouse' && !feel.inverted ? -1 : 1;
  const yaw = wrap(look.yaw + head * dx * k);
  const pitch = Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, look.pitch + nod * dy * k));
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
