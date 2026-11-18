/**
 * The service worker (plan N7.6): once the game has been loaded, it starts without a network. The build bundles this
 * file into `sw.js` (tools/offline/precache.ts) with the list of its files in `NAUTA_PRECACHE`; any change to a file
 * changes the list, so the browser sees a new worker and installs it. The rules are in plan.ts.
 *
 * - **Install** keeps the core (the page, its scripts and style, the fonts; a megabyte or two, fewer on an update since
 *   unchanged files are already there) and is done. The worker waits for the page to say `apply` (register.ts) rather than
 *   taking over a running game, whose scripts it would pull away.
 * - **Activate** removes what no file of this build needs, and takes over the pages open.
 * - **Fetch** answers from the cache, the page for every address of the game, and the network for what the build does
 *   not have (the game's server, another site) and for range requests. A file of the build not kept yet comes from the
 *   network and is kept as it passes.
 * - **Fill** (asked for by the page, a batch at a time) keeps the files fetched late (the sounds, the ship's fittings,
 *   the crew's pack). Every file is checked against its hash before it is kept, so a deploy half-way through, or a
 *   proxy, cannot put the wrong bytes under a name.
 */
import {
  CACHE_NAME, CACHE_PREFIX, INDEX_PATH, REV_ALGORITHM, fileAsked, howMuchKept, isCore, keyOf, namedByHash, nextFill, revOf, staleKeys,
  type Precached, type ToWorker,
} from './plan';

declare const self: ServiceWorkerGlobalScope;
/** Every file of the build, put in by the build (tools/offline/precache.ts). */
declare const NAUTA_PRECACHE: readonly Precached[];
/** The version of the build this worker belongs to. */
declare const NAUTA_VERSION: string;

/** Files fetched at once while the core installs. */
const CORE_PARALLEL = 4;
/** Files, and bytes, one `fill` message fetches before it answers: small enough that a worker the browser stops loses little. */
const FILL_FILES = 24;
const FILL_BYTES = 12_000_000;
/** Files fetched at once while filling: the game is being played, so it is never more than two. */
const FILL_PARALLEL = 2;
/** A status 200 answers a whole file; anything else (a partial answer, an error page) is not kept. */
const OK = 200;

// The build puts the list in wherever its name stands, so the name stands once.
const build: readonly Precached[] = NAUTA_PRECACHE;
const scope = self.registration.scope;
const files = new Map(build.map((f) => [f.path, f]));

async function keptKeys(cache: Cache): Promise<Set<string>> {
  return new Set((await cache.keys()).map((r) => r.url));
}

/** Stores `response` as `file` if it is whole and its bytes are the file's. */
async function store(file: Precached, response: Response): Promise<boolean> {
  if (response.status !== OK) return false;
  const bytes = await response.arrayBuffer();
  if (revOf(new Uint8Array(await crypto.subtle.digest(REV_ALGORITHM, bytes))) !== file.rev) return false;
  const type = response.headers.get('content-type');
  const cache = await caches.open(CACHE_NAME);
  await cache.put(keyOf(scope, file), new Response(bytes, { headers: type ? { 'content-type': type } : {} }));
  return true;
}

/** Fetches `file` past the browser's own cache (a name without a hash may hold an older deploy's bytes there) and keeps it. */
async function fetchAndKeep(file: Precached): Promise<boolean> {
  try {
    const response = await fetch(new URL(file.path, scope).href, { cache: namedByHash(file.path) ? 'default' : 'reload' });
    return await store(file, response);
  } catch {
    return false; // no network now: the next fill tries again
  }
}

/** Runs `work` on every item, `parallel` at a time. */
async function inParallel<T>(items: readonly T[], parallel: number, work: (item: T) => Promise<unknown>): Promise<void> {
  let next = 0;
  const lane = async () => { while (next < items.length) await work(items[next++]!); };
  await Promise.all(Array.from({ length: Math.min(parallel, items.length) }, lane));
}

async function tellPages(): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const message = howMuchKept(NAUTA_VERSION, build, await keptKeys(cache), scope);
  for (const client of await self.clients.matchAll()) client.postMessage(message);
}

async function installCore(): Promise<void> {
  const cache = await caches.open(CACHE_NAME);
  const kept = await keptKeys(cache);
  const missing = build.filter((f) => isCore(f.path) && !kept.has(keyOf(scope, f)));
  let failed = 0;
  await inParallel(missing, CORE_PARALLEL, async (f) => { if (!(await fetchAndKeep(f))) failed++; });
  // A core that is not whole is no install: the browser tries again at its next check, the files fetched stay.
  if (failed) throw new Error(`${failed} of the ${missing.length} core files could not be kept`);
}

async function removeStale(): Promise<void> {
  for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME) await caches.delete(name);
  const cache = await caches.open(CACHE_NAME);
  for (const key of staleKeys(await keptKeys(cache), build, scope)) await cache.delete(key);
}

let filling: Promise<void> | null = null;
/** Keeps one more batch of the files not kept yet; messages that come while it runs wait for it. */
function fillSome(): Promise<void> {
  filling ??= (async () => {
    const cache = await caches.open(CACHE_NAME);
    const batch = nextFill(build, await keptKeys(cache), scope, FILL_FILES, FILL_BYTES);
    await inParallel(batch, FILL_PARALLEL, fetchAndKeep);
  })().finally(() => { filling = null; });
  return filling;
}

self.addEventListener('install', (event) => {
  event.waitUntil(installCore());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(removeStale().then(() => self.clients.claim()).then(tellPages));
});

self.addEventListener('message', (event) => {
  const message = event.data as ToWorker;
  if (message.kind === 'apply') event.waitUntil(self.skipWaiting());
  else if (message.kind === 'fill') event.waitUntil(fillSome().then(tellPages));
  else event.waitUntil(tellPages());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  // Range requests (a media element asking for a piece) go to the network: the cache holds whole files.
  if (request.method !== 'GET' || request.headers.has('range')) return;
  const file = fileAsked(files, scope, request.url, request.mode === 'navigate');
  if (!file) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const kept = await cache.match(keyOf(scope, file));
    if (kept) return kept;
    // Not kept yet (the file is fetched late and the fill has not reached it, or the browser dropped it): from the
    // network, and kept for the next time while the page uses this copy.
    const response = await fetch(request);
    event.waitUntil(store(file, response.clone()).catch(() => false));
    return response;
  })());
});

// The page is the one answer for every address of the game; the build always lists it.
if (!files.has(INDEX_PATH)) throw new Error(`${INDEX_PATH} is not in the build's list`);
