/**
 * The interface's sheets (docs/design/ui-style.md), by hand, not in CI: `npm run shot:ui [-- <out dir>]` (run
 * `npm run build` first). On the plain sea page (one page load, its start only), at the tablet's 1180 × 820: the view
 * with the rose, every page of the settings, the sound page in German, what's new over the settings, then the
 * tablet upright and a phone's width. Fails if the page throws. About a minute in the cloud.
 */
import { mkdirSync } from 'node:fs';
import { frames, openBrowser, openGame, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/ui';
mkdirSync(out, { recursive: true });
const served = await openBrowser();
const game = await openGame(served, '?hour=10&day=0', { width: 1180, height: 820 }, true);
const { page } = game;
await frames(page);
await snap(page, `${out}/view.png`);
await page.click('#settings');
const pages = ['picture', 'sound', 'view', 'controls', 'fight', 'language'];
for (const [i, name] of pages.entries()) {
  await page.click(`.settings-tabs button:nth-child(${i + 1})`);
  await snap(page, `${out}/settings-${name}.png`);
}
// The language page's second choice is German; then the sound page again, in German.
await page.click('.nt-choice button:nth-child(2)');
await page.click('.settings-tabs button:nth-child(2)');
await snap(page, `${out}/settings-sound-de.png`);
await page.click('.settings-foot .nt-link');
await page.waitForSelector('.whatsnew');
await snap(page, `${out}/whatsnew.png`);
await page.keyboard.press('Escape');
await page.click('.settings-tabs button:nth-child(6)');
await page.click('.nt-choice button:nth-child(1)');
for (const [name, size] of [['upright', { width: 820, height: 1180 }], ['phone', { width: 390, height: 844 }]]) {
  await page.setViewportSize(size);
  await page.click('.settings-tabs button:nth-child(3)');
  await snap(page, `${out}/settings-${name}.png`);
}
const failed = game.failed();
console.log(`${out}: ${pages.length + 5} pictures${failed ? ', the page failed' : ''}`);
await served.close();
process.exit(failed ? 1 : 0);
