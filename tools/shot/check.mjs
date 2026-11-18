/**
 * The browser checks of CI: `npm run check:shots [-- <out dir> [start|sea]]` (run `npm run build` first). Two checks,
 * each on one page load (docs/CHECKS.md, "Keeping the browser checks inside their budget"): on the software GPU a load
 * costs about a minute before its first picture (most of it the GPU building shader code at the first frame), and
 * each picture after it 5 to 10 s, so the two together on one page left no room under the 2 minute warning.
 *
 * - `start`: the game as it starts (`?hud&day=0`), `desktop.png` at 1280 × 800 with the HUD; then the view changed to
 *   a tablet in landscape (1180 × 820), a finger dragged across it, and `tablet.png`.
 * - `sea`: 6 of the standard sea shots from her quarterdeck, each time of day and each sea once (CI_SHOTS; all 24 by
 *   hand with `npm run shot:sea`), at their 800 × 500 and quality `high`, into `sea/`, and `sea/sheet.png`.
 *
 * With neither named, both run, one after the other. Each fails if its page throws or never gets ready (then at once,
 * after a picture of what is there). The browser's switches are browser.mjs's (CHROMIUM_PATH, SHOT_GPU,
 * SHOT_TIMEOUT); the sizes are fixed.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TIMEOUT, drag, openBrowser, openGame, snap } from './browser.mjs';
import { SEAS, SEA_SHOT_SIZE, seaShots, takeSeaShots, writeSheet } from './sea.mjs';

/** The views, fixed (SHOT_SIZE does not apply): a desktop window, a tablet in landscape with the finger's drag, the sea shots'. */
const DESKTOP = { width: 1280, height: 800 }, TABLET = { width: 1180, height: 820 }, TABLET_DRAG = [-300, 120];
const [seaWidth, seaHeight] = SEA_SHOT_SIZE.split('x').map(Number), SEA_VIEW = { width: seaWidth, height: seaHeight };
/**
 * The sea shots CI takes, from her quarterdeck where the game is played: every time of day and every sea once. A
 * scene costs 5 to 10 s on CI's software GPU (most of it the fine sea's compute, not the pixels).
 */
const CI_SHOTS = ['dawn-breeze-eye4.5', 'noon-calm-eye4.5', 'noon-breeze-eye4.5', 'noon-gale-eye4.5', 'dusk-gale-eye4.5', 'night-breeze-eye4.5'];
/** The sea page opens on the first shot's hour and sea, so its first scene draws no new sky. */
const SEA_PAGE = '?day=0&quality=high&hour=6.3&sea=breeze';

const t0 = performance.now(), seconds = () => `${((performance.now() - t0) / 1000).toFixed(0)} s`;
const hud = async (page) => (await page.textContent('#hud', { timeout: TIMEOUT })) ?? '';

/** The start: the desktop picture as the page first draws, then the tablet's view with the drag. Returns whether it failed. */
async function start(served, outDir) {
  const game = await openGame(served, '?hud&day=0', DESKTOP);
  const { page } = game;
  console.log(`start: ready after ${seconds()}`);
  const desktop = join(outDir, 'desktop.png');
  await snap(page, desktop);
  console.log(`${desktop}: ${await hud(page)}  (${seconds()})`);
  if (game.failed()) return true;
  // The finger's drag at the tablet's size, then the scene stood still and drawn once with the look the drag moved
  // (one frame: a frame costs seconds here). No frame is waited for after the resize: the view takes its new size at
  // the browser's next update, long before the frame in flight is done and the scene is drawn.
  await page.setViewportSize(TABLET);
  await drag(page, TABLET, TABLET_DRAG);
  await page.evaluate((q) => window.__nautaScene(q), 'day=0');
  const tablet = join(outDir, 'tablet.png');
  await snap(page, tablet);
  console.log(`${tablet}: ${await hud(page)}  (${seconds()})`);
  await game.context.close();
  return game.failed();
}

/** The sea shots CI takes, on a page of their own, and their sheet. Returns whether it failed. */
async function sea(served, outDir) {
  const game = await openGame(served, SEA_PAGE, SEA_VIEW);
  console.log(`sea: ready after ${seconds()}`);
  const seaDir = join(outDir, 'sea');
  const files = await takeSeaShots(game.page, seaShots().filter((s) => CI_SHOTS.includes(s.name)), seaDir);
  await game.context.close();
  await writeSheet(served, files, join(seaDir, 'sheet.png'), SEA_VIEW, SEAS.length);
  console.log(`${files.length} sea shots and the sheet  (${seconds()})`);
  return game.failed();
}

const PARTS = { start, sea };
const [outDir = 'shots', ...named] = process.argv.slice(2);
const parts = named.length ? named : Object.keys(PARTS);
if (!parts.every((p) => p in PARTS)) { console.error(`parts: ${Object.keys(PARTS).join(', ')}`); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const served = await openBrowser();
let failed = false;
for (const part of parts) if (await PARTS[part](served, outDir)) { failed = true; break; }
await served.close();
console.log(`${parts.join(' and ')} in ${seconds()}`);
process.exit(failed ? 1 : 0);
