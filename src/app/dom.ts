/** Small helpers for the page's own panels (the what's-new panel, the order panel): elements made in one line. */

/** A new element of `tag` with its class and text. */
export const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
};

/** Calls `act` when the key whose code `code()` gives is pressed: once a press (not while held), and not while typing in a field. */
export function onKeyPress(code: () => string, act: () => void): void {
  window.addEventListener('keydown', (e) => {
    if (e.code !== code() || e.repeat || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    act();
  });
}
