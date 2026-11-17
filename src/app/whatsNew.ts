/**
 * The version in a corner of the screen, and on a tap every version with what it brought (Arnd 2026-11-17). The
 * numbers and notes come from the build (tools/version/version.ts); the history loads only when it is opened.
 * A version the device has not shown yet marks the button, so a new deploy is seen at a glance on the tablet.
 */
import { LABEL, VERSION } from 'virtual:nauta/version';
import type { Release } from '../../tools/version/version';

/** Where the device remembers the last version it showed the history of. */
const SEEN_KEY = 'nauta.seenVersion';

/** Storage can be refused (a private window, a blocked site): then nothing is remembered and the game goes on. */
function seenVersion(): string | null {
  try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
}
function rememberSeen(): void {
  try { localStorage.setItem(SEEN_KEY, VERSION); } catch { /* not remembered */ }
}

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = '') => {
  const e = document.createElement(tag);
  e.className = className;
  e.textContent = text;
  return e;
};

/** The panel of every version, newest first, over the view until it is closed. */
function openPanel(history: readonly Release[]): void {
  const backdrop = make('div', 'whatsnew-backdrop'), panel = make('section', 'whatsnew-panel');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', "What's new");
  const head = make('header', 'whatsnew-head'), close = make('button', 'whatsnew-close', '✕');
  close.setAttribute('aria-label', 'Close');
  head.append(make('h2', '', "What's new"), close);
  const list = make('div', 'whatsnew-list');
  for (const r of history) {
    const item = make('article', r.version === VERSION ? 'whatsnew-release current' : 'whatsnew-release');
    const title = make('h3', '', r.version);
    title.append(make('span', 'whatsnew-date', r.date));
    const notes = make('ul', '');
    for (const n of r.notes) notes.append(make('li', '', n));
    item.append(title, notes);
    list.append(item);
  }
  if (!history.length) list.append(make('p', '', 'This build does not know its history.'));
  panel.append(head, list);
  backdrop.append(panel);
  const shut = () => { backdrop.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') shut(); };
  close.addEventListener('click', shut);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) shut(); });
  addEventListener('keydown', onKey);
  document.body.append(backdrop);
}

/** Shows the version on `button`; a tap opens the history. */
export function showVersion(button: HTMLButtonElement): void {
  button.textContent = `${LABEL} · What's new`;
  button.classList.toggle('fresh', seenVersion() !== VERSION);
  button.style.display = 'block';
  button.addEventListener('click', () => {
    rememberSeen();
    button.classList.remove('fresh');
    import('virtual:nauta/history').then((m) => openPanel(m.default), (err: unknown) => console.error(err));
  });
}
