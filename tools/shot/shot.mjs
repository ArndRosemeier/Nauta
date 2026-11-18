/**
 * Headless screenshots: `npm run shot -- "<url query>" out.png [more pairs...]` (run `npm run build` first).
 * The browser and its switches are browser.mjs's (CHROMIUM_PATH, SHOT_GPU, SHOT_SIZE, SHOT_TIMEOUT). SHOT_WAIT=<ms>
 * waits after ready.
 * SHOT_DRAG=<dx>,<dy> drags a finger that far across the view before the picture (the touch look).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TIMEOUT, drag, frames, openBrowser, openGame, shotSize, snap } from './browser.mjs';

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) {
  console.error('usage: npm run shot -- "<query>" out.png [...]');
  process.exit(2);
}
const { width, height } = shotSize();
const dragBy = process.env.SHOT_DRAG ? process.env.SHOT_DRAG.split(',').map(Number) : null;

const served = await openBrowser();
let failed = false;
for (let i = 0; i < args.length; i += 2) {
  const query = args[i], out = args[i + 1];
  mkdirSync(dirname(out), { recursive: true });
  const game = await openGame(served, query, { width, height }, !!dragBy);
  const { page, context } = game;
  // The frames after the drag: the picture shows the look it moved.
  if (dragBy) { await drag(page, { width, height }, dragBy); await frames(page); }
  await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 0));
  await snap(page, out);
  const hud = (await page.textContent('#hud', { timeout: TIMEOUT })) ?? '';
  console.log(`${out}: ${hud}`);
  if (game.failed()) failed = true;
  await context.close();
}
await served.close();
process.exit(failed ? 1 : 0);
