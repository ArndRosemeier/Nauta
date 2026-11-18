/**
 * The damage check (plan N6.5): `npm run shot:damage [-- <out dir>]` (run `npm run build` first), by hand, not in CI.
 * One page of the brig at her moorings shot about by the seeded stand-in (`?ship&scars=3`, app/scars.ts), looked at
 * from the standpoints that show it: her starboard side from alongside and from 50 m off (holes in her side, bulwarks
 * cut and smashed out, sails holed and one split), her waist (the bulwarks cut from inside, holes in her deck) and her
 * berth deck (daylight through her side and the deck over it). Then her sails, holed and one split, under all sail
 * from 50 m off (`?sail`, run on as the sails check does). Each picture is `<out dir>/<standpoint>.png` and
 * `<out dir>/sails.png`. It fails if a page throws or does not report ready; what the pictures show is judged by eye.
 * About 4 minutes in the cloud.
 */
import { mkdirSync } from 'node:fs';
import { frames, openBrowser, openGame, shotSize, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/damage';
mkdirSync(out, { recursive: true });
/** The standpoints, in turn: the first is the page's own (`?ship=`), the rest clicked. */
const VIEWS = ['Alongside', '50 m off', 'Waist', 'Berth deck'];

const { width, height } = shotSize('800x500');
const served = await openBrowser();
const game = await openGame(served, `?ship=${VIEWS[0].toLowerCase()}&scars=3&hud&quality=high`, { width, height });
const { page } = game;
for (const name of VIEWS) {
  await page.click(`#standpoints button:text-is("${name}")`);
  await frames(page);
  const path = `${out}/${name.replace(/ /g, '-').toLowerCase()}.png`;
  await snap(page, path);
  console.log(path);
}
await game.context.close();
/** Seconds her crew takes to set all sail, as the sails check waits (sails.mjs `SETTLE.canvas`). */
const SET_ALL = 150;
const sailing = await openGame(served, '?sail&ship=50-m-off&scars=3&hud&quality=high&wind=4', { width, height });
await sailing.page.evaluate(() => window.__nautaSail.say('all sail'));
await sailing.page.evaluate((s) => window.__nautaSail.onward(s, false), SET_ALL);
await sailing.page.evaluate(() => window.__nautaSail.onward(0));
await snap(sailing.page, `${out}/sails.png`);
console.log(`${out}/sails.png`);
const failed = game.failed() || sailing.failed();
await served.close();
process.exit(failed ? 1 : 0);
