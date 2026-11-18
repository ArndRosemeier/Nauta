/**
 * The sails check (plan N3.10): `npm run shot:sails [-- <out dir>]` (run `npm run build` first). One page of the brig
 * under way (`?sail`), commanded through `window.__nautaSail` (main.ts) and run on by whole minutes at once, so the
 * software GPU only draws the pictures:
 *  - all sail set from her start (the gaskets let go, sheeted home, the yards hoisted);
 *  - on every point of sail from 50 m off: close-hauled, the wind on the beam, on the quarter, before the wind;
 *  - looking up at them from the quarterdeck;
 *  - through a tack (in stays, the sails shivering and aback);
 *  - sail taken in (clewed up, then rolled up on the yards) and the far ship's sails from 500 m.
 * Each picture is `<out dir>/<name>.png`. It fails unless the page reports ready, throws nothing, and the sails were
 * drawn as each step names: every one set and filled under all sail, some aback or slack in stays, all furled at
 * the end (a check proves what it says, docs/CHECKS.md).
 */
import { mkdirSync } from 'node:fs';
import { openBrowser, openGame, shotSize, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/sails';
mkdirSync(out, { recursive: true });
/** The wind she starts in comes from 247.5° (main.ts); the points of sail as compass courses on the port tack. */
const POINTS = [['close-hauled', 'steer 315'], ['beam', 'steer 337'], ['quarter', 'steer 022'], ['running', 'steer 067']];
/** Seconds the match runs on after an order before a picture: a canvas order takes the crew a while, a course settles. */
const SETTLE = { canvas: 150, course: 75, stays: 14, clew: 6, furl: 200 };

const { width, height } = shotSize('960x600');
const served = await openBrowser();
const game = await openGame(served, '?sail&ship=50-m-off&hud&quality=high&wind=4', { width, height });
const { page } = game;
const problems = [];
const give = async (words) => { const why = await page.evaluate((w) => window.__nautaSail.give(w), words); if (why) problems.push(`"${words}" refused: ${why}`); };
const onward = (s) => page.evaluate((x) => window.__nautaSail.onward(x), s);
const sails = () => page.evaluate(() => window.__nautaSail.sails());
const view = (name) => page.click(`#standpoints button:text-is("${name}")`);
const shot = async (name) => { await onward(0); await snap(page, `${out}/${name}.png`); const s = await sails(); console.log(`${name}: ${JSON.stringify(s)}`); return s; };

await give('all sail');
await onward(SETTLE.canvas);
for (const [name, order] of POINTS) {
  await give(order);
  await onward(SETTLE.course);
  const s = await shot(name);
  if (s.set !== s.sails || !(s.deepest > 0)) problems.push(`${name}: ${s.set} of ${s.sails} sails set, deepest belly ${s.deepest}`);
}
await view('Quarterdeck');
await shot('quarterdeck');
await view('50 m off');
await give('steer 315');
await onward(SETTLE.course);
await give('tack');
await onward(SETTLE.stays);
const stays = await shot('in-stays');
if (!(stays.deepest < 0) && stays.set === stays.sails) problems.push('in stays nothing was drawn aback or slack');
// Each 'take in sail' is one step down: all, plain, battle, bare poles.
for (let i = 0; i < 3; i++) await give('take in sail');
await onward(SETTLE.clew);
await shot('clewing-up');
await onward(SETTLE.furl);
await view('500 m off');
const furled = await shot('furled-500m');
if (furled.furled < furled.sails) problems.push(`taken in, only ${furled.furled} of ${furled.sails} sails were drawn furled`);

for (const p of problems) console.error(p);
await served.close();
if (game.failed() || problems.length) process.exit(1);
