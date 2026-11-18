/**
 * Where a browser check's time goes: `npm run shot:probe -- "<query>" [<width>x<height>]` (run `npm run build` first)
 * opens the game at `query` (default `?day=0&quality=high`, 800 × 500) as the checks do, waits until it is ready and two
 * frames after it are drawn, and prints how long each took, the pipelines built (how many, their summed time, the
 * slowest) and the queue submits that kept the GPU busiest (gpuprobe.js): their passes, draws and first-used
 * pipelines. On the software GPU a frame of the whole view costs seconds, so anything drawn behind the loading screen
 * shows here (docs/CHECKS.md, "Browser checks: the rule").
 */
import { fileURLToPath } from 'node:url';
import { openBrowser, openGame } from './browser.mjs';

/** The submits printed: the busiest few. */
const SHOWN = 12;
const [query = '?day=0&quality=high', size = '800x500'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const s = (ms) => `${(ms / 1000).toFixed(1)} s`;
const served = await openBrowser();
const t0 = performance.now();
const game = await openGame(served, query, { width, height }, false, [fileURLToPath(new URL('./gpuprobe.js', import.meta.url))]);
const ready = performance.now() - t0;
await game.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
console.log(`${query} at ${width} × ${height}: ready after ${s(ready)}, two frames more after ${s(performance.now() - t0)}`);
const { pipelines, submits } = await game.page.evaluate(() => window.__gpuProbe);
const slow = [...pipelines].sort((a, b) => b.ms - a.ms);
console.log(`${pipelines.length} pipelines built, ${s(pipelines.reduce((n, p) => n + p.ms, 0))} summed; slowest: ${slow.slice(0, 3).map((p) => `${p.label} ${s(p.ms)}`).join(', ')}`);
// A submit's GPU time: from when the GPU could start it (sent, and the one before done) to done.
let free = 0;
for (const x of submits) { if (x.done === null) continue; x.gpu = x.done - Math.max(free, x.at); free = x.done; }
const busy = submits.filter((x) => x.gpu !== undefined).sort((a, b) => b.gpu - a.gpu).slice(0, SHOWN).sort((a, b) => a.at - b.at);
console.log(`${submits.length} submits; the busiest (sent at, GPU time, passes, draws, dispatches, first-used pipelines):`);
for (const x of busy) console.log(`  ${s(x.at)}  ${s(x.gpu)}  ${x.passes} passes, ${x.draws} draws, ${x.dispatches} dispatches${x.newPipelines ? `, ${x.newPipelines} new: ${x.labels}` : ''}`);
await served.close();
process.exit(game.failed() ? 1 : 0);
