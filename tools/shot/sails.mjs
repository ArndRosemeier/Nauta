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
 * sail being clewed up (none set from 25 s, six of the twelve rolled up on their yards by then, since the hands stand by
 * in the waist and below, PR 110); furled. The match
 * moves only by these jumps (main.ts `__nautaSail.onward`), not by the page's clock, so they hold on any machine.
 */
const SETTLE = { canvas: 150, course: 75, clew: 28, furl: 200 };
/**
 * Through a tack the match runs on by this many seconds at a time (`step`; `long` while she comes back to full sail) until the sails stand as the step names, at most this
 * long (the hands stand by in the waist and below, PR 110, and walk to their stations first: a tack waits for them).
 * `fill`: after a course change from the beam no sail may stay aback longer than this (the courses once did, minutes:
 * their yards braced 4° less than the topsails', so they could not fill whenever the topsails just drew).
 */
const STAYS = { step: 2, long: 6, most: 240, fill: 30 };

/** A sail still set at the clewing-up picture: the match runs on this many s more, at most this many times, and the picture is taken again. */
const CLEW_LATE = { step: 10, times: 3 };

const { width, height } = shotSize('800x500');
const served = await openBrowser();
const game = await openGame(served, '?sail&nocrew&ship=50-m-off&hud&quality=high&wind=4', { width, height });
const { page } = game;
// The panels would hide her: only the standpoints stay, as the check clicks them (the officer row lies over their buttons).
await page.addStyleTag({ content: '#version,#orders,#room,.nt-officers{display:none!important}' });
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
const until = async (done, step = STAYS.step) => {
  let waited = 0;
  while (waited < STAYS.most && !done(await page.evaluate(() => window.__nautaSail.aback()))) { await onward(step); waited += step; }
  return waited;
};
await onward(SETTLE.course);
// Full on the port tack first (her sheets crossed from running before the wind), so the sails aback come from the tack.
// Once braced round the sails fill within seconds: `fill` is the most this may take.
const full = await until((n) => n === 0, STAYS.long);
const before = await page.evaluate(() => window.__nautaSail.aback());
if (full > STAYS.fill || before > 0) problems.push(`${before} sails still aback ${full} s after the course change: they should fill within ${STAYS.fill} s`);
await say('tack');
// In stays: the match runs on until it has more sail aback (the drawing follows on the next frame).
const waited = await until((n) => n > before);
console.log(`full ${full} s after the course, in stays ${waited} s after "tack"`);
const stays = await shot('in-stays');
if (waited >= STAYS.most || !stays.aback) problems.push(`in stays (${waited} s after "tack", ${before} aback before) no more sail was aback`);
// Each 'take in sail' is one step down: all, plain, battle, bare poles.
for (let i = 0; i < 3; i++) await say('take in sail');
await onward(SETTLE.clew);
// None is drawn set once every sail is clewed up and some are rolled up on their yards; a sail kept aback by the tack is clewed up last, so wait a little for it.
let clewing = await shot('clewing-up');
for (let late = 0; late < CLEW_LATE.times && clewing.set > 0 && clewing.furled < clewing.sails; late++) { await onward(CLEW_LATE.step); clewing = await shot('clewing-up'); }
if (clewing.set > 0 || clewing.furled === clewing.sails) problems.push(`taking in: ${clewing.set} sails still drawn set, ${clewing.furled} already furled`);
await onward(SETTLE.furl);
await view('500 m off');
const furled = await shot('furled-500m');
if (furled.furled < furled.sails) problems.push(`taken in, only ${furled.furled} of ${furled.sails} sails were drawn furled`);

for (const p of problems) console.error(p);
await served.close();
if (game.failed() || problems.length) process.exit(1);
