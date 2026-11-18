/**
 * A fleet action played from the menu (scenarios stage 6), by hand, not in CI: `npm run shot:fleet-play [-- <out dir>]`
 * (run `npm run build` first). The setup's fleet action (six ships on two sides, you commanding one), started with its
 * button; the match run on, the pictures of the deck and the sea around her. Fails if the page throws.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TIMEOUT, frames, openBrowser, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/fleet-play';
mkdirSync(out, { recursive: true });
const served = await openBrowser();
const context = await served.browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
const page = await context.newPage();
let failed = false;
if (!process.env.SHOT_GPU) await page.addInitScript({ path: fileURLToPath(new URL('./swapchain.js', import.meta.url)) });
page.on('console', (m) => { if (m.type() === 'error') console.error(`[page] ${m.text()}`); });
page.on('pageerror', (e) => { failed = true; console.error(`[page error] ${e.stack ?? e.message}`); });
const shot = async (name) => { await frames(page); await snap(page, `${out}/${name}.png`); console.log(name); };
const tap = (selector) => page.click(selector, { timeout: TIMEOUT });

await page.goto(served.base, { timeout: TIMEOUT });
await page.waitForFunction(() => window.__nautaReady === true, null, { timeout: TIMEOUT });
await page.evaluate(() => document.getElementById('loading')?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true })));
await page.waitForSelector('.nt-menu:not([hidden]) .menu-choice', { timeout: TIMEOUT });
await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: TIMEOUT });
await tap('.menu-choice.first');
await tap('.scn-presets button:nth-child(4)');
await tap('.menu-go');
await page.waitForSelector('.controls-card', { timeout: TIMEOUT });
await tap('.controls-card .menu-go');
await shot('deck');
await page.evaluate(() => window.__nautaSail.onward(60, false));
await shot('after-a-minute');
console.log(JSON.stringify(await page.evaluate(() => window.__nautaSail.state?.()?.ships?.map?.((s) => s.side) ?? null)));
await served.close();
if (failed) process.exit(1);
