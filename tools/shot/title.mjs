/**
 * The title's pictures (plan N7.7), by hand: `npm run shot:title [-- <out dir>]`. The built page at `?title` (the title
 * alone, no game behind it) in headless Chromium, desktop and tablet sizes: as it opens, after the sun is dragged
 * low and high, and a moment after a tap on the brig (her gun's flash and smoke). Prints how long the first picture
 * took to come up. Run `npm run build` first; in the cloud set CHROMIUM_PATH.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { TIMEOUT, openBrowser } from './browser.mjs';

const OUT = process.argv[2] ?? 'shots/title';
/** The sizes: a desktop, the iPad Air in landscape and in portrait. */
const SIZES = [['desktop', 1280, 800], ['tablet', 1180, 820], ['portrait', 820, 1180]];
/** How long the picture runs before each shot, ms: the sun follows the finger in about this. */
const SETTLE_MS = 2500;
/** After a tap on the brig: her flash, then her smoke billowing, then the other brig's answer. */
const GUN_MS = [60, 1200, 4300];

mkdirSync(OUT, { recursive: true });
const served = await openBrowser();
let failed = false;
for (const [name, width, height] of SIZES) {
  const context = await served.browser.newContext({ viewport: { width, height }, hasTouch: false });
  const page = await context.newPage();
  page.on('pageerror', (e) => { failed = true; console.error(`[page error] ${e.message}`); });
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[page] ${m.text()}`); });
  await page.goto(`${served.base}?title`, { timeout: TIMEOUT });
  await page.waitForFunction(() => window.__nautaReady === true, null, { timeout: TIMEOUT });
  const up = await page.evaluate(() => window.__nautaTitle ?? -1);
  console.log(`${name}: first picture ${up.toFixed(0)} ms after the page started`);
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: join(OUT, `${name}-open.png`) });
  if (name !== 'desktop') { await context.close(); continue; }
  // The sun dragged down to the horizon (dusk), then up (the afternoon).
  for (const [label, fy] of [['dusk', 0.83], ['afternoon', 0.05]]) {
    await page.mouse.move(width * 0.75, height * 0.4);
    await page.mouse.down();
    await page.mouse.move(width * 0.72, height * fy, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: join(OUT, `${name}-${label}.png`) });
  }
  // Back to sunset, and a tap on the brig.
  await page.mouse.click(width * 0.7, height * 0.55);
  await page.waitForTimeout(SETTLE_MS);
  await page.mouse.click(width * 0.38, height * 0.6);
  let waited = 0;
  for (const [k, ms] of GUN_MS.entries()) {
    await page.waitForTimeout(ms - waited);
    waited = ms;
    await page.screenshot({ path: join(OUT, `${name}-gun-${k + 1}.png`) });
  }
  await context.close();
}
await served.close();
process.exit(failed ? 1 : 0);
