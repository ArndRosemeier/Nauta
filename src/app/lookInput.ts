/**
 * Dragging on the view turns the look: one finger on a tablet, the held mouse button on a desk. Pointer events
 * cover both, so there is one path (docs/design/nauta-plan.md, Tablets: touch is designed first). The finger drags the
 * picture, the mouse turns the head (look.ts#turn). With the mouse taken (mouse.ts, pointer lock) it looks without a
 * button held.
 */
import { NATURAL, turn, type Dragger, type Look, type LookFeel } from './look';

/**
 * A movement of the taken mouse longer than this is dropped, px: some systems report a jump of hundreds of pixels when
 * the lock begins or the window regains focus, which would spin the look round.
 */
const LOCK_JUMP = 300;

export interface LookInput {
  /** The look as dragged so far; set it to turn the look from elsewhere (a new standpoint). */
  look: Look;
}

/**
 * `radPerPixel`: the view's vertical angle over its height now (it changes when the window does, and through the
 * glass). `leave`: pointers that are not for looking (the walking thumb's, walkInput.ts). `waits`: true while the drag
 * does not turn the look (two fingers pinching the glass, glassInput.ts). `feel`: the player's look speed and mouse
 * inversion for a finger or the mouse now (the settings, plan N7.3). `taken`: whether the mouse is taken for looking
 * (mouse.ts): then every movement of it looks.
 */
export function watchLook(el: HTMLElement, start: Look, radPerPixel: () => number, leave: (e: PointerEvent) => boolean = () => false, waits: () => boolean = () => false, feel: (by: Dragger) => LookFeel = () => NATURAL, taken: () => boolean = () => false): LookInput {
  const state = { look: start };
  /** The pointer that is dragging (the first one down), and where it was last. */
  let id: number | null = null, x = 0, y = 0;
  el.addEventListener('pointerdown', (e) => {
    if (id !== null || leave(e)) return;
    id = e.pointerId; x = e.clientX; y = e.clientY;
    // Keeps the drag when the finger leaves the view. A pointer already gone (lifted in the same instant) cannot be held.
    try { el.setPointerCapture(e.pointerId); } catch { /* the drag still works inside the view */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && taken()) {
      if (!waits() && Math.abs(e.movementX) < LOCK_JUMP && Math.abs(e.movementY) < LOCK_JUMP) state.look = turn(state.look, e.movementX, e.movementY, radPerPixel(), 'mouse', feel('mouse'));
      return;
    }
    if (e.pointerId !== id) return;
    const by: Dragger = e.pointerType === 'mouse' ? 'mouse' : 'finger';
    if (!waits()) state.look = turn(state.look, e.clientX - x, e.clientY - y, radPerPixel(), by, feel(by));
    x = e.clientX; y = e.clientY;
  });
  const end = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return state;
}
