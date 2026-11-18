/**
 * A fleet action watched (scenarios stage 5), by hand: `npm run shot:fleet [-- <out dir> [ships]]` (run `npm run build`
 * first; not part of CI's slow checks). `?watch&ships=N`: N computer captains in two sides in turn, the match run on by
 * the check (`__nautaSail.onward`) and the eye flown by it (`__nautaWatch`). Pictures: the first view, the fleet from
 * above after a minute, and the eye brought down over the middle. Prints the HUD's ship lines; fails if the page throws.
 */
import { mkdirSync } from 'node:fs';
import { openBrowser, openGame, shotSize, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/fleet', ships = Number(process.argv[3] ?? 4);
mkdirSync(out, { recursive: true });
const { width, height } = shotSize('1180x820');
const served = await openBrowser();
const game = await openGame(served, `?watch=master,seasoned&ships=${ships}&seed=7&hour=11&quality=high&hud`, { width, height });
const { page } = game;
await page.addStyleTag({ content: '#version{display:none!important}' });
const frame = () => page.evaluate(() => window.__nautaSail.onward(0));
const run = (seconds) => page.evaluate((s) => window.__nautaSail.onward(s, false), seconds);
const watch = (fn, ...args) => page.evaluate(([f, a]) => window.__nautaWatch[f](...a), [fn, args]);
const shot = async (name) => {
  await frame();
  await snap(page, `${out}/${name}.png`);
  console.log(name, (await page.textContent('#hud'))?.split('\n')[0]);
};
await shot('start');
await run(45);
await watch('company', 'both');
await watch('flyFor', 6);
await shot('both');
const above = await watch('flyFor', 8, { climb: 1, boost: true }, { pitch: -1.3 });
await shot('from-above');
console.log(JSON.stringify(above));
await served.close();
if (game.failed()) process.exit(1);
