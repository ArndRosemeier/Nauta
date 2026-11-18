/**
 * The sails check (plan N3.10): `npm run shot:sails [-- <out dir> [all]]` (run `npm run build` first; CI takes the
 * short set, the beam, in stays, clewing up and furled, inside its budget; `all` takes every picture below). One page of the brig
 * under way (`?sail`), commanded through `window.__nautaSail` (main.ts) and run on by whole minutes at once, so the
 * software GPU only draws the pictures:
 *  - all sail set from her start (the gaskets let go, sheeted home, the yards hoisted);
 *  - on every point of sail from 50 m off: close-hauled, the wind on the beam, on the quarter, before the wind;
 *  - looking up at them from the quarterdeck, and the far ship's from 2 km;
 *  - through a tack (in stays, a sail aback);
 *  - sail taken in (clewed up, then rolled up on the yards) and the far ship's sails from 500 m.
 * Each picture is `<out dir>/<name>.png`. It fails unless the page reports ready, throws nothing, and the sails were
 * drawn as each step names: every one set and filled under all sail, one aback in stays, being taken in, all furled at
 * the end (a check proves what it says, docs/CHECKS.md).
 */
import { mkdirSync } from 'node:fs';
import { openBrowser, openGame, shotSize, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/sails';
/** `all` takes every picture (the package's set); CI takes the short one inside its budget: on the beam, in stays, clewing up, furled. */
const all = process.argv.slice(3).includes('all');
mkdirSync(out, { recursive: true });
/** The points of sail on the port tack: degrees off the wind (`full and by` lies as close as she will). */
const POINTS = [['close-hauled', null], ['beam', 90], ['quarter', 135], ['running', 180]];
/** Off the wind before the tack, degrees: a little free of close-hauled. */
const BEFORE_TACK = 75;
const COMPASS = 360;
/**
 * Seconds the match runs on after an order before a picture: a canvas order takes the crew a while, a course settles; a
 * sail being clewed up (all off their sheets from 15 s, the next furled after 30 s); furled. The match
 * moves only by these jumps (main.ts `__nautaSail.onward`), not by the page's clock, so they hold on any machine.
 */
const SETTLE = { canvas: 150, course: 75, clew: 18, furl: 200 };
/** Through a tack the match runs on by this many seconds at a time until a sail is aback, at most this long. */
const STAYS = { step: 2, most: 60 };

const { width, height } = shotSize('800x500');
const served = await openBrowser();
const game = await openGame(served, '?sail&ship=50-m-off&hud&quality=high&wind=4', { width, height });
const { page } = game;
// The panels would hide her: only the standpoints stay, as the check clicks them.
await page.addStyleTag({ content: '#version,#orders,#room{display:none!important}' });
const problems = [];
const say = async (words) => { const why = await page.evaluate((w) => window.__nautaSail.say(w), words); if (why) problems.push(`"${words}" refused: ${why}`); };
/** The match runs on at once; the software GPU draws only the pictures (each `shot` draws the frame that catches the sails up). */
const onward = (s) => page.evaluate((x) => window.__nautaSail.onward(x, false), s);
const view = (name) => page.click(`#standpoints button:text-is("${name}")`);
const shot = async (name) => {
  await page.evaluate(() => window.__nautaSail.onward(0));
  await snap(page, `${out}/${name}.png`);
  const s = await page.evaluate(() => window.__nautaSail.sails());
  console.log(`${name}: ${JSON.stringify(s)}`);
  return s;
};

/** A course off the wind on the port tack, as the master takes it (`steer 123`). */
const course = (from, off) => `steer ${String(Math.round((from + off) % COMPASS)).padStart(3, '0')}`;

await say('all sail');
await onward(SETTLE.canvas);
for (const [name, off] of all ? POINTS : POINTS.filter(([n]) => n === 'beam')) {
  await say(off === null ? 'full and by' : course(await page.evaluate(() => window.__nautaSail.windFrom()), off));
  await onward(SETTLE.course);
  const s = await shot(name);
  if (s.set !== s.sails || !(s.deepest > 0)) problems.push(`${name}: ${s.set} of ${s.sails} sails set, deepest belly ${s.deepest}`);
}
if (all) {
  await view('Quarterdeck');
  await shot('quarterdeck');
  await view('2 km off');
  const far = await shot('far-2km');
  if (far.set !== far.sails) problems.push(`2 km off: ${far.set} of ${far.sails} sails set`);
}
await view('50 m off');
await say(course(await page.evaluate(() => window.__nautaSail.windFrom()), BEFORE_TACK));
/** Runs the match on, a step at a time, until `done(sails aback)` or the most it waits; the seconds waited. */
const until = async (done) => {
  let waited = 0;
  while (waited < STAYS.most && !done(await page.evaluate(() => window.__nautaSail.aback()))) { await onward(STAYS.step); waited += STAYS.step; }
  return waited;
};
await onward(SETTLE.course);
// Full on the port tack first (her sheets crossed from running before the wind), so the sails aback come from the tack.
const full = await until((n) => n === 0);
if (full >= STAYS.most) problems.push(`before the tack, sails were still aback ${full} s on`);
await say('tack');
// In stays: the match runs on until it has a sail aback (the drawing follows on the next frame).
const waited = await until((n) => n > 0);
console.log(`full ${full} s after the course, in stays ${waited} s after "tack"`);
const stays = await shot('in-stays');
if (!stays.aback) problems.push(`in stays (${waited} s after "tack") no sail was drawn aback`);
// Each 'take in sail' is one step down: all, plain, battle, bare poles.
for (let i = 0; i < 3; i++) await say('take in sail');
await onward(SETTLE.clew);
const clewing = await shot('clewing-up');
if (clewing.set > 0 || clewing.furled === clewing.sails) problems.push(`taking in: ${clewing.set} sails still drawn set, ${clewing.furled} already furled`);
await onward(SETTLE.furl);
await view('500 m off');
const furled = await shot('furled-500m');
if (furled.furled < furled.sails) problems.push(`taken in, only ${furled.furled} of ${furled.sails} sails were drawn furled`);

for (const p of problems) console.error(p);
await served.close();
if (game.failed() || problems.length) process.exit(1);
