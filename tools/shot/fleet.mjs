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
  const hud = (await page.textContent('#hud')) ?? '';
  console.log(name, hud.split('\n')[0], '|', /crew \d+ men[^\n]*?(?=pack|$)/.exec(hud)?.[0] ?? '');
};
await shot('start');
await run(45);
await watch('company', 'both');
await watch('flyFor', 6);
await shot('both');
// Close on the nearest ship that is not the first: turn the eye toward her and fly up to about 60 m from her.
await watch('company', 'stay');
for (let i = 0; i < 12; i++) {
  const here = await watch('flyFor', 0.1);
  const [ex, , ez] = here.eye, near = here.ships.map((h, k) => ({ k, d: Math.hypot(h.x - ex, h.z - ez), h })).sort((a, b) => a.d - b.d)[0];
  if (near.d < 70) break;
  await watch('flyFor', Math.min(8, (near.d - 60) / 25), { forward: 1, boost: true }, { yaw: Math.atan2(-(near.h.x - ex), -(near.h.z - ez)), pitch: -0.1 });
}
// Up to about 12 m, then in to about 40 m from her, the eye on her.
const aimAt = (from, to) => Math.atan2(-(to.x - from.eye[0]), -(to.z - from.eye[2]));
const nearest = (at) => at.ships.map((h) => ({ d: Math.hypot(h.x - at.eye[0], h.z - at.eye[2]), h })).sort((a, b) => a.d - b.d)[0];
let at = await watch('flyFor', 2, { climb: 1 });
for (let i = 0; i < 6 && nearest(at).d > 45; i++) at = await watch('flyFor', Math.min(4, (nearest(at).d - 40) / 25), { forward: 1 }, { yaw: aimAt(at, nearest(at).h), pitch: -0.12 });
at = await watch('flyFor', 0.1, {}, { yaw: aimAt(at, nearest(at).h) + 0.05, pitch: -0.12 });
await shot('close');
const above = await watch('flyFor', 8, { climb: 1, boost: true }, { pitch: -1.3 });
await shot('from-above');
console.log(JSON.stringify(above));
await served.close();
if (game.failed()) process.exit(1);
