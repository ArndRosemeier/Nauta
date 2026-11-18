/**
 * The ship-and-water check (plan N2.5): `npm run check:ship [-- <out dir> [all | words...]]` (run `npm run build` first).
 * The brig sailed by a match (`?sail`, the duel's start: on the beam under battle sail) in a force 6 sea, seen over
 * her side, from her bowsprit, astern along her wake, from 50 m off and from above, and from her berth deck (no water
 * inside her); last, by hand, the other brig's wake (plan N3.8) through the glass once the two have closed. One page:
 * she sails for a while first so her wake lies behind her, then each scene is set with `window.__nautaScene` (`ship=`
 * the standpoint; the match keeps its own clock, so she sails on between pictures).
 * CI takes one of the eight (CI_SHOTS); `all` takes every one, words narrow the set (`npm run check:ship -- shots/ship
 * bow`). Writes `<out dir>/<name>.png` (default `shots/ship`).
 * The browser's switches are browser.mjs's (CHROMIUM_PATH, SHOT_GPU, SHOT_SIZE); the quality is fixed at `high`.
 * It fails on any error or warning on the page (browser.mjs), or when a picture does not change between scenes.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { openBrowser, openGame, shotSize, snap } from './browser.mjs';

/** The shots' size unless SHOT_SIZE names one: small, as the software GPU draws the whole ship slowly. */
const SHIP_SHOT_SIZE = '800x500';
/** The match's seed: its start has a force 6 wind (sim/start.ts `duelStart`), the strongest a duel starts in. */
const SEED = 4;
/** How long she sails before the first picture, ms: her wake is laid behind her as frames are drawn. */
const SAIL_FIRST_MS = 10000;

/**
 * The picture CI takes: a frame of the whole brig (about 60 s on CI's software GPU, the crowd and the sea in view):
 * her wake under way, from above. The page took 103 s to get ready on CI (2026-11-18, the crews drawn), so two pictures
 * ran 203 s past the step's 180 s; the berth deck (no water inside her), the water along her side (`rail`), the
 * bowsprit, astern and 50 m off go by hand (`all`), as the sea's and the sails' full sets (docs/CHECKS.md, "Browser
 * checks: the rule").
 */
const CI_SHOTS = ['above'];

/**
 * The other brig's picture: the match run on (in steps of so many s, at most so long) until the two have closed within
 * `within` m (between their middles) and passed, apart again by `past`; then she is seen from above her own ship,
 * the look turned onto her, her wake toward the eye (`power`: the glass at it, or lowered, null).
 */
const OTHER = { within: 100, past: 180, step: 5, most: 500, power: 3 };

/** Every shot: its file name and the scene's query (a standpoint of src/app/standpoints.ts and an hour); `other`: the look turned onto the other brig once the two have closed. */
export function shipShots() {
  return [
    { name: 'rail', query: 'ship=rail&hour=11&day=0' },
    { name: 'bowsprit', query: 'ship=bowsprit&hour=11&day=0' },
    { name: 'astern', query: 'ship=astern&hour=11&day=0' },
    { name: 'off50', query: 'ship=50-m-off&hour=11&day=0' },
    { name: 'above', query: 'ship=above&hour=11&day=0' },
    { name: 'berth', query: 'ship=berth-deck&hour=11&day=0' },
    { name: 'stern', query: 'ship=stern&hour=11&day=0' },
    { name: 'other', query: 'ship=above&hour=16&day=0', other: true },
  ];
}

async function main() {
  const [outDir = 'shots/ship', ...words] = process.argv.slice(2);
  const shots = words.includes('all') ? shipShots()
    : words.length ? shipShots().filter((s) => words.every((w) => s.name.includes(w))) : shipShots().filter((s) => CI_SHOTS.includes(s.name));
  if (!shots.length) { console.error(`no shot's name holds ${words.join(' and ')}`); process.exit(2); }
  mkdirSync(outDir, { recursive: true });
  const t0 = performance.now(), served = await openBrowser();
  const game = await openGame(served, `?ship&sail&seed=${SEED}&day=0&quality=high`, shotSize(SHIP_SHOT_SIZE));
  const { page } = game;
  await page.addStyleTag({ content: '#version,#standpoints,#orders,#room{display:none!important}' });
  console.log(`page ready in ${((performance.now() - t0) / 1000).toFixed(0)} s; she sails ${SAIL_FIRST_MS / 1000} s`);
  await page.waitForTimeout(SAIL_FIRST_MS);
  let same = 0, before = null;
  for (const shot of shots) {
    if (shot.other) {
      // The match run on (nothing drawn meanwhile) until the two have closed; her track keeps the straight run between.
      let waited = 0, closed = false;
      for (; waited < OTHER.most; waited += OTHER.step) {
        const apart = await page.evaluate(() => window.__nautaSail.apart());
        closed ||= apart < OTHER.within;
        if (closed && apart > OTHER.past) break;
        await page.evaluate((s) => window.__nautaSail.onward(s, false), OTHER.step);
      }
      console.log(`the two closed and passed after ${waited} s more`);
      await page.evaluate((q) => window.__nautaScene(q), shot.query);
      await page.evaluate((p) => { window.__nautaSail.glass(p); window.__nautaSail.aimAtOther(); }, OTHER.power);
      await page.evaluate(() => window.__nautaSail.onward(0));
      if (!(await page.evaluate(() => window.__nautaSail.other()))) { same++; console.error('the other brig is not drawn'); }
    } else await page.evaluate((q) => window.__nautaScene(q), shot.query);
    const file = join(outDir, `${shot.name}.png`);
    await snap(page, file);
    const now = readFileSync(file);
    if (before && now.equals(before)) { same++; console.error(`${file} is the picture before it: the scene did not change`); }
    before = now;
    console.log(`${file}  (?${shot.query}) at ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  }
  await game.context.close();
  await served.close();
  console.log(`${shots.length} shots in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(game.failed() || same > 0 ? 1 : 0);
}

if (import.meta.main) await main();
