/**
 * The standard sea shots (plan N1.9): `npm run shot:sea [-- <out dir> [words...]]` (run `npm run build` first).
 * Every time of day × every sea × every eye height, looking into the sun (the moon by night) a little below level,
 * the clocks stopped and the sea at the same moment, so a shot taken again shows the same waves. They are taken on
 * one page (`window.__nautaScene`), so the shaders are built once and the set runs within its 3 minutes. Writes
 * `<out dir>/<time>-<sea>-eye<m>.png` (default `shots/sea`) and `sheet.png`, all of them on one page. Words narrow
 * the set to the shots whose name holds every one (`npm run shot:sea -- shots/sea noon gale`). The browser's
 * switches are browser.mjs's (CHROMIUM_PATH, SHOT_GPU, SHOT_SIZE); without SHOT_GPU it draws with WebGL 2 (`?gl`). The
 * quality is fixed at its best (`?quality=high`): the software GPU's slow frames would step it down to the lowest.
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIMEOUT, openBrowser, openGame, shotSize } from './browser.mjs';

/** The times of day, hours: just after sunrise, noon, just before sunset, and a moonlit night (the moon is high then). */
export const TIMES = { dawn: 6.3, noon: 12, dusk: 17.7, night: 22 };
/** The seas, as `?sea=` names them: flat calm, a moderate breeze (a duel's weather), a gale. */
export const SEAS = ['calm', 'breeze', 'gale'];
/** The eye heights, m: her quarterdeck (where the game is played) and her masthead. Two, as each shot costs 3 s in the cloud. */
export const EYES = [4.5, 30];
/** The look: straight at the sun's (moon's) bearing, this many degrees below level, so the horizon sits high in the view. */
const LOOK_DOWN = -6;
/**
 * The shots' size unless SHOT_SIZE names one: the software GPU of the cloud and CI draws a frame of the sea in about
 * 3 s at 1280 × 800 (2.5 s at 960 × 600), and the set's 24 frames and its page load must fit in 3 minutes.
 */
const SEA_SHOT_SIZE = '960x600';
/** How wide each shot is drawn on the sheet, px. */
const SHEET_THUMB = 480;

/** Every shot of the set: its file name and the scene's query. */
export function seaShots() {
  const shots = [];
  for (const [time, hour] of Object.entries(TIMES)) for (const sea of SEAS) for (const eye of EYES) {
    shots.push({ name: `${time}-${sea}-eye${eye}`, query: `hour=${hour}&day=0&sea=${sea}&eye=${eye}&look=0,${LOOK_DOWN}` });
  }
  return shots;
}

async function main() {
  const [outDir = 'shots/sea', ...words] = process.argv.slice(2);
  const shots = seaShots().filter((s) => words.every((w) => s.name.includes(w)));
  if (!shots.length) { console.error(`no shot's name holds ${words.join(' and ')}`); process.exit(2); }
  mkdirSync(outDir, { recursive: true });
  const t0 = performance.now(), served = await openBrowser(), viewport = shotSize(SEA_SHOT_SIZE);
  const game = await openGame(served, `?${process.env.SHOT_GPU ? '' : 'gl&'}day=0&quality=high`, viewport);
  const { page } = game;
  // Only the sea and the sky: the version button stays out of the shots.
  await page.addStyleTag({ content: '#version{display:none!important}' });
  const files = [];
  for (const shot of shots) {
    await page.evaluate((q) => window.__nautaScene(q), shot.query);
    const file = join(outDir, `${shot.name}.png`);
    await page.screenshot({ path: file, timeout: TIMEOUT });
    files.push({ ...shot, file });
    console.log(`${file}  (?${shot.query})`);
  }
  await game.context.close();
  await writeSheet(served, files, join(outDir, 'sheet.png'), viewport);
  await served.close();
  console.log(`${files.length} shots and the sheet in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(game.failed() ? 1 : 0);
}

/** All shots on one page: a row per time and sea, a column per eye height, each named. */
async function writeSheet({ browser }, files, out, viewport) {
  const h = Math.round((SHEET_THUMB * viewport.height) / viewport.width);
  const cells = files.map((f) => `<figure><img src="data:image/png;base64,${readFileSync(f.file).toString('base64')}" width="${SHEET_THUMB}" height="${h}"><figcaption>${f.name}</figcaption></figure>`).join('');
  const context = await browser.newContext({ viewport: { width: (SHEET_THUMB + 8) * EYES.length + 8, height: 600 } });
  const page = await context.newPage();
  await page.setContent(`<style>body{margin:0;padding:4px;background:#0b1a2a;color:#e8eef4;font:13px system-ui,sans-serif;display:grid;grid-template-columns:repeat(${EYES.length},${SHEET_THUMB}px);gap:4px 8px}figure{margin:0}img{display:block}figcaption{padding:2px 0 4px}</style>${cells}`);
  await page.screenshot({ path: out, fullPage: true, timeout: TIMEOUT });
  await context.close();
  console.log(out);
}

if (import.meta.main) await main();
