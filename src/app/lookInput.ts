/**
 * Dragging on the view turns the look: one finger on a tablet, the held mouse button on a desk. Pointer events
 * cover both, so there is one path (docs/design/nauta-plan.md, Tablets: touch is designed first).
 */
import { turn, type Look } from './look';

export interface LookInput {
  /** The look as dragged so far; set it to turn the look from elsewhere (a new standpoint). */
  look: Look;
}

/** `radPerPixel`: the view's vertical angle over its height now (it changes when the window does). */
export function watchLook(el: HTMLElement, start: Look, radPerPixel: () => number): LookInput {
  const state = { look: start };
  /** The pointer that is dragging (the first one down), and where it was last. */
  let id: number | null = null, x = 0, y = 0;
  el.addEventListener('pointerdown', (e) => {
    if (id !== null) return;
    id = e.pointerId; x = e.clientX; y = e.clientY;
    // Keeps the drag when the finger leaves the view. A pointer already gone (lifted in the same instant) cannot be held.
    try { el.setPointerCapture(e.pointerId); } catch { /* the drag still works inside the view */ }
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    state.look = turn(state.look, e.clientX - x, e.clientY - y, radPerPixel());
    x = e.clientX; y = e.clientY;
  });
  const end = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // A long press or a right click must not open the browser's menu over the game.
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  return state;
}
