/**
 * The spyglass's controls (plan N3.8), touch first: its button raises and lowers it; two fingers spread on the view
 * raise it, and while it is up spread or pinch to draw it out or in, pinched right in it is lowered. On a desk the
 * `G` key raises and lowers it and the mouse wheel draws it out and in. Pointers that are not for the view (the
 * walking thumb's, walkInput.ts) are left alone.
 */
import type { Spyglass } from './glass';

/** How much one notch of the mouse wheel (100 of its units) draws the glass out or in. */
const WHEEL_STEP = 1.1;
const WHEEL_NOTCH = 100;

export interface GlassInput {
  /** True while two fingers pinch on the view (the look's drag waits meanwhile). */
  readonly pinching: boolean;
}

/** The glass worked from the view `el` and its `button`; `notForView`: pointers that are not for the view. */
export function watchGlass(el: HTMLElement, button: HTMLButtonElement, glass: Spyglass, notForView: (e: PointerEvent) => boolean = () => false): GlassInput {
  const fingers = new Map<number, { x: number; y: number }>();
  let start = 0;
  const state = { pinching: false };
  const spread = () => {
    const [a, b] = [...fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const mark = () => button.classList.toggle('on', glass.up);
  button.style.display = 'block';
  button.textContent = 'Glass';
  button.addEventListener('click', () => { glass.toggle(); mark(); });
  el.addEventListener('pointerdown', (e) => {
    if (notForView(e)) return;
    fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (fingers.size === 2) { start = spread(); state.pinching = start > 0; glass.pinchStart(); }
  });
  el.addEventListener('pointermove', (e) => {
    const f = fingers.get(e.pointerId);
    if (!f) return;
    f.x = e.clientX; f.y = e.clientY;
    if (state.pinching) { glass.pinch(spread() / start); mark(); }
  });
  const lift = (e: PointerEvent) => {
    if (!fingers.delete(e.pointerId) || !state.pinching) return;
    state.pinching = false;
    glass.pinchEnd();
  };
  el.addEventListener('pointerup', lift);
  el.addEventListener('pointercancel', lift);
  el.addEventListener('wheel', (e) => { e.preventDefault(); glass.draw(WHEEL_STEP ** (-e.deltaY / WHEEL_NOTCH)); }, { passive: false });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'g' && e.key !== 'G') return;
    // Typing an order is not looking through the glass.
    if (e.target instanceof HTMLInputElement) return;
    glass.toggle();
    mark();
  });
  return state;
}
