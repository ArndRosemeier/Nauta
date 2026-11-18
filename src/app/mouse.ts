/**
 * The mouse on a desk (Arnd 2026-11-18: "Right clicking still brings up the browser right click menu sometimes ...
 * its not really clear how to play this"; orders.md: "With a mouse the fan opens on a click; the middle of the view
 * picks the man when the pointer is locked"). The mouse has two ways, and a finger never meets either:
 *
 * - **free**, the cursor shown (the start, and after Escape): a drag looks, a click on a man opens his fan round the
 *   cursor (orderFan.ts), and a plain click on the sea or the deck takes the mouse;
 * - **taken** (the browser's pointer lock), a brass dot in the middle of the view: moving the mouse looks
 *   (lookInput.ts), a click gives orders to the man under the dot. Escape frees it, and so does any sheet that opens
 *   (sheet.ts) or the menu.
 *
 * The browser's own menus never open over the game: not the right click's anywhere on the page (fields to type in and
 * text that can be selected keep theirs), not the wheel button's scrolling, and the mouse's side buttons do not go back
 * a page out of the match.
 */
import { make } from './dom';
import { isTap, pressOf, type Press } from './press';

/** The mouse's buttons, as pointer and mouse events number them. */
export const LEFT_BUTTON = 0;
const MIDDLE = 1;
export const RIGHT_BUTTON = 2;
const BACK_BUTTON = 3;
const FORWARD_BUTTON = 4;
/** A click: lifted within this long and this near where it went down, ms and px (a longer drag looks instead). */
const CLICK_MS = 400;
const CLICK_SLOP = 6;
/** The Escape that frees the mouse does nothing more (it does not also open the pause) for this long after, ms. */
const FREED_GRACE_MS = 400;

/** The body's class while the mouse is taken: the dot shows, the fan opens in the middle, lessons say "the dot". */
export const TAKEN_CLASS = 'mouse-taken';

/** Whether the mouse is taken for looking now (the pointer locked to the view). */
export const mouseTaken = (): boolean => document.body.classList.contains(TAKEN_CLASS);

/** Whether the browser's menu may open over this element: a field to type in, or text that can be selected (a room's code). */
function keepsItsMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest('input, textarea')) return true;
  return getComputedStyle(target).userSelect === 'text';
}

/** Keeps the browser's menus and its navigation off the game, everywhere on the page (once, before the title shows). */
export function keepBrowserMenusAway(): void {
  document.addEventListener('contextmenu', (e) => { if (!keepsItsMenu(e.target)) e.preventDefault(); });
  // The wheel's button starts the browser's scrolling on Windows.
  document.addEventListener('mousedown', (e) => { if (e.button === MIDDLE) e.preventDefault(); });
  // The side buttons go back or forward a page: out of the match, its state lost.
  document.addEventListener('mouseup', (e) => { if (e.button === BACK_BUTTON || e.button === FORWARD_BUTTON) e.preventDefault(); });
}

/** Pointer lock as the browsers offer it: the raw movement where they can, plain where they cannot. */
type LockOptions = { unadjustedMovement?: boolean };
type Lockable = HTMLElement & { requestPointerLock(options?: LockOptions): Promise<void> | void };

/** The mouse taken for looking or free: the page asks it, the look and the fan follow it. */
export class MouseTaker {
  private readonly dot = make('div', 'nt-aim');
  private readonly changed = new Set<(taken: boolean) => void>();
  private press: Press | null = null;
  private freedAt = -Infinity;

  /** `view`: the element the mouse is locked to; `may`: whether a click may take it now (in play, no sheet open). */
  constructor(private readonly view: HTMLElement, private readonly may: () => boolean) {
    document.body.append(this.dot);
    // A plain left click on the view that nothing else took (the fan takes a click on a man) takes the mouse.
    view.addEventListener('pointerdown', (e) => {
      this.press = e.pointerType === 'mouse' && e.button === LEFT_BUTTON && !this.taken && this.may() ? pressOf(e) : null;
    });
    view.addEventListener('pointerup', (e) => {
      const p = this.press;
      this.press = null;
      if (p && isTap(p, e, CLICK_MS, CLICK_SLOP) && this.may()) this.take();
    });
    document.addEventListener('pointerlockchange', () => {
      const taken = this.taken;
      document.body.classList.toggle(TAKEN_CLASS, taken);
      if (!taken) this.freedAt = performance.now();
      for (const fn of this.changed) fn(taken);
    });
    document.addEventListener('pointerlockerror', () => document.body.classList.remove(TAKEN_CLASS));
  }

  /** Whether the mouse is taken now. */
  get taken(): boolean {
    return document.pointerLockElement === this.view;
  }

  /** Whether an Escape now is the one that freed the mouse (it should do nothing more). */
  get justFreed(): boolean {
    return this.taken || performance.now() - this.freedAt < FREED_GRACE_MS;
  }

  /** Called when the mouse is taken or freed. */
  whenTakenOrFreed(fn: (taken: boolean) => void): void {
    this.changed.add(fn);
  }

  /** Takes the mouse for looking: the raw movement where the system offers it, else the plain one; refused, it stays free. */
  take(): void {
    const view = this.view as Lockable;
    try {
      const asked = view.requestPointerLock({ unadjustedMovement: true });
      if (asked instanceof Promise) asked.catch(() => { try { void (view.requestPointerLock() as Promise<void> | undefined)?.catch(() => {}); } catch { /* stays free */ } });
    } catch { /* this browser has no pointer lock: the mouse stays free */ }
  }

  /** Frees the mouse (a sheet opens, the menu shows). */
  free(): void {
    if (this.taken) document.exitPointerLock();
  }
}
