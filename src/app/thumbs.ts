/**
 * The walking thumb and the keys as a push (implementation plan N2.3; pure): the left thumb lands anywhere on the left
 * of the screen and becomes a stick there, its drag from where it landed saying where to walk and how fast; keys do
 * the same on a desk. The right thumb (or the mouse) looks (look.ts).
 */

/** How far the thumb drags for a full push, px (CSS pixels: a thumb's comfortable reach on a tablet's glass). */
export const STICK_REACH = 56;
/** A drag under this share of the reach is no push: a resting thumb never creeps. */
const DEAD_ZONE = 0.15;

/** Forward (+1) and back (-1), right (+1) and left (-1): what the thumbs or keys ask, no more than one long. */
export interface Push {
  readonly forward: number;
  readonly strafe: number;
}

export const NO_PUSH: Push = { forward: 0, strafe: 0 };

/** The push of a thumb dragged (dx, dy) px from where it landed (screen y grows downward): up is forward. */
export function stickPush(dx: number, dy: number): Push {
  const len = Math.hypot(dx, dy) / STICK_REACH;
  if (len < DEAD_ZONE) return NO_PUSH;
  // Past the dead zone the push grows from nothing, so a gentle drag is a slow walk.
  const k = Math.min(1, (len - DEAD_ZONE) / (1 - DEAD_ZONE)) / len / STICK_REACH;
  return { forward: -dy * k, strafe: dx * k };
}

/** The keys that walk: forward, back, left, right (letters by place on the keyboard, and the arrows). */
const KEYS = {
  forward: ['KeyW', 'ArrowUp'],
  back: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
} as const;

/** Whether a key (its `code`) is one that walks. */
export const walksBy = (code: string): boolean => Object.values(KEYS).some((k) => (k as readonly string[]).includes(code));

/** The push of the walking keys held down (their `code`s); two at once walk at the same pace as one. */
export function keyPush(held: ReadonlySet<string>): Push {
  const on = (keys: readonly string[]) => (keys.some((k) => held.has(k)) ? 1 : 0);
  const forward = on(KEYS.forward) - on(KEYS.back), strafe = on(KEYS.right) - on(KEYS.left), len = Math.hypot(forward, strafe);
  return len > 1 ? { forward: forward / len, strafe: strafe / len } : { forward, strafe };
}

/** The thumb and the keys together: whichever pushes harder. */
export function strongerPush(a: Push, b: Push): Push {
  return Math.hypot(a.forward, a.strafe) >= Math.hypot(b.forward, b.strafe) ? a : b;
}
