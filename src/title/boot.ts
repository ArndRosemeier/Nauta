/**
 * The title's start (plan N7.7), the first thing the page's script runs (main.ts imports it before anything else): the
 * title and its sound are up and the picture drawing in its worker before three.js and the game are evaluated. The
 * game then builds behind it and hands over to the deck when its first frame is drawn. Until the script has come, the
 * page shows the name on the title's sky (index.html). `?title` shows the title alone, for a look and for its pictures;
 * `?notitle` leaves it out (to measure what it costs the game's start); `?probe` and `?netcheck` (no picture of the
 * game) go without it.
 *
 * (The game is not loaded from here with a dynamic `import()`: that put the title up sooner, but the headless checks'
 * pages then took about 6 s longer to get ready, measured 2026-11-18, for reasons not found.)
 */
import { pageEngine } from '../audio/pageEngine';
import { showTitle } from './title';
import { rose } from '../app/sheet';

declare global {
  interface Window {
    /** When the title's first picture was on the screen, ms after the page's start (the headless checks read it). */
    __nautaTitle?: number;
  }
}

const query = new URLSearchParams(location.search);
const alone = query.has('title');
if (!query.has('probe') && !query.has('netcheck') && !query.has('notitle')) {
  // The interface's mark over the name on the title's plate.
  document.querySelector('.title-plate')?.prepend(rose());
  showTitle(pageEngine(), (at) => {
    window.__nautaTitle = at;
    if (alone) window.__nautaReady = true;
  });
}
