/**
 * The damage check (plan N6.5): `npm run shot:damage [-- <out dir>]` (run `npm run build` first), by hand, not in CI.
 * One page of the brig at her moorings shot about by the seeded stand-in (`?ship&scars=3`, app/scars.ts), looked at
 * from the standpoints that show it: her starboard side from alongside and from 50 m off (holes in her side, bulwarks
 * cut and smashed out, sails holed and one split), her waist (the bulwarks cut from inside, holes in her deck) and her
 * berth deck (daylight through her side and the deck over it). Then her sails, holed and one split, under all sail
 * from 50 m off (`?sail`, run on as the sails check does), and on that page her fire (the stand-in's, below in her
 * messdeck): from 50 m off, her waist and her berth deck, and the water in her hold. Last the other brig going down
 * off her beam (`?sail&down`) and what floats after, from her quarterdeck. Each picture is
 * `<out dir>/<standpoint>.png`, `<out dir>/sails.png`, `<out dir>/fire-<standpoint>.png` and
 * `<out dir>/going-down-<s>s.png`. It fails if a page throws or does not report ready; what the pictures show is judged
 * by eye. About 6 minutes in the cloud.
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
/** Where her fire is looked at from. */
const FIRE_VIEWS = ['50 m off', 'Waist', 'Berth deck', 'Hold'];
/** The other ship going down off her beam (`?down`), looked at from her quarterdeck these many seconds after she began. */
const GOING_DOWN = [5, 25, 45, 90];
/** Seconds run on to draw each of them. */
const LOOK_ON = 0.5;
/** Seconds her crew takes to set all sail, as the sails check waits (sails.mjs `SETTLE.canvas`). */
const SET_ALL = 150;
const sailing = await openGame(served, '?sail&ship=50-m-off&scars=3&hud&quality=high&wind=4', { width, height });
await sailing.page.evaluate(() => window.__nautaSail.say('all sail'));
await sailing.page.evaluate((s) => window.__nautaSail.onward(s, false), SET_ALL);
await sailing.page.evaluate(() => window.__nautaSail.onward(0));
await snap(sailing.page, `${out}/sails.png`);
console.log(`${out}/sails.png`);
// Her fire (the stand-in's, in her messdeck): its smoke and flames out of her fore hatch, and below, burning.
for (const name of FIRE_VIEWS) {
  await sailing.page.click(`#standpoints button:text-is("${name}")`);
  // The page holds still between the check's jumps: a short one draws the new standpoint.
  await sailing.page.evaluate((s) => window.__nautaSail.onward(s), LOOK_ON);
  const path = `${out}/fire-${name.replace(/ /g, '-').toLowerCase()}.png`;
  await snap(sailing.page, path);
  console.log(path);
}
// The other brig going down off her beam (the stand-in, `?down`), and what floats after.
const down = await openGame(served, '?sail&down&hud&quality=high&wind=4', { width, height });
let ran = 0;
for (const at of GOING_DOWN) {
  await down.page.evaluate((s) => window.__nautaSail.onward(s, false), at - ran);
  ran = at;
  await down.page.evaluate((q) => window.__nautaScene(q), 'ship=quarterdeck&yaw=-90&pitch=-3');
  const path = `${out}/going-down-${at}s.png`;
  await snap(down.page, path);
  console.log(path);
}
const failed = game.failed() || sailing.failed() || down.failed();
await served.close();
process.exit(failed ? 1 : 0);
