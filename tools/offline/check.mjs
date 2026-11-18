/**
 * The game works without a network (plan N7.6), on the build as GitHub Pages serves it: `npm run check:offline`.
 * It builds the game under `/Nauta/` (the folder Pages uses) and serves it as Pages does (tools/offline/serve.mjs),
 * then in a headless browser (no GPU: the page is `?title`, which starts the worker as the game does):
 *
 *   1. the worker installs and keeps every file of the build;
 *   2. the network goes away and the page reloads: it starts, and every file of the build, the page at any address
 *      (`?sail&walk`) included, comes from the worker; what is not the game's fails as it should;
 *   3. a new build is laid under the same address: the browser finds the new worker, installs it, the page restarts on
 *      it (the title still waits for its tap), and only the files that changed were fetched;
 *   4. a file whose bytes are not the build's (a deploy half-way through) is never kept;
 *   5. `?nosw` removes the worker and everything it kept.
 *
 * Fails on any of them. About 40 s; the build is the bulk of it (the crew pack is left out of the site but for its manifest). SHOT_TIMEOUT bounds every wait.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { TIMEOUT, openBrowser } from '../shot/browser.mjs';
import { listBuild, writeWorker } from './precache.ts';
import { formatBytes } from '../../src/probe/report.ts';
import { serveDir } from './serve.mjs';

const FOLDER = '/Nauta/';
/** The crew pack's folder in the build. */
const PACK = 'packs/human';
const work = join('node_modules/.cache/offline-check');
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const dir = join(work, 'site');

let failures = 0;
const check = (ok, what) => { if (!ok) failures++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); };

console.log('building the game under /Nauta/ ...');
execFileSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir'], { env: { ...process.env, VITE_BASE: FOLDER }, stdio: ['ignore', 'ignore', 'inherit'] });
// The crew pack is most of the build (1283 of 1555 files, 66 of 83 MB) and the worker's fetching it takes minutes on CI, twice in this check (the install, the fresh browser of step 4): the check keeps its manifest, which is what it looks for offline, and leaves the rest out (and the worker is made again with the shorter list).
for (const name of readdirSync(join(dir, PACK))) if (name !== 'manifest.json') rmSync(join(dir, PACK, name), { recursive: true, force: true });
await writeWorker(dir, 'check-1');
const built = listBuild(dir);
console.log(`${built.length} files, ${formatBytes(built.reduce((n, f) => n + f.bytes, 0))}`);

const served = await serveDir(dir, FOLDER);
const { browser, close } = await openBrowser(served);
const opts = { timeout: TIMEOUT };
const kept = (page, all = true) => page.waitForFunction((everything) => { const k = window.__nautaOffline?.kept; return k && (everything ? k.files === k.total : k.files > 0); }, all, opts);
const cached = (page) => page.evaluate(async () => (await (await caches.open('nauta-files-1')).keys()).length);
const settle = (ms) => new Promise((done) => setTimeout(done, ms));

try {
  // 1 and 2: install, then without a network.
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (e) => console.error(`[page error] ${e.message}`));
  await page.goto(`${served.base}?title&sw`, opts);
  await kept(page);
  check((await cached(page)) === built.length, `the worker keeps all ${built.length} files of the build`);
  const state = await page.evaluate(() => ({ ...window.__nautaOffline.kept }));
  check(state.totalBytes === built.reduce((n, f) => n + f.bytes, 0), `and says how much: ${formatBytes(state.bytes)}`);

  await context.setOffline(true);
  await page.reload(opts);
  await page.waitForFunction(() => window.__nautaTitle !== undefined, null, opts);
  check(true, 'offline: the page reloads and the title draws its first picture');
  const fromWorker = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => e.workerStart > 0).length);
  check(fromWorker > 0, `offline: ${fromWorker} of the page's files came through the worker`);
  const offlineFetch = await page.evaluate(async () => {
    const ask = (path) => fetch(path).then((r) => r.ok, () => false);
    return { index: await ask('sound/index.json'), fittings: await ask('ship/fittings.fmpk'), crew: await ask('packs/human/manifest.json'), font: await ask('fonts/caslon-400.woff2'), missing: await ask('sound/nothing.mp3') };
  });
  check(offlineFetch.index && offlineFetch.fittings && offlineFetch.crew && offlineFetch.font, 'offline: the sounds, the ship, the crew pack and the fonts are all there');
  check(!offlineFetch.missing, 'offline: what the build does not have fails, as it should');
  const sailing = await context.newPage();
  const answer = await sailing.goto(`${served.base}?sail&walk&hud`, opts).catch(() => null);
  check(!!answer && answer.ok() && (await sailing.locator('#loading').count()) === 1, 'offline: the game at another address (?sail&walk&hud) opens too');
  await sailing.close();
  await context.setOffline(false);

  // 3: a new build under the same address. A core file and a late file change, and the build lists them anew.
  served.hits.clear();
  const first = built.find((f) => f.path === 'manifest.webmanifest');
  const late = built.find((f) => f.path.startsWith('sound/bed/'));
  writeFileSync(join(dir, 'manifest.webmanifest'), `${readFileSync(join(dir, 'manifest.webmanifest'), 'utf8')}\n`);
  appendFileSync(join(dir, late.path), Buffer.from([0]));
  await writeWorker(dir, 'check-2');
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
  // The title waits for its tap, so the page restarts on the new version by itself.
  await page.waitForFunction(() => window.__nautaOffline?.kept?.version === 'check-2' && window.__nautaOffline.kept.files === window.__nautaOffline.kept.total, null, opts);
  const fetched = [...served.hits.keys()].filter((p) => p !== 'sw.js').sort();
  check(fetched.length === 2 && fetched.includes(first.path) && fetched.includes(late.path), `an update fetched only what changed: ${fetched.join(', ')}`);
  check((await cached(page)) === built.length, 'the old versions of the two files are gone, the rest kept');

  // 4: bytes that are not the build's are not kept (a fresh browser, so it has to fetch everything).
  const bad = built.find((f) => f.path.startsWith('ship/'));
  appendFileSync(join(dir, bad.path), Buffer.from([0]));
  const other = await browser.newContext();
  const fresh = await other.newPage();
  await fresh.goto(`${served.base}?title&sw`, opts);
  await fresh.waitForFunction((total) => window.__nautaOffline?.kept?.files >= total - 1, built.length, opts);
  await settle(6000);
  const count = await cached(fresh);
  check(count === built.length - 1, `a file whose bytes are not the build's is not kept (${count} of ${built.length})`);
  await other.close();

  // 5: ?nosw removes it all.
  await page.goto(`${served.base}?title&nosw`, opts);
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && (await caches.keys()).length === 0, null, opts);
  check(true, '?nosw removes the worker and everything it kept');
} finally {
  await close();
  rmSync(work, { recursive: true, force: true });
}
console.log(failures ? `${failures} failed` : 'all ok');
process.exit(failures ? 1 : 0);
