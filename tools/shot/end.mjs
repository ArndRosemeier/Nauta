/**
 * The end from on board (plan N6.7): `npm run shot:end [-- <out dir>]` (run `npm run build` first), by hand, not in CI.
 * Five matches that begin with a ship lost (`?sail&end=`, sim/start.ts `endedStart`) and are looked at from her quarterdeck
 * as the end plays out: my own ship sinking under me (`me-sunk`: the water over her deck, the eye going under the sea),
 * the other brig sinking in front of me (`her-sunk`), her colours coming down (`her-struck`) and the other brig burnt out
 * (`her-burnt`); my own colours coming down (`me-struck`, from 50 m off, her ensign at the gaff). Each picture is
 * `<out dir>/<ending>-<s>s.png`, taken that many seconds after the end. It fails if a page throws or does not report ready; what the pictures show is judged by eye. About 5 minutes in the cloud.
 */
import { mkdirSync } from 'node:fs';
import { openBrowser, openGame, shotSize, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/end';
mkdirSync(out, { recursive: true });
const { width, height } = shotSize('800x500');
/** Each ending, the way her view looks, and the seconds after the end each picture is taken at. */
const ENDINGS = [
  { id: 'me-sunk', look: 'yaw=0&pitch=-8', at: [1, 70, 80, 86, 90, 94, 100] },
  { id: 'her-sunk', look: 'yaw=-90&pitch=-3', glass: 8, at: [1, 40, 70, 85, 95, 105] },
  { id: 'me-struck', stand: '50-m-off', look: '', at: [1, 4, 6, 8, 12] },
  { id: 'her-struck', look: 'yaw=-90&pitch=2', glass: 10, at: [1, 4, 8, 12] },
  { id: 'her-burnt', look: 'yaw=-90&pitch=-3', glass: 8, at: [1, 60, 120, 150] },
];
const only = process.argv[3];
const served = await openBrowser();
let failed = false;
for (const e of ENDINGS) {
  if (only && e.id !== only) continue;
  const game = await openGame(served, `?sail&end=${e.id}&ship=${e.stand ?? 'quarterdeck'}&hud&quality=high&wind=4`, { width, height });
  // The match stands at its first step until the check runs it on (`?end=`), and the fight ends in that step: each picture is that long after the end.
  let ran = 0;
  for (const at of e.at) {
    await game.page.evaluate((s) => window.__nautaSail.onward(s, false), at - ran);
    ran = at;
    await game.page.evaluate((q) => window.__nautaScene(q), `ship=${e.stand ?? 'quarterdeck'}${e.look ? `&${e.look}` : ''}`);
    // The other brig is looked at through the glass.
    if (e.glass) {
      await game.page.evaluate((power) => { window.__nautaSail.glass(power); window.__nautaSail.aimAtOther(); }, e.glass);
      await game.page.evaluate(() => window.__nautaSail.onward(0));
    }
    const path = `${out}/${e.id}-${at}s.png`;
    await snap(game.page, path);
    console.log(path);
  }
  failed = failed || game.failed();
  await game.context.close();
}
await served.close();
process.exit(failed ? 1 : 0);
