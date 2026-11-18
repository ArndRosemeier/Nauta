/**
 * The ship-and-water check (plan N2.5): `npm run check:ship [-- <out dir> [words...]]` (run `npm run build` first).
 * The brig sailed by a match (`?sail`, the duel's start: on the beam under battle sail) in a force 6 sea, seen over
 * her side, from her bowsprit, astern along her wake, from 50 m off and from above, and from her berth deck (no water
 * inside her). One page: she sails for a while first so her wake lies behind her, then each scene is set with
 * `window.__nautaScene` (`ship=` the standpoint; the match keeps its own clock, so she sails on between pictures).
 * Writes `<out dir>/<name>.png` (default `shots/ship`). Words narrow the set (`npm run check:ship -- shots/ship bow`).
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
const SAIL_FIRST_MS = 30000;

/** Every shot: its file name and the scene's query (a standpoint of src/app/standpoints.ts and an hour). */
export function shipShots() {
  return [
    { name: 'rail', query: 'ship=rail&hour=11&day=0' },
    { name: 'bowsprit', query: 'ship=bowsprit&hour=11&day=0' },
    { name: 'astern', query: 'ship=astern&hour=11&day=0' },
    { name: 'off50', query: 'ship=50-m-off&hour=11&day=0' },
    { name: 'above', query: 'ship=above&hour=11&day=0' },
    { name: 'berth', query: 'ship=berth-deck&hour=11&day=0' },
  ];
}

async function main() {
  const [outDir = 'shots/ship', ...words] = process.argv.slice(2);
  const shots = shipShots().filter((s) => words.every((w) => s.name.includes(w)));
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
    await page.evaluate((q) => window.__nautaScene(q), shot.query);
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
