/**
 * The browser check of CI: `npm run check:shots [-- <out dir>]` (run `npm run build` first). One page load serves
 * every picture (docs/CHECKS.md, "Keeping the browser checks inside their budget"), as on the software GPU nearly all
 * of the time is the load and its warm-up:
 *
 * - `desktop.png`: the game as it starts, 1280 × 800, with the HUD;
 * - `sea/`: 6 of the standard sea shots from her quarterdeck, each time of day and each sea once (CI_SHOTS; all 24
 *   by hand with `npm run shot:sea`) at their 800 × 500, and `sea/sheet.png`;
 * - `tablet.png`: the view changed to a tablet in landscape (1180 × 820) and a finger dragged across it.
 *
 * The page is opened at `quality=high`, the sea shots' quality (the software GPU's slow frames would step it down).
 * Fails if the page throws, reports an error that is thrown, or never gets ready (then at once, after the desktop
 * picture of what is there). The browser's switches are browser.mjs's (CHROMIUM_PATH, SHOT_GPU, SHOT_TIMEOUT); the sizes are fixed.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TIMEOUT, drag, frames, openBrowser, openGame, snap } from './browser.mjs';
import { SEAS, SEA_SHOT_SIZE, seaShots, takeSeaShots, writeSheet } from './sea.mjs';

/** The views, fixed (SHOT_SIZE does not apply): a desktop window, a tablet in landscape with the finger's drag, the sea shots'. */
const DESKTOP = { width: 1280, height: 800 }, TABLET = { width: 1180, height: 820 }, TABLET_DRAG = [-300, 120];
const [seaWidth, seaHeight] = SEA_SHOT_SIZE.split('x').map(Number), SEA_VIEW = { width: seaWidth, height: seaHeight };
/**
 * The sea shots CI takes, from her quarterdeck where the game is played: every time of day and every sea once. A
 * scene costs about 6 s on CI's software GPU (most of it the fine sea's compute, not the pixels), so the 12 from the
 * quarterdeck and the page's load (about 100 s) do not fit in 3 minutes.
 */
const CI_SHOTS = ['dawn-breeze-eye4.5', 'noon-calm-eye4.5', 'noon-breeze-eye4.5', 'noon-gale-eye4.5', 'dusk-gale-eye4.5', 'night-breeze-eye4.5'];

const [outDir = 'shots'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const t0 = performance.now(), seconds = () => `${((performance.now() - t0) / 1000).toFixed(0)} s`;
const served = await openBrowser();
const game = await openGame(served, '?hud&day=0&quality=high', DESKTOP);
const { page } = game;
console.log(`ready after ${seconds()}`);
const hud = async () => (await page.textContent('#hud', { timeout: TIMEOUT })) ?? '';

const desktop = join(outDir, 'desktop.png');
await snap(page, desktop);
console.log(`${desktop}: ${await hud()}  (${seconds()})`);
if (game.failed()) { await served.close(); process.exit(1); }

// The sea shots next, while the page is quiet: the drag below is a press, and sound starts with it, its decoding
// taking the CPU the software GPU draws with.
// No frame is waited for: the view takes its new size at the browser's next update, long before the frame in flight
// (seconds on the software GPU) is done and the first scene is drawn.
await page.setViewportSize(SEA_VIEW);
const seaDir = join(outDir, 'sea');
const files = await takeSeaShots(page, seaShots().filter((s) => CI_SHOTS.includes(s.name)), seaDir);
console.log(`${files.length} sea shots  (${seconds()})`);

// The tablet last: the finger's drag from the last sea shot's look, and the start's hour drawn once with the look the
// drag moved (one frame: a frame costs seconds here); the HUD shown again.
await page.setViewportSize(TABLET);
await frames(page, 1);
await page.evaluate(() => document.getElementById('sea-shots')?.remove());
await drag(page, TABLET, TABLET_DRAG);
await page.evaluate((q) => window.__nautaScene(q), 'day=0');
const tablet = join(outDir, 'tablet.png');
await snap(page, tablet);
console.log(`${tablet}: ${await hud()}  (${seconds()})`);

await game.context.close();
await writeSheet(served, files, join(seaDir, 'sheet.png'), SEA_VIEW, SEAS.length);
await served.close();
console.log(`start shots, ${files.length} sea shots and the sheet on one page in ${seconds()}`);
process.exit(game.failed() ? 1 : 0);
