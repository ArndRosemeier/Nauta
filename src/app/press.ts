/**
 * A press on the screen and whether its lift makes it a tap (a finger) or a click (the mouse): lifted soon enough
 * and near enough to where it went down. The fan's taps on the walking thumb's half and the click that takes the mouse
 * (orderFan.ts, mouse.ts) both ask here.
 */

/** Where and when a pointer went down. */
export interface Press {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

/** The press a pointer's going down makes. */
export const pressOf = (e: PointerEvent): Press => ({ id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp });

/** Whether lifting `e` ends `p` as a tap: the same pointer, within `ms` of going down and `slop` px of where it went down. */
export const isTap = (p: Press, e: PointerEvent, ms: number, slop: number): boolean =>
  p.id === e.pointerId && e.timeStamp - p.t <= ms && Math.hypot(e.clientX - p.x, e.clientY - p.y) <= slop;
