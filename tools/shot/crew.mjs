/**
 * The crew check (plan N4.3): `npm run shot:crew [-- <out dir>]` (run `npm run build` and `npm run packs` first; by
 * hand, not in CI). One page of the brig under way (`?sail`), her orders given through `window.__nautaSail` (main.ts)
 * and the match run on, pictures of each order being carried out: the men standing by, making sail (hauling at the
 * pins, going aloft), beating to quarters (the gun crews), from the quarterdeck, the waist and 50 m off, and the berth
 * deck seen from below. Each picture is `<out dir>/<name>.png`; the crew's HUD line (men drawn, the pool, its memory)
 * is printed with it. It fails unless the page reports ready, throws nothing, and both crews hold under 150 MB.
 */
import { mkdirSync } from 'node:fs';
import { openBrowser, openGame, shotSize, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/crew';
mkdirSync(out, { recursive: true });
/** Both crews' share of the page's memory (implementation plan N4: "Both crews together stay inside 150 MB"), bytes. */
const CREW_BYTES = 150 * 1024 * 1024;
/** Seconds the match runs on after each order before its pictures: the men told off and on their way, then at work. */
const SOON = 6;
const LATER = 20;

const { width, height } = shotSize('1024x640');
const served = await openBrowser();
const game = await openGame(served, '?sail&ship=quarterdeck&hud&wind=4', { width, height });
const { page } = game;
await page.addStyleTag({ content: '#version,#orders,#room,.nt-officers{display:none!important}' });
const problems = [];
const say = async (words) => { const why = await page.evaluate((w) => window.__nautaSail.say(w), words); if (why) problems.push(`"${words}" refused: ${why}`); };
const onward = (s) => page.evaluate((x) => window.__nautaSail.onward(x, false), s);
const view = (name) => page.click(`#standpoints button:text-is("${name}")`);
/** Real seconds given the near pool to dress the men now nearest (a re-dress is a reshape in its workers) before a picture. */
const DRESSING_MS = 2500;
const shot = async (name) => {
  await page.evaluate(() => window.__nautaSail.onward(0));
  await page.waitForTimeout(DRESSING_MS);
  await page.evaluate(() => window.__nautaSail.onward(0));
  await page.evaluate(() => window.__nautaSail.onward(0));
  await snap(page, `${out}/${name}.png`);
  const hud = (await page.textContent('#hud')) ?? '';
  console.log(`${name}: ${hud.split('\n').filter((l) => l.startsWith('crew')).join(' | ')}`);
};

await shot('standing-by-quarterdeck');
await view('Waist');
await shot('standing-by-waist');
await say('plain sail');
await onward(SOON);
await shot('make-sail-waist');
await view('Quarterdeck');
await shot('make-sail-quarterdeck');
await onward(LATER);
await shot('make-sail-later-quarterdeck');
await view('50 m off');
await shot('make-sail-50m');
await say('beat to quarters');
await onward(LATER);
await view('Waist');
await shot('quarters-waist');
await view('Berth deck');
await shot('berth-deck');
const memory = await page.evaluate(() => window.__nautaCrew?.memory());
const held = memory ? memory.figures + memory.atlas + memory.pool + memory.workbench : 0;
console.log(`crew memory: ${JSON.stringify(memory)} = ${(held / 1048576).toFixed(1)} MB`);
if (held > CREW_BYTES) problems.push(`the crews hold ${(held / 1048576).toFixed(1)} MB, over 150`);
if (game.failed()) problems.push('the page failed');
await game.context.close();
await served.close();
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
