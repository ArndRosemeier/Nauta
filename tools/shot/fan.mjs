/**
 * The order fan (plan N4.4), by hand, not in CI: `npm run shot:fan [-- <out dir>]` (run `npm run build` first).
 * `?sail&walk` at the tablet's 1180 × 820, the captain on the quarterdeck: the officers at their posts; the first
 * lieutenant's fan and its ring "Make sail"; the master's fan with "About" under the finger; a key's order (T) sent by
 * the midshipman from below; "steer there" with the captain's arm out. Fails if the page throws. Slow on the cloud's
 * software GPU (each picture takes a while).
 */
import { mkdirSync } from 'node:fs';
import { frames, openBrowser, openGame, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/fan';
mkdirSync(out, { recursive: true });
const served = await openBrowser();
const game = await openGame(served, '?sail&walk&hour=10&day=0&look=40,-6', { width: 1180, height: 820 }, true);
const { page } = game;
await frames(page);
await snap(page, `${out}/officers.png`);
const say = async (name, who, choose = [], light = null) => {
  const shown = await page.evaluate(([w, c]) => window.__nautaFan.open(w, c), [who, choose]);
  if (light) await page.evaluate((id) => window.__nautaFan.lightUp(id), light);
  await frames(page);
  await snap(page, `${out}/${name}.png`);
  console.log(`${name}: ${shown}`);
};
await say('first-lieutenant', 'first lieutenant', [], 'shorten');
await say('make-sail', 'first lieutenant', ['sail'], 'sail-plain');
await say('master', 'master', [], 'about');
await say('midshipman', 'midshipman', ['to-master'], 'steer');
await page.keyboard.press('Escape');
// Steer there: the arm up, the mark and the word by the thumb.
await page.evaluate(() => window.__nautaFan.open('master', ['steer']));
await frames(page);
await snap(page, `${out}/steer-there.png`);
await page.keyboard.press('Escape');
const failed = game.failed();
console.log(`${out}: pictures taken${failed ? ', the page failed' : ''}`);
await served.close();
process.exit(failed ? 1 : 0);
