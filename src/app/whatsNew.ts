/**
 * The version and every version with what it brought (Arnd 2026-11-17). The numbers and notes come from the build
 * (tools/version/version.ts); the history loads only when it is opened. The version stands at the foot of the
 * settings (design thread, 2026-11-18: out of the view's corner), and a version the device has not shown yet marks
 * the settings button, so a new deploy is still seen at a glance on the tablet.
 */
import { LABEL, VERSION } from 'virtual:nauta/version';
import type { Release } from '../../tools/version/version';
import { make } from './dom';
import { openSheet } from './sheet';
import type { WordKey } from './words';

/** Where the device remembers the last version it showed the history of. */
const SEEN_KEY = 'nauta.seenVersion';

/** The version as the screen shows it (`0.071`, `0.024 dev`). */
export const versionLabel = LABEL;

/** Whether this version's history has not been shown on this device yet. Storage refused: never marked. */
export function unseenVersion(): boolean {
  try { return localStorage.getItem(SEEN_KEY) !== VERSION; } catch { return false; }
}
function rememberSeen(): void {
  try { localStorage.setItem(SEEN_KEY, VERSION); } catch { /* not remembered */ }
}

/** The history of every version, newest first, on a sheet over the view; `seen` is called once it is marked seen. */
export function openWhatsNew(say: Readonly<Record<WordKey, string>>, seen: () => void = () => {}): void {
  rememberSeen();
  seen();
  import('virtual:nauta/history').then((m) => showHistory(m.default, say), (err: unknown) => console.error(err));
}

function showHistory(history: readonly Release[], say: Readonly<Record<WordKey, string>>): void {
  const sheet = openSheet('whatsnew', say.whatsNew, say.close);
  for (const r of history) {
    const item = make('article', r.version === VERSION ? 'whatsnew-release current' : 'whatsnew-release');
    const title = make('h3', '', r.version);
    title.append(make('span', 'whatsnew-date', r.date));
    const notes = make('ul', '');
    for (const n of r.notes) notes.append(make('li', '', n));
    item.append(title, notes);
    sheet.body.append(item);
  }
  if (!history.length) sheet.body.append(make('p', '', say.noHistory));
}
