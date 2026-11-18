/**
 * The menu (docs/design/menu.md, plan N7.2), by hand, not in CI: `npm run shot:menu [-- <out dir>]` (run `npm run
 * build` first). The plain address at the tablet's 1180 × 820: the title asking for the tap once the game is ready,
 * the main screen over her quarterdeck, the match setup, the deck after "Beat to quarters", the captain's pause, the
 * end card after she strikes, joining and the waiting room (without a GameHub key they show the server's refusal),
 * the main screen in German, upright, and the first match's welcome and first lesson (N7.4). Fails if the page throws. A few minutes in the cloud (each frame costs
 * seconds on the software GPU).
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TIMEOUT, frames, openBrowser, snap } from './browser.mjs';

/** The quiet moment on deck before the end card, ms (src/app/menu.ts END_QUIET_MS), and a little more. */
const END_WAIT_MS = 9500;
/** Into the first match: the welcome's bubble up, ms; then on to the first lesson (src/app/lessons.ts WELCOME_SECONDS). */
const FIRST_WELCOME_MS = 3000;
const FIRST_LOOK_MS = 11000;

const out = process.argv[2] ?? 'shots/menu';
mkdirSync(out, { recursive: true });
const served = await openBrowser();
const context = await served.browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
const page = await context.newPage();
let failed = false;
if (!process.env.SHOT_GPU) await page.addInitScript({ path: fileURLToPath(new URL('./swapchain.js', import.meta.url)) });
page.on('console', (m) => { if (m.type() === 'error' || process.env.SHOT_LOG) console.error(`[page] ${m.text()}`); });
page.on('pageerror', (e) => { failed = true; console.error(`[page error] ${e.message}`); });
const t0 = performance.now(), took = () => `${((performance.now() - t0) / 1000).toFixed(0)} s`;
const shot = async (name) => { await frames(page); await snap(page, `${out}/${name}.png`); console.log(`${name}  (${took()})`); };
const tap = (selector) => page.click(selector, { timeout: TIMEOUT });

await page.goto(served.base, { timeout: TIMEOUT });
await page.waitForFunction(() => window.__nautaReady === true, null, { timeout: TIMEOUT });
await page.screenshot({ path: `${out}/title-ready.png` });
console.log(`title-ready  (${took()})`);
// The tap that begins, on the title.
await page.evaluate(() => document.getElementById('loading')?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true })));
await page.waitForSelector('.nt-menu:not([hidden]) .menu-choice', { timeout: TIMEOUT });
await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: TIMEOUT });
await shot('main');
await tap('.menu-choice.first');
await shot('setup');
await tap('.menu-go');
await shot('deck');
await tap('#settings');
await shot('pause');
await tap('.menu-pause .menu-go');
// She strikes (the order asked twice): the fight ends, and after the quiet moment the end card comes.
await page.evaluate(() => { window.__nautaSail.say('strike'); window.__nautaSail.say('strike'); });
await page.evaluate(() => window.__nautaSail.onward(1, false));
await page.waitForTimeout(END_WAIT_MS);
await page.waitForSelector('.menu-end', { timeout: TIMEOUT });
await shot('end');
await page.click('.menu-end .menu-sheet-foot .nt-button:not(.menu-go)');
await tap('.menu-choice:nth-child(4)');
await page.waitForTimeout(2000);
await shot('join');
await page.keyboard.press('Escape');
await tap('.menu-choice:nth-child(3)');
await tap('.menu-go');
await page.waitForSelector('.menu-room', { timeout: TIMEOUT });
await page.waitForTimeout(3000);
await shot('room');
await tap('.menu-room .nt-link');
await tap('.menu-language button:nth-child(2)');
await shot('main-de');
await tap('.menu-language button:nth-child(1)');
await page.setViewportSize({ width: 820, height: 1180 });
await shot('main-upright');
// Your first command (N7.4): the first lieutenant's welcome, then his first lesson (the look) after the welcome is read.
await page.setViewportSize({ width: 1180, height: 820 });
await tap('.menu-choice:nth-child(1)');
await page.waitForSelector('.nt-lesson-skip:not([hidden])', { timeout: TIMEOUT });
await page.waitForTimeout(FIRST_WELCOME_MS);
await shot('first-welcome');
await page.waitForTimeout(FIRST_LOOK_MS);
await shot('first-look');
console.log(`${out}: done in ${took()}${failed ? ', the page failed' : ''}`);
await served.close();
process.exit(failed ? 1 : 0);
