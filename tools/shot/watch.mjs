/**
 * A battle watched from the free camera (plan N7.8), by hand: `npm run shot:watch [-- <out dir> [menu]]` (run `npm run
 * build` first; not part of CI's slow checks). With `menu` it is the plain address instead: the main screen with its new
 * choice, the setup (in German too), the battle begun from the menu, the captain's pause and the end card. One page of `?watch=master,seasoned`, the match run on only by the check
 * (`__nautaSail.onward`) and the eye flown by it (`__nautaWatch`, no frames drawn in between): the first view of both
 * ships, the eye glided to each ship's quarter, flown in close, then, once they have closed and fired, both again and a
 * ship from above. Prints where the eye is and how far each ship is; fails if the page throws, the eye is not where a
 * button should put it, or no gun is fired.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TIMEOUT, frames, openBrowser, openGame, shotSize, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/watch';
mkdirSync(out, { recursive: true });
if (process.argv[3] === 'menu') await fromTheMenu(out);
else await onTheAddress(out);

/** The plain address: the choice on the main screen, the setup, the battle, the pause, the end card. */
async function fromTheMenu(dir) {
  const served = await openBrowser();
  const context = await served.browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true });
  const page = await context.newPage();
  let failed = false;
  if (!process.env.SHOT_GPU) await page.addInitScript({ path: fileURLToPath(new URL('./swapchain.js', import.meta.url)) });
  page.on('console', (m) => { if (m.type() === 'error' || process.env.SHOT_LOG) console.error(`[page] ${m.text()}`); });
  page.on('pageerror', (e) => { failed = true; console.error(`[page error] ${e.message}`); });
  const shot = async (name) => { await frames(page); await snap(page, `${dir}/${name}.png`); console.log(name); };
  const tap = (selector) => page.click(selector, { timeout: TIMEOUT });
  await page.goto(served.base, { timeout: TIMEOUT });
  await page.waitForFunction(() => window.__nautaReady === true, null, { timeout: TIMEOUT });
  await page.evaluate(() => document.getElementById('loading')?.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, bubbles: true })));
  await page.waitForSelector('.nt-menu:not([hidden]) .menu-choice', { timeout: TIMEOUT });
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: TIMEOUT });
  await shot('menu-main');
  await tap('.menu-choice:nth-child(6)');
  await shot('menu-setup');
  await tap('.menu-go');
  await page.waitForSelector('.nt-watch-bar', { state: 'visible', timeout: TIMEOUT });
  await shot('menu-battle');
  await tap('#settings');
  await shot('menu-pause');
  await tap('.menu-pause .menu-go');
  // The fight to its end, run on by the check, then the quiet moment and the card.
  await page.evaluate(() => window.__nautaSail.onward(2400, false));
  await page.waitForSelector('.menu-end', { timeout: TIMEOUT });
  await shot('menu-end');
  await served.close();
  if (failed) process.exit(1);
}

async function onTheAddress(out) {
/** The battle runs on this many seconds at a time, at most this long, until the ships are this close, m, and a gun has fired. */
const CLOSING = { step: 5, most: 900, near: 400 };
/** A glide takes this long to arrive, s. */
const GLIDE = 6;

  const { width, height } = shotSize('1180x820');
  const served = await openBrowser();
  const game = await openGame(served, '?watch=master,seasoned&seed=7&hour=11&quality=high', { width, height });
  const { page } = game;
  await page.addStyleTag({ content: '#version{display:none!important}' });
  const problems = [];
  const frame = () => page.evaluate(() => window.__nautaSail.onward(0));
  const run = (seconds) => page.evaluate((s) => window.__nautaSail.onward(s, false), seconds);
  const watch = (fn, ...args) => page.evaluate(([f, a]) => window.__nautaWatch[f](...a), [fn, args]);
  const shot = async (name, note) => {
    await frame();
    await snap(page, `${out}/${name}.png`);
    console.log(`${name}: ${note}`);
  };
  const glideTo = async (to) => { await frame(); await watch('company', to); return watch('flyFor', GLIDE); };
  
  await shot('start-both', JSON.stringify(await watch('flyFor', 0)));
  let apart = await page.evaluate(() => window.__nautaSail.apart());
  for (let waited = 0; waited < CLOSING.most && apart > CLOSING.near; waited += CLOSING.step) {
    await run(CLOSING.step);
    apart = await page.evaluate(() => window.__nautaSail.apart());
  }
  // The guns: run on until a broadside has just been fired (a frame first, so the page's clock has caught up with the match).
  let fired = Infinity;
  for (let n = 0; n < 40 && !(fired >= 0 && fired < 3); n++) {
    await run(3);
    await frame();
    fired = await page.evaluate(() => Math.min(window.__nautaSail.firedAgo(0), window.__nautaSail.firedAgo(1)));
  }
  if (!(fired >= 0 && fired < 3)) problems.push('no gun was fired');
  let at = await glideTo('both');
  await shot('both-closing', `${JSON.stringify(at)} (ships ${Math.round(apart)} m apart, a gun fired ${fired.toFixed(1)} s ago)`);
  at = await glideTo('british');
  if (at.apart[0] > 120) problems.push(`the British quarter is ${Math.round(at.apart[0])} m from her`);
  await shot('british-quarter', JSON.stringify(at));
  at = await glideTo('french');
  if (at.apart[1] > 120) problems.push(`the French quarter is ${Math.round(at.apart[1])} m from her`);
  await shot('french-quarter', JSON.stringify(at));
  // Flown in close: forward toward her, slowly, until a few metres off her side.
  at = await watch('flyFor', 3, { forward: 1 });
  await shot('french-close', JSON.stringify(at));
  // High over both: straight up.
  at = await watch('flyFor', 8, { climb: 1, boost: true }, { pitch: -1.2 });
  await shot('from-above', JSON.stringify(at));
  for (const p of problems) console.error(p);
  await served.close();
  if (game.failed() || problems.length) process.exit(1);
}
