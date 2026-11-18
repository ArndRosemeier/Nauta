/**
 * The men under fire (plan N6.6): `npm run shot:men [-- <out dir>]` (run `npm run build` and `npm run packs` first; by
 * hand, not in CI). The brig under way with a stand-in for a fight's casualties (`?sail&casualties=3`, app/scars.ts):
 * some men of both crews killed, badly and lightly wounded from the start, and the crews do what they do for them. For
 * each violence level (mild, plain, unsparing; `SHOT_LEVELS=plain,unsparing` picks) a page is opened with that level
 * kept on the device, and pictures are taken: the fallen and the first bearers, the bearers carrying the badly wounded
 * below, and the deck some time on (the blood grown, the killed taken below at mild). Each is
 * `<out dir>/<level>-<name>.png`. It fails unless the page reports ready and throws nothing.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openBrowser, openGame, shotSize, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/men';
mkdirSync(out, { recursive: true });
const levels = (process.env.SHOT_LEVELS ?? 'mild,plain,unsparing').split(',');
/** The seconds the match runs on between pictures: the fallen and the bearers setting out, carrying, and long after. */
const MOMENTS = [['fallen', 0], ['carrying', 9], ['later', 50]];
/** What each picture looks at: the first man hurt so (killed, badly, wounded) on the weather deck, from this far aft and this high, m, looking down this much, rad. */
const VIEWS = [['killed', 'killed'], ['badly', 'carried'], ['wounded', 'wounded']];
const FROM = { aft: 0.6, up: 3.2 };
const PITCH = -1.3;
/** Real seconds given the near pool to dress the men now nearest before a picture. */
const DRESSING_MS = 2500;

const { width, height } = shotSize('1024x640');
const served = await openBrowser();
const problems = [];
for (const level of levels) {
  // The level kept on the device before the page starts, as the settings sheet would keep it.
  const script = join(tmpdir(), `men-${level}.js`);
  writeFileSync(script, `localStorage.setItem('nauta.settings', JSON.stringify({ violence: '${level}' }));`);
  const game = await openGame(served, '?sail&ship=waist&casualties=3&hud&wind=4', { width, height }, false, [script]);
  const { page } = game;
  await page.addStyleTag({ content: '#version,#orders,#room{display:none!important}' });
  /** The eye put beside the n-th man hurt so, looking forward at him; false when none. */
  const lookAt = (harm) => page.evaluate(([h, f, pitch]) => {
    // The highest of them: on the weather deck, not below it.
    const man = window.__nautaCrew.hurtMen(0).filter((x) => x.harm === h).sort((p, q) => q.y - p.y)[0];
    if (!man) return false;
    window.__nautaSail.eyeAt([man.x, man.y + f.up, man.z + f.aft], 0, pitch);
    return `${man.man} at ${man.x.toFixed(1)}, ${man.y.toFixed(1)}, ${man.z.toFixed(1)} in ${man.space} (${man.clip}, ${man.shown ? 'shown' : 'hidden'}, ${man.seen ? 'seen' : 'not in view'})`;
  }, [harm, FROM, PITCH]);
  const shot = async (name) => {
    await page.evaluate(() => window.__nautaSail.onward(0));
    await page.waitForTimeout(DRESSING_MS);
    await page.evaluate(() => window.__nautaSail.onward(0));
    await page.evaluate(() => window.__nautaSail.onward(0));
    await snap(page, `${out}/${level}-${name}.png`);
    const hud = (await page.textContent('#hud')) ?? '';
    console.log(`${level} ${name}: ${hud.split('\n').filter((l) => l.startsWith('crew')).join(' | ')}`);
  };
  let was = 0;
  for (const [moment, at] of MOMENTS) {
    await page.evaluate((s) => window.__nautaSail.onward(s, false), at - was);
    was = at;
    for (const [harm, name] of VIEWS) {
      const where = await lookAt(harm);
      if (!where) { console.log(`${level} ${moment}: nobody ${harm}`); continue; }
      console.log(`${level} ${moment} ${name}: ${where}`);
      await shot(`${moment}-${name}`);
    }
  }
  if (game.failed()) problems.push(`the page failed at ${level}`);
  await game.context.close();
}
await served.close();
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
