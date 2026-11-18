/**
 * The network's slow check (implementation plan N3.7): two headless browsers play one match through GameHub.
 * One opens a room, the other joins it by its code; both give orders; they must agree on the match's hash at every
 * second, with no drift; the guest's order must be carried out for his ship; then the host's page closes and the
 * guest must take over and run the match on. Run `npm run build` first.
 *
 *   npm run check:room                      against a GameHub stand-in on this machine (tools/net/standin.mjs)
 *   GAMEHUB_URL=https://games.futuremagic.de npm run check:room     against the live server, with the game's key
 *   (GAMEHUB_KEY=ghk_... names another)
 *
 * The pages are `?netcheck` (src/app/netCheck.ts): the match without drawing, so no GPU is needed.
 */
import { openBrowser, TIMEOUT } from '../shot/browser.mjs';
import { startStandin } from './standin.mjs';

const SECONDS = 12;
const STEPS_PER_SECOND = 30;

const live = process.env.GAMEHUB_URL;
const standin = live ? null : await startStandin();
const hub = live ?? standin.url, key = process.env.GAMEHUB_KEY ?? '';
const served = await openBrowser();
let failures = 0;
const ok = (cond, label) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`); if (!cond) failures++; };
const net = (page, what) => page.evaluate(what);

/** How long a page may take to be in its room, ms: a connection that fails is given one more try. */
const CONNECT_MS = 30000;

async function open(query, tries = 2) {
  const page = await (await served.browser.newContext()).newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error(`[page] ${m.text()}`); });
  page.on('pageerror', (e) => { failures++; console.error(`[page error] ${e.message}`); });
  await page.goto(`${served.base}?netcheck&hub=${encodeURIComponent(hub)}${key ? `&key=${encodeURIComponent(key)}` : ''}&${query}`, { timeout: TIMEOUT });
  const inRoom = await page.waitForFunction(() => window.__nautaNet?.role === 'host' || window.__nautaNet?.role === 'guest', null, { timeout: CONNECT_MS }).then(() => true, () => false);
  if (inRoom) return page;
  const problem = await page.evaluate(() => window.__nautaNet?.problem ?? 'no answer').catch(() => 'no answer');
  await page.context().close();
  if (tries <= 1) throw new Error(`a page did not get into its room (${problem})`);
  console.log(`a page did not get into its room (${problem}); one more try`);
  return open(query, tries - 1);
}

const t0 = Date.now();
try {
  console.log(`room check against ${live ? hub : `the stand-in at ${hub}`}`);
  const host = await open('room');
  const code = await net(host, () => window.__nautaNet.code);
  ok(/^[A-Z0-9]{6}$/.test(code), `the host opened room ${code}`);
  const guest = await open(`join=${code}`);
  // The guest starts from the room's state of before he came; the host seats him once it hears he is there.
  const seated = await guest.waitForFunction(() => window.__nautaNet.role === 'guest' && window.__nautaNet.ship === 1, null, { timeout: CONNECT_MS }).then(() => true, () => false);
  ok(seated, 'the guest joined it and commands the second ship');
  ok(await net(host, () => window.__nautaNet.give('plain sail')) === '', 'the host gives an order');
  ok(await net(guest, () => window.__nautaNet.give('come up a point')) === '', 'the guest gives one');
  ok(await net(guest, () => window.__nautaNet.give('take in sail')) === '', 'and another');
  await host.waitForTimeout(SECONDS * 1000);
  const [h, g] = await Promise.all([net(host, () => window.__nautaNet.hashes), net(guest, () => window.__nautaNet.hashes)]);
  const both = Object.keys(g).filter((t) => t in h), differ = both.filter((t) => h[t] !== g[t]);
  ok(both.length >= SECONDS - 3 && differ.length === 0, `they agree at every second both reached (${both.length} seconds, ${differ.length} differ)`);
  ok(await net(guest, () => window.__nautaNet.drifts) === 0, 'the guest never drifted');
  ok(await net(host, () => window.__nautaNet.canvas(1)) === 'bare', 'the guest\'s order was carried out on the host, for his ship');
  ok(await net(host, () => window.__nautaNet.canvas(0)) === 'plain', 'the host\'s order for his own');
  const before = await net(guest, () => window.__nautaNet.tick);
  await host.close();
  await guest.waitForFunction(() => window.__nautaNet.role === 'host', null, { timeout: CONNECT_MS });
  ok(true, 'the host left; the guest hosts now');
  await guest.waitForTimeout(2000);
  const after = await net(guest, () => window.__nautaNet.tick);
  ok(after > before + STEPS_PER_SECOND, `the match goes on (tick ${before} to ${after})`);
} catch (err) {
  failures++;
  console.error(`FAIL ${err instanceof Error ? err.message : String(err)}`);
} finally {
  await served.close();
  await standin?.close();
}
console.log(`${failures ? `${failures} FAILURE(S)` : 'ALL PASS'} in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failures ? 1 : 0);
