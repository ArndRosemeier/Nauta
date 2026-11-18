/**
 * The page's side of the service worker (plan N7.6, `sw.ts`, rules in `plan.ts`). It registers the worker once the
 * game has started (never while the title is still loading what it needs: the worker's own fetches would compete
 * with it), asks it to keep the files fetched late a batch at a time while the game is played, and knows when a
 * newer version of the game is installed and waiting. That version takes over only when the page restarts, so a
 * match is never pulled out from under a captain: at once while the title still waits for its tap, otherwise when
 * the main screen offers it (`Offline.restart`). The deploy's build registers; any other asks with `?sw`, and
 * `?nosw` removes the worker and what it kept.
 */
import { CACHE_PREFIX, WORKER_PATH, offlineMode, type Kept, type ToWorker } from './plan';

declare global {
  interface Window {
    /** The page's offline state (the checks read it). */
    __nautaOffline?: Offline;
  }
}

/** Where the worker's file is, and the folder it answers for: the game's own. */
const WORKER_URL = `${import.meta.env.BASE_URL}${WORKER_PATH}`;
const SCOPE = import.meta.env.BASE_URL;
/** The pause between two batches of the fill, ms: the game being played comes first. */
const FILL_PAUSE_MS = 1500;
/** Batches in a row that kept nothing new (no network, a file the server lacks) before the fill rests until the page is back online or visible. */
const FILL_STALLED = 3;
/** How long a worker waits for an answer to a batch before the page asks again, ms. */
const ANSWER_MS = 90_000;
/** How often a page left open asks the server for a newer worker, ms; and the shortest time away that makes coming back ask at once. */
const RECHECK_MS = 3_600_000;
const RECHECK_AWAY_MS = 600_000;
/** Where the page notes when it last restarted for an update, and how long after that it will not do so unasked (a loop guard), ms. */
const RESTARTED_KEY = 'nauta.restartedAt';
const RESTART_GUARD_MS = 60_000;

export class Offline {
  /** What the worker keeps, as it last said; null before it has said. */
  kept: Kept | null = null;
  /** A newer version is installed and waits for the page to restart. */
  updateReady = false;
  /** Whether the worker is registered and answering (false: unsupported, off, or it failed). */
  running = false;
  private readonly watchers: Array<() => void> = [];
  private registration: ServiceWorkerRegistration | null = null;
  private restarting = false;
  private answer: (() => void) | null = null;

  /** `idle`: whether the page may restart at once for an update (the title still waits for its tap). */
  constructor(private readonly release: boolean, private readonly idle: () => boolean) {
    window.__nautaOffline = this;
  }

  /** Calls `callback` whenever what the page knows changes. */
  whenChanged(callback: () => void): void {
    this.watchers.push(callback);
  }

  private changed(): void {
    for (const w of this.watchers) w();
  }

  /** The HUD's line: what is kept, and that an update waits. */
  line(formatBytes: (n: number) => string): string {
    const k = this.kept;
    if (!this.running) return 'offline: off';
    const kept = k ? `${k.files}/${k.total} files, ${formatBytes(k.bytes)} of ${formatBytes(k.totalBytes)} kept (${k.version})` : 'starting';
    return `offline: ${kept}${this.updateReady ? ' · update ready' : ''}`;
  }

  /** Starts it: registers the worker, begins the fill, watches for a newer version. Failures are only logged: the game plays without it. */
  async start(): Promise<void> {
    if (!('serviceWorker' in navigator)) return;
    const mode = offlineMode(location.search, this.release);
    try {
      if (mode === 'clear') await clearAll();
      else if (mode === 'on') await this.register();
    } catch (err) {
      console.warn('offline:', err);
    }
  }

  private async register(): Promise<void> {
    const container = navigator.serviceWorker;
    container.addEventListener('message', (e: MessageEvent<Kept>) => {
      if (e.data?.kind !== 'kept') return;
      this.kept = e.data;
      this.answer?.();
      this.changed();
    });
    // A newer worker took over (the page asked it to): the page restarts on it.
    container.addEventListener('controllerchange', () => { if (this.restarting) location.reload(); });
    const registration = await container.register(WORKER_URL, { scope: SCOPE, updateViaCache: 'none' });
    this.registration = registration;
    this.running = true;
    this.watchUpdates(registration);
    this.changed();
    void navigator.storage?.persist?.().catch(() => undefined);
    await container.ready;
    await this.keepFilling();
  }

  /** Notes an installed worker that waits, now and as one arrives. */
  private watchUpdates(registration: ServiceWorkerRegistration): void {
    const check = () => {
      // Without a controller this is the first install, not an update.
      if (!registration.waiting || !navigator.serviceWorker.controller || this.updateReady) return;
      this.updateReady = true;
      this.changed();
      if (this.idle() && !this.justRestarted()) this.restart();
    };
    registration.addEventListener('updatefound', () => {
      registration.installing?.addEventListener('statechange', check);
    });
    check();
    let left = 0;
    const recheck = () => { void registration.update().catch(() => undefined); };
    setInterval(recheck, RECHECK_MS);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) left = performance.now();
      else if (left && performance.now() - left > RECHECK_AWAY_MS) recheck();
    });
  }

  private justRestarted(): boolean {
    try { return Date.now() - Number(sessionStorage.getItem(RESTARTED_KEY)) < RESTART_GUARD_MS; } catch { return false; }
  }

  /** Restarts the page on the newer version, which the worker waits to take over with. */
  restart(): void {
    const waiting = this.registration?.waiting;
    if (!waiting) return;
    try { sessionStorage.setItem(RESTARTED_KEY, String(Date.now())); } catch { /* the guard is a courtesy */ }
    this.restarting = true;
    waiting.postMessage({ kind: 'apply' } satisfies ToWorker);
  }

  private send(message: ToWorker): void {
    this.registration?.active?.postMessage(message);
  }

  /** Has the worker keep the files fetched late, a batch at a time, until all are kept (or it has stalled). */
  private async keepFilling(): Promise<void> {
    let stalled = 0;
    while (this.kept === null || this.kept.files < this.kept.total) {
      if (this.updateReady) return; // the newer worker fills when it has taken over
      const before = this.kept?.files ?? -1;
      this.send({ kind: 'fill' });
      await new Promise<void>((done) => { this.answer = done; setTimeout(done, ANSWER_MS); });
      this.answer = null;
      stalled = (this.kept?.files ?? -1) > before ? 0 : stalled + 1;
      if (stalled >= FILL_STALLED) {
        // Rest until the device is online again; then begin afresh.
        await new Promise<void>((done) => addEventListener('online', () => done(), { once: true }));
        stalled = 0;
      }
      await new Promise<void>((done) => setTimeout(done, FILL_PAUSE_MS));
    }
  }
}

/** Removes every worker of the game and the files they kept (`?nosw`). */
async function clearAll(): Promise<void> {
  for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
  for (const name of await caches.keys()) if (name.startsWith(CACHE_PREFIX)) await caches.delete(name);
}
