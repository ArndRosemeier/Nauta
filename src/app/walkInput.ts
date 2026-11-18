/**
 * Two thumbs on a tablet (implementation plan N2.3; touch first, keys and mouse on top): a finger landing on the left
 * of the view is the walking stick, drawn as a ring under it with a knob that follows; the walking keys do the same on
 * a desk. Looking stays with lookInput.ts, which leaves the stick's finger alone.
 */
import { NO_PUSH, STICK_REACH, keyPush, stickPush, strongerPush, walksBy, type Push } from './thumbs';

export interface WalkInput {
  /** What the thumb and the keys ask now. */
  push(): Push;
  /** Whether a pointer event belongs to the stick (looking leaves it alone). */
  owns(e: PointerEvent): boolean;
}

/** The left share of the view a walking thumb lands on. */
const STICK_SHARE = 1 / 2;

export function watchWalk(el: HTMLElement): WalkInput {
  const ring = document.createElement('div'), knob = document.createElement('div');
  ring.id = 'stick';
  knob.className = 'knob';
  ring.append(knob);
  document.body.append(ring);
  let id: number | null = null, x0 = 0, y0 = 0, thumb: Push = NO_PUSH;
  const held = new Set<string>();
  const show = (dx: number, dy: number) => {
    const len = Math.hypot(dx, dy), k = len > STICK_REACH ? STICK_REACH / len : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  // A finger (or pen) on the left of the view; the mouse always looks, the keys walk on a desk.
  const isStick = (e: PointerEvent) => e.pointerType !== 'mouse' && e.clientX < el.clientWidth * STICK_SHARE;
  el.addEventListener('pointerdown', (e) => {
    if (id !== null || !isStick(e)) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; thumb = NO_PUSH;
    try { el.setPointerCapture(e.pointerId); } catch { /* the stick still works inside the view */ }
    ring.style.left = `${x0}px`; ring.style.top = `${y0}px`;
    ring.classList.add('on');
    show(0, 0);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    thumb = stickPush(e.clientX - x0, e.clientY - y0);
    show(e.clientX - x0, e.clientY - y0);
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null; thumb = NO_PUSH;
    ring.classList.remove('on');
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  window.addEventListener('keydown', (e: KeyboardEvent) => { if (walksBy(e.code)) { held.add(e.code); e.preventDefault(); } });
  window.addEventListener('keyup', (e: KeyboardEvent) => held.delete(e.code));
  // A key held while the page loses the keyboard would walk on forever.
  window.addEventListener('blur', () => held.clear());
  return {
    push: () => strongerPush(thumb, keyPush(held)),
    owns: (e) => e.pointerId === id || (id === null && isStick(e)),
  };
}
