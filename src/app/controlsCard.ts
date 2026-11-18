/**
 * The controls card (Arnd 2026-11-18: "its not really clear how to play this"): one sheet (sheet.ts) with how to look,
 * walk and give orders, from controls.ts, with the player's own keys on their caps. It opens once on a device at the
 * start of the first match (menu.ts), and any time from the captain's pause and from Settings, Controls. It shows the
 * mouse and keys on a desk and the fingers on a tablet first; a tab shows the other.
 */
import { DESK_CONTROLS, TOUCH_CONTROLS, type ControlHow, type ControlSection } from './controls';
import { keyCap, make } from './dom';
import { makeButton } from './button';
import { openSheet } from './sheet';
import type { Settings } from './settings';
import type { SettingsStore } from './settingsStore';
import { words, type WordKey } from './words';

/** Where the device remembers that the card was shown once. */
const SEEN_KEY = 'nauta.controlsSeen';

/** Whether this device points with a mouse (or a trackpad): the desk's list first, and the key caps shown. */
export const onDesk = (): boolean => matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Whether the card has opened on this device before. */
export function controlsSeen(): boolean {
  try { return localStorage.getItem(SEEN_KEY) !== null; } catch { return true; }
}

/** Opens the card once on a device (the first match's start); true if it opened. `onShut` is called once it is shut. */
export function showControlsOnce(store: SettingsStore, onShut: () => void = () => {}): boolean {
  if (controlsSeen()) return false;
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* shown again next time */ }
  openControls(store, onShut);
  return true;
}

/** Opens the card over the view; `onShut` is called once it is shut, however. */
export function openControls(store: SettingsStore, onShut: () => void = () => {}): void {
  const say = words(store.now.language);
  const sheet = openSheet('controls-card', say.pageControls, say.close, onShut);
  let desk = onDesk();
  const draw = () => {
    const tabs = make('nav', 'controls-tabs');
    for (const [on, word] of [[true, 'controlsDesk'], [false, 'touch']] as const) {
      const tab = makeButton(say[word], () => { desk = on; draw(); });
      tab.className = on === desk ? 'nt-tab on' : 'nt-tab';
      tabs.append(tab);
    }
    const go = makeButton(say.controlsGo, () => sheet.shut());
    go.className = 'nt-button menu-go';
    const foot = make('footer', 'menu-sheet-foot');
    foot.append(make('p', 'nt-note', desk ? say.ctlKeysChange : ''), go);
    sheet.body.replaceChildren(tabs, ...(desk ? DESK_CONTROLS : TOUCH_CONTROLS).map((s) => section(s, store.now, say)), foot);
  };
  draw();
}

function section(s: ControlSection, settings: Settings, say: Readonly<Record<WordKey, string>>): HTMLElement {
  const box = make('div', 'controls-section');
  box.append(make('div', 'nt-section', say[s.title]));
  const grid = make('dl', 'controls-grid');
  for (const row of s.rows) {
    const how = make('dt', 'controls-how');
    how.append(...row.how.flatMap((h, i) => (i > 0 ? [make('span', 'controls-or', '·'), ...shown(h, settings, say)] : shown(h, settings, say))));
    grid.append(how, make('dd', 'controls-does', say[row.does]));
  }
  box.append(grid);
  return box;
}

/** What to press, as shown: the player's keys on caps, or the gesture in brass italic. */
function shown(h: ControlHow, settings: Settings, say: Readonly<Record<WordKey, string>>): HTMLElement[] {
  return 'keys' in h ? h.keys.map((k) => keyCap(settings.keys[k])) : [make('span', 'controls-gesture', say[h.gesture])];
}
