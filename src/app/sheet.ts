/**
 * The sheet: every panel that is not the world (docs/design/ui-style.md) opens in this one frame over the view,
 * lacquer in a brass rule with brass corners, a compass rose and the title, a close button a finger can hit, and its body.
 * A tap beside it or the Escape key closes it too. The settings, what's new and the rooms open here; the title and the
 * menus (N7.2) will.
 */
import { make } from './dom';

/**
 * The compass rose, the interface's mark (on the sheet's head and the settings button): eight points,
 * each one half filled and one half drawn, inside a double ring. In `currentColor`, so it takes the brass it stands in.
 */
const ROSE = '<svg class="nt-rose" viewBox="0 0 100 100" aria-hidden="true">'
  + '<circle cx="50" cy="50" r="24" fill="none" stroke="currentColor" stroke-width="1"/>'
  + '<circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" stroke-width="0.6"/>'
  + '<path fill="currentColor" d="M50 50L71.2 28.8L45.1 45.1ZM50 50L71.2 71.2L54.9 45.1ZM50 50L28.8 71.2L54.9 54.9ZM50 50L28.8 28.8L45.1 54.9ZM50 50L50 2L41 50ZM50 50L98 50L50 41ZM50 50L50 98L59 50ZM50 50L2 50L50 59Z"/>'
  + '<path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M50 50L71.2 28.8L54.9 54.9ZM50 50L71.2 71.2L45.1 54.9ZM50 50L28.8 71.2L45.1 45.1ZM50 50L28.8 28.8L54.9 45.1ZM50 50L50 2L59 50ZM50 50L98 50L50 59ZM50 50L50 98L41 50ZM50 50L2 50L50 41Z"/>'
  + '<circle cx="50" cy="50" r="3" fill="currentColor"/></svg>';

/** The compass rose as an element. */
export function rose(): Element {
  const holder = document.createElement('span');
  holder.innerHTML = ROSE;
  return holder.firstElementChild!;
}

export interface Sheet {
  /** The sheet's own element (its class says which sheet it is). */
  readonly panel: HTMLElement;
  /** Where its content goes. */
  readonly body: HTMLElement;
  /** Its title, to be written again (a change of language). */
  readonly title: HTMLElement;
  /** The close button, to be named again. */
  readonly close: HTMLButtonElement;
  /** Closes it. */
  shut(): void;
}

/** Opens a sheet titled `title` (with `kind` as its class) over the view; `closed` is called once it is shut, however. */
export function openSheet(kind: string, title: string, closeLabel: string, closed: () => void = () => {}): Sheet {
  const backdrop = make('div', 'nt-backdrop'), panel = make('section', `nt-sheet ${kind}`);
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', title);
  const head = make('header', 'nt-head'), h = make('h2', '', title), close = make('button', 'nt-close', '✕');
  close.type = 'button';
  close.setAttribute('aria-label', closeLabel);
  head.append(rose(), h, close);
  const body = make('div', 'nt-body');
  panel.append(head, body);
  backdrop.append(panel);
  // Escape closes the sheet on top only (what's new over the settings closes first).
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && [...document.querySelectorAll('.nt-backdrop')].at(-1) === backdrop) { e.stopImmediatePropagation(); shut(); } };
  const shut = () => {
    if (!backdrop.isConnected) return;
    backdrop.remove();
    removeEventListener('keydown', onKey);
    closed();
  };
  close.addEventListener('click', shut);
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) shut(); });
  addEventListener('keydown', onKey);
  document.body.append(backdrop);
  return { panel, body, title: h, close, shut };
}
