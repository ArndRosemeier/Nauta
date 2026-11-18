/**
 * The calm view (implementation plan N2.7): one setting for how much of the captain's body's motion the view takes,
 * from all of it down to nearly still, for those who get queasy. A button a finger can hit steps through
 * `MOTION_STEPS`; the device remembers the choice. `?motion=` sets it for one visit.
 */
import { MOTION_START, MOTION_STEPS } from '../sim/rules/body';

/** Where the device remembers the choice. */
const KEY = 'nauta.motion';
/** The button's word for each of `MOTION_STEPS`, in order. */
const WORDS = ['full', 'half', 'calm'] as const;

/** Storage can be refused (a private window, a blocked site): then nothing is remembered and the game goes on. */
function remembered(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY));
    return MOTION_STEPS.some((s) => s === v) ? v : null;
  } catch { return null; }
}
function remember(v: number): void {
  try { localStorage.setItem(KEY, String(v)); } catch { /* not remembered */ }
}

/** Shows the button on `button` and calls `set` with the strength now and on every change; `asked`: the address's own (`?motion=`), kept for the visit. */
export function showMotionSetting(button: HTMLButtonElement, asked: number | null, set: (strength: number) => void): void {
  let now = asked ?? remembered() ?? MOTION_START;
  const show = () => { button.textContent = `Motion: ${WORDS[MOTION_STEPS.findIndex((s) => s === now)] ?? now.toFixed(2)}`; set(now); };
  button.style.display = 'block';
  button.addEventListener('click', () => {
    const at = MOTION_STEPS.findIndex((s) => s === now);
    now = MOTION_STEPS[(at + 1) % MOTION_STEPS.length]!;
    remember(now);
    show();
  });
  show();
}
