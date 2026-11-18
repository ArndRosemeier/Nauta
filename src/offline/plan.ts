/**
 * What the game keeps on the device so it starts without a network (plan N7.6, Arnd 2026-11-18: "make the game work
 * offline on iPad"). Pure: the build's list of files, which of them the service worker must hold before it takes
 * over, in which order the rest is fetched, and what the page and the worker say to each other. The worker is
 * `sw.ts`, the page's side `register.ts`, the list is made when the game is built (`tools/offline/precache.ts`).
 *
 * One cache holds every file by its path *and content*: a file's key is its address with its `rev` (a hash of its
 * bytes), so a new build keeps every file that did not change and fetches only the ones that did. An update of a
 * few hundred kilobytes costs a few hundred kilobytes, not the 90 MB of the crew's pack and the sounds again.
 */

/** The one cache. Raise its number when the way things are kept changes: older caches are deleted. */
export const CACHE_NAME = 'nauta-files-1';
/** The prefix of every cache this game made, so a change of the number above removes the old ones. */
export const CACHE_PREFIX = 'nauta-files-';
/** The page, as the build lists it: every address in the game's scope (`?sail&walk`, `?title`) is answered with it. */
export const INDEX_PATH = 'index.html';
/** The worker's own file: never in its own list. */
export const WORKER_PATH = 'sw.js';
/** A source map: made by the build, read only with the developer tools open, so never kept. */
const MAP_ENDING = '.map';
/** Folders of files the game fetches when it needs them, after it has started (the sounds, the ship's fittings, the crew's pack). */
export const LATE_FOLDERS: readonly string[] = ['sound/', 'ship/', 'packs/'];
/** The folder of files that carry a hash in their name: they never change under it, so the browser's own cache may answer for them. */
const NAMED_BY_HASH = 'assets/';
/** How many hex digits of a file's hash make its `rev`. */
export const REV_DIGITS = 16;
/** The hash a `rev` is made with (Web Crypto's name; the build's is `sha1`). */
export const REV_ALGORITHM = 'SHA-1';
/** The base of a digest's digits. */
const HEX = 16;

/** One file of the build. */
export interface Precached {
  /** Its path from the game's folder (`assets/index-DG0zE2X9.js`). */
  readonly path: string;
  /** The hash of its bytes (`revOf`). */
  readonly rev: string;
  readonly bytes: number;
}

/** What the page sends the worker. */
export type ToWorker =
  /** Fetch some more of the files that are missing (a few at a time, so a worker the browser stops goes on where it was). */
  | { readonly kind: 'fill' }
  /** Take over from the version that runs now (this worker is waiting). */
  | { readonly kind: 'apply' }
  /** How much is kept? */
  | { readonly kind: 'status' };

/** What the worker tells the page, to every page it controls. */
export interface Kept {
  readonly kind: 'kept';
  /** The build this worker came with (`0.071`). */
  readonly version: string;
  /** Files of the build kept, and all of them. */
  readonly files: number;
  readonly total: number;
  /** Bytes of the files kept, and of all of them. */
  readonly bytes: number;
  readonly totalBytes: number;
}

/** What the page does about the worker. */
export type OfflineMode =
  /** Registers it and keeps the game for use without a network. */
  | 'on'
  /** Leaves it alone: a build made on a desk or for a check, where the old files kept would hide the new ones. */
  | 'off'
  /** Removes the worker and everything it kept (`?nosw`): the way out if a device holds on to something wrong. */
  | 'clear';

/** What to do for a page at `search`: the deploy's build uses the worker, any other asks for it with `?sw`. */
export function offlineMode(search: string, release: boolean): OfflineMode {
  const query = new URLSearchParams(search);
  if (query.has('nosw')) return 'clear';
  return release || query.has('sw') ? 'on' : 'off';
}

/** A file's `rev` from the digest of its bytes. */
export function revOf(digest: Uint8Array): string {
  let hex = '';
  for (const byte of digest) hex += byte.toString(HEX).padStart(2, '0');
  return hex.slice(0, REV_DIGITS);
}

/** Whether the worker keeps this file of the build at all. */
export function isKept(path: string): boolean {
  return !path.endsWith(MAP_ENDING) && path !== WORKER_PATH && !path.split('/').some((part) => part.startsWith('.'));
}

/** Whether the worker must hold this file before it takes over: the page, its scripts and style, the fonts and icons; not what is fetched late. */
export function isCore(path: string): boolean {
  return !LATE_FOLDERS.some((folder) => path.startsWith(folder));
}

/** Whether the file's name changes with its content, so the browser's own cache cannot hold an old one under it. */
export function namedByHash(path: string): boolean {
  return path.startsWith(NAMED_BY_HASH);
}

/** The address a file is kept under in the cache: its place in the game's folder `scope` and its `rev`. */
export function keyOf(scope: string, file: Precached): string {
  return `${new URL(file.path, scope).href}?rev=${file.rev}`;
}

/** The file of the build an address asks for, or null (another site, a tool's address, a file the build does not have). A query changes nothing: `?sail` is the page. */
export function fileAsked(files: ReadonlyMap<string, Precached>, scope: string, address: string, navigating: boolean): Precached | null {
  const url = new URL(address), base = new URL(scope);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return null;
  const path = decodeURIComponent(url.pathname.slice(base.pathname.length));
  if (navigating && (path === '' || path === INDEX_PATH)) return files.get(INDEX_PATH) ?? null;
  return files.get(path) ?? null;
}

/**
 * The next few files to fetch of those the worker has not got: any core file first, then the late ones in the order of
 * `LATE_FOLDERS` (the sounds, which a match plays from its first second, before the crew's pack), up to `maxFiles` and `maxBytes` (one file
 * more may pass `maxBytes`, so a file larger than the batch still goes).
 */
export function nextFill(files: readonly Precached[], kept: ReadonlySet<string>, scope: string, maxFiles: number, maxBytes: number): Precached[] {
  const order = (f: Precached) => LATE_FOLDERS.findIndex((folder) => f.path.startsWith(folder)); // -1: the core, first
  const missing = files.filter((f) => !kept.has(keyOf(scope, f))).sort((a, b) => order(a) - order(b) || (a.path < b.path ? -1 : 1));
  const batch: Precached[] = [];
  let bytes = 0;
  for (const f of missing) {
    if (batch.length >= maxFiles || bytes >= maxBytes) break;
    batch.push(f);
    bytes += f.bytes;
  }
  return batch;
}

/** The kept addresses that belong to no file of this build (an older build's changed or dropped files). */
export function staleKeys(kept: Iterable<string>, files: readonly Precached[], scope: string): string[] {
  const wanted = new Set(files.map((f) => keyOf(scope, f)));
  return [...kept].filter((key) => !wanted.has(key));
}

/** How much of the build is kept, as the worker reports it. */
export function howMuchKept(version: string, files: readonly Precached[], kept: ReadonlySet<string>, scope: string): Kept {
  let have = 0, bytes = 0, totalBytes = 0;
  for (const f of files) {
    totalBytes += f.bytes;
    if (kept.has(keyOf(scope, f))) { have++; bytes += f.bytes; }
  }
  return { kind: 'kept', version, files: have, total: files.length, bytes, totalBytes };
}
