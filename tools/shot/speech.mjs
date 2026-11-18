/**
 * The speech bubbles (plan N4.5), by hand, not in CI: `npm run shot:speech [-- <out dir>]` (run `npm run build`
 * first). One page of the brig under way (`?sail`), from her quarterdeck at the tablet's 1180 × 820, commanded through
 * `window.__nautaSail`: a tack (the master answers, the boatswain passes it down), an order she will not take (the first
 * lieutenant says why), the same in German, and her lookout reporting her as she opens her ports. The order panel
 * is hidden so the bubbles show. Fails if the page throws or no bubble shows. A few minutes on the cloud's software GPU.
 */
import { mkdirSync } from 'node:fs';
import { openBrowser, openGame, snap } from './browser.mjs';

const out = process.argv[2] ?? 'shots/speech';
mkdirSync(out, { recursive: true });
const served = await openBrowser();
const problems = [];

/** Gives `words` as an order, runs the match a moment on so its answer is raised, and takes the picture `name`. */
async function scene(page, name, orders, seconds = 0.5) {
  for (const words of orders) {
    const why = await page.evaluate((w) => window.__nautaSail.say(w), words);
    if (why) problems.push(`"${words}": ${why}`);
  }
  // The match runs on and the frame after the jump is drawn (the bubbles are placed in it); then the page holds.
  await page.evaluate((s) => window.__nautaSail.onward(s), seconds);
  const bubbles = await page.$$eval('.nt-bubble', (all) => all.map((b) => b.textContent));
  console.log(`${name}: ${JSON.stringify(bubbles)}`);
  if (bubbles.length === 0) problems.push(`${name}: no bubble`);
  await snap(page, `${out}/${name}.png`);
}

for (const language of ['en', 'de']) {
  const game = await openGame(served, `?sail&foe=master&quality=lowest&hour=10&day=0`, { width: 1180, height: 820 }, true);
  const { page } = game;
  await page.evaluate((l) => { localStorage.setItem('nauta.settings', JSON.stringify({ language: l })); }, language);
  await page.reload();
  await page.waitForFunction(() => window.__nautaReady === true);
  await page.addStyleTag({ content: '#loading,#orders,#room{display:none!important}' });
  await scene(page, `${language}-tack`, ['tack']);
  await scene(page, `${language}-refused`, ['fill'], 1.6);
  if (language === 'en') await scene(page, 'en-quarters', ['beat to quarters'], 2);
  if (game.failed()) problems.push(`${language}: the page failed`);
  await game.context.close();
}
await served.close();
for (const p of problems) console.error(p);
process.exit(problems.length ? 1 : 0);
