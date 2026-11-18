/**
 * Headless screenshots: `npm run shot -- "<url query>" out.png [more pairs...]` (run `npm run build` first).
 * The browser and its switches are browser.mjs's (CHROMIUM_PATH, SHOT_GPU, SHOT_SIZE, SHOT_TIMEOUT). SHOT_WAIT=<ms>
 * waits after ready.
 * SHOT_DRAG=<dx>,<dy> drags a finger that far across the view before the picture (the touch look).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TIMEOUT, openBrowser, openGame, shotSize } from './browser.mjs';

const args = process.argv.slice(2);
if (args.length < 2 || args.length % 2) {
  console.error('usage: npm run shot -- "<query>" out.png [...]');
  process.exit(2);
}
const { width, height } = shotSize();
const drag = process.env.SHOT_DRAG ? process.env.SHOT_DRAG.split(',').map(Number) : null;

const served = await openBrowser();
let failed = false;
for (let i = 0; i < args.length; i += 2) {
  const query = args[i], out = args[i + 1];
  mkdirSync(dirname(out), { recursive: true });
  const game = await openGame(served, query, { width, height }, !!drag);
  const { page, context } = game;
  if (drag) {
    // A finger put down in the middle, moved in steps and lifted: the same pointer events a tablet sends.
    const x = width / 2, y = height / 2, steps = 8;
    const touch = (type, px, py) => page.evaluate(([t, a, b]) => {
      document.getElementById('view').dispatchEvent(new PointerEvent(t, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: a, clientY: b, bubbles: true }));
    }, [type, px, py]);
    await touch('pointerdown', x, y);
    for (let s = 1; s <= steps; s++) await touch('pointermove', x + (drag[0] * s) / steps, y + (drag[1] * s) / steps);
    await touch('pointerup', x + drag[0], y + drag[1]);
  }
  await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 0));
  await page.screenshot({ path: out, timeout: TIMEOUT });
  const hud = (await page.textContent('#hud', { timeout: TIMEOUT })) ?? '';
  console.log(`${out}: ${hud}`);
  if (game.failed()) failed = true;
  await context.close();
}
await served.close();
process.exit(failed ? 1 : 0);
