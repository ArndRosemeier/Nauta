/**
 * The scenario dialog (docs/design/scenarios.md), by hand, not in CI: `npm run shot:scenario [-- <out dir>]` (run `npm run
 * build` and `npm run packs` first). The main screen and the dialog at the tablet's 1180 × 820 and upright, with the
 * four starts, an eight-ship edit and the line that says what cannot be run yet. Fails if the page throws.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TIMEOUT, frames, openBrowser, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/scenario';
mkdirSync(out, { recursive: true });
const served = await openBrowser();
const context = await served.browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
const page = await context.newPage();
let failed = false;
if (!process.env.SHOT_GPU) await page.addInitScript({ path: fileURLToPath(new URL('./swapchain.js', import.meta.url)) });
page.on('console', (m) => { if (m.type() === 'error' || process.env.SHOT_LOG) console.error(`[page] ${m.text()}`); });
page.on('pageerror', (e) => { failed = true; console.error(`[page error] ${e.message}`); });
const shot = async (name) => { await frames(page); await snap(page, `${out}/${name}.png`); console.log(name); };
const tap = (selector) => page.click(selector, { timeout: TIMEOUT });
const scrollTo = (y) => page.evaluate((to) => document.querySelector('.menu-setup .nt-body')?.scrollTo(0, to), y);

await page.goto(served.base, { timeout: TIMEOUT });
await page.waitForFunction(() => window.__nautaReady === true, null, { timeout: TIMEOUT });
await page.evaluate(() => document.getElementById('loading')?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true })));
await page.waitForSelector('.nt-menu:not([hidden]) .menu-choice', { timeout: TIMEOUT });
await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: TIMEOUT });
await shot('main');
await tap('.menu-choice.first');
await shot('alone');
// Drag her, turn her by her handle (as a finger would), put her back.
const centre = async (sel) => page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
const dragBy = async ([x, y], [dx, dy]) => {
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(x + (dx * i) / 8, y + (dy * i) / 8);
  await page.mouse.up();
};
await dragBy(await centre('.scn-vessel .scn-hull'), [-160, -90]);
await shot('placed-moved');
await dragBy(await centre('.scn-vessel.picked .scn-handle'), [60, -90]);
await shot('placed-turned');
console.log(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('nauta.settings')).match.scenario.ships.map((s) => s.at))));
await tap('.scn-reset');
await tap('.scn-presets button:nth-child(2)');
await shot('room');
await tap('.scn-presets button:nth-child(3)');
await shot('watch');
await tap('.scn-presets button:nth-child(4)');
await shot('fleets-top');
await scrollTo(99999);
await shot('fleets-foot');
// Eight ships, three sides: every ship added is a seasoned computer captain on the smaller side.
await scrollTo(0);
for (let i = 0; i < 2; i++) await tap('.scn-add');
await tap('.scn-ship:nth-child(7) .scn-side button:nth-child(3)');
await scrollTo(99999);
await shot('eight-ships');
await page.setViewportSize({ width: 820, height: 1180 });
await scrollTo(0);
await shot('upright');
await tap('.menu-sheet .nt-close');
await page.waitForSelector('.nt-menu:not([hidden]) .menu-choice', { timeout: TIMEOUT });
await tap('.menu-language button:nth-child(2)');
await tap('.menu-choice.first');
await shot('german');
console.log(`${out}: done${failed ? ', the page failed' : ''}`);
await served.close();
process.exit(failed ? 1 : 0);
