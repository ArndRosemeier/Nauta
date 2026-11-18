/**
 * What the page downloads (N7.6, download size): `npm run check:transfer -- "<query>" [more queries]` (run `npm run build`
 * first). Each query opens the served build in a fresh browser context, waits for the page to be ready (or
 * TRANSFER_SECONDS), and lists every file it fetched, summed by folder, with the size gzip makes of the text ones (what
 * GitHub Pages sends), against the plan's budget for everything a duel needs (60 MB). TRANSFER_DIR serves another
 * folder than `dist`, TRANSFER_LIST=<n> lists the n largest files.
 */
import { gzipSync } from 'node:zlib';
import { TIMEOUT, openBrowser, shotSize } from '../shot/browser.mjs';
import { formatBytes } from '../../src/probe/report.ts';
import { serveDir } from './serve.mjs';

const queries = process.argv.slice(2);
if (!queries.length) { console.error('usage: npm run check:transfer -- "<query>" [...]'); process.exit(2); }
/** The most a duel may download, bytes (docs/design/implementation-plan.md, the budgets). */
const DUEL_BUDGET = 60 * 1024 * 1024;
const TEXT = /\.(js|css|html|json|svg|webmanifest|map)$/;
// A copy of the build is served, so a build made meanwhile does not change the page under the measure.
const dir = process.env.TRANSFER_DIR ?? 'dist';
const own = await serveDir(dir);
const served = await openBrowser(own);
const { width, height } = shotSize();
let status = 0;
for (const query of queries) {
  const context = await served.browser.newContext({ viewport: { width, height } });
  const page = await context.newPage();
  const files = new Map();
  const pending = [];
  page.on('response', (res) => {
    const url = new URL(res.url());
    if (url.origin !== new URL(served.base).origin || res.request().method() !== 'GET') return;
    pending.push(res.body().then((body) => {
      const sent = TEXT.test(url.pathname) ? gzipSync(body).length : body.length;
      files.set(url.pathname, { raw: body.length, sent });
    }).catch(() => {}));
  });
  await page.goto(served.base + (query.startsWith('?') ? query : '?' + query), { timeout: TIMEOUT });
  // TRANSFER_SECONDS: measure what came in that long instead of waiting for the page to be ready (a software GPU takes minutes).
  if (process.env.TRANSFER_SECONDS) await page.waitForTimeout(Number(process.env.TRANSFER_SECONDS) * 1000);
  else await page.waitForFunction(() => window.__nautaReady === true, null, { timeout: TIMEOUT }).catch(() => { status = 1; console.error('page did not report ready'); });
  await page.waitForTimeout(Number(process.env.SHOT_WAIT ?? 0));
  await Promise.all(pending);
  const folders = new Map();
  for (const [path, { raw, sent }] of files) {
    const rest = path.slice(1);
    const key = rest.includes('/') ? rest.split('/').slice(0, rest.startsWith('packs/') ? 3 : rest.startsWith('sound/') ? 2 : 1).join('/') : '(root)';
    const f = folders.get(key) ?? { n: 0, raw: 0, sent: 0 };
    f.n++; f.raw += raw; f.sent += sent;
    folders.set(key, f);
  }
  let sent = 0;
  console.log(`\n${query}: ${files.size} files`);
  for (const [key, f] of [...folders].sort((a, b) => b[1].sent - a[1].sent)) {
    sent += f.sent;
    console.log(`  ${key.padEnd(28)} ${String(f.n).padStart(4)} files ${formatBytes(f.sent).padStart(10)}`);
  }
  console.log(`  total sent (gzip for text)    ${formatBytes(sent).padStart(10)}  (budget for a duel: ${formatBytes(DUEL_BUDGET)})`);
  if (sent > DUEL_BUDGET) status = 1;
  if (process.env.TRANSFER_LIST) for (const [p, f] of [...files].sort((a, b) => b[1].sent - a[1].sent).slice(0, Number(process.env.TRANSFER_LIST))) console.log(`    ${p} ${formatBytes(f.sent)}`);
  await context.close();
}
await served.close();
process.exit(status);
