/**
 * The other ship and the spyglass (plan N3.8), by hand: `npm run shot:glass [-- <out dir>]` (run `npm run build`
 * first; not part of CI's slow checks). One page of the duel sailed alone (`?sail`): the other brig at the start,
 * 1,500 m off, with the naked eye and through the glass at 10 and 20 times; then the match run on while the two close,
 * through the glass at about 700 m and with the naked eye as she comes near, crossing from her far level to the whole
 * of her (`__nautaSail.other`), and alongside. Each picture is `<out dir>/<name>.png`; fails if the page throws, she is
 * not there, or she is never drawn near.
 */
import { mkdirSync } from 'node:fs';
import { openBrowser, openGame, shotSize, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/glass';
mkdirSync(out, { recursive: true });
/** The glass's powers the pictures are taken at. */
const POWER = { start: 10, most: 20 };
/**
 * The match runs on this many seconds at a time while the two close, at most this long; pictures through the glass
 * from this distance in, m, as her whole outside starts to show through her far level, and alongside.
 */
const CLOSING = { step: 2, most: 600, glassAt: 800, crossing: 160, alongside: 90 };
/** Where the pictures are taken from: out on her bowsprit, clear of her own sails (the two close bow to bow), and at her rail alongside. */
const STANDPOINT = { far: 'Bowsprit', near: 'Above' };

const { width, height } = shotSize('1180x820');
const served = await openBrowser();
const game = await openGame(served, '?sail&hud&quality=high', { width, height });
const { page } = game;
await page.addStyleTag({ content: '#version,#orders,#room{display:none!important}' });
const view = (name) => page.click(`#standpoints button:text-is("${name}")`);
await view(STANDPOINT.far);
const problems = [];
const sail = (fn, arg) => page.evaluate(([f, a]) => window.__nautaSail[f](a), [fn, arg]);
/** One frame drawn, with nothing run on. */
const frame = () => page.evaluate(() => window.__nautaSail.onward(0));
const shot = async (name, power) => {
  await sail('glass', power);
  // A frame first puts the eye where the ship now is, then the look is turned onto her from there.
  await frame();
  const apart = await sail('aimAtOther');
  await frame();
  await snap(page, `${out}/${name}.png`);
  const her = await sail('other');
  console.log(`${name}: ${Math.round(apart)} m off, glass ${power ?? 'lowered'}, ${JSON.stringify(her)}`);
  if (!her || apart < 0) problems.push(`${name}: no other ship`);
  return { apart, her };
};

await shot('start-naked', null);
await shot('start-glass-10', POWER.start);
await shot('start-glass-20', POWER.most);
// The two close bow to bow: pictures as she comes within each distance (between their middles).
let waited = 0, near = false;
const taken = new Set();
while (waited < CLOSING.most && !taken.has('alongside')) {
  await page.evaluate((s) => window.__nautaSail.onward(s, false), CLOSING.step);
  waited += CLOSING.step;
  const apart = await sail('apart');
  const at = (name, within, power, standpoint) => {
    if (apart > within || taken.has(name)) return null;
    taken.add(name);
    return (standpoint ? view(standpoint) : Promise.resolve()).then(() => shot(name, power));
  };
  await at('closing-glass-10', CLOSING.glassAt, POWER.start);
  near ||= (await at('crossing-naked', CLOSING.crossing, null))?.her?.near ?? false;
  const along = await at('alongside', CLOSING.alongside, null, STANDPOINT.near);
  if (along) { near ||= along.her?.near; await view(STANDPOINT.far); await shot('alongside-bowsprit', null); }
}
if (!near) problems.push(`she was never drawn near (${waited} s on)`);
for (const p of problems) console.error(p);
await served.close();
if (game.failed() || problems.length) process.exit(1);
