/** Small helpers for the page's own panels (the what's-new panel, the order panel): elements made in one line. */
import { keyName } from './settings';

/** A new element of `tag` with its class and text. */
export const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
};

/**
 * A key's small cap beside what it does (a fan's tag, Fire!, the glass): shown only on a desk, where a mouse points
 * (nauta.css `.nt-cap`), so a finger never sees it.
 */
export const keyCap = (code: string): HTMLElement => make('kbd', 'nt-cap', keyName(code));

/** Calls `act` when the key whose code `code()` gives is pressed: once a press (not while held), and not while typing in a field. */
export function onKeyPress(code: () => string, act: () => void): void {
  window.addEventListener('keydown', (e) => {
    if (e.code !== code() || e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    act();
  });
}
