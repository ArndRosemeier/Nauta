/** The ship built in a worker at load (shipWorker.ts, plan N2.4); the page waits for it behind the loading screen. */
import type { ShipBuild } from './ship';

export function loadShip(base: string): Promise<ShipBuild> {
  const worker = new Worker(new URL('./shipWorker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<{ build?: ShipBuild; error?: string }>) => {
      worker.terminate();
      if (e.data.build) resolve(e.data.build);
      else reject(new Error(`the ship could not be built (${e.data.error ?? 'no answer'})`));
    };
    worker.onerror = (e) => { worker.terminate(); reject(new Error(`the ship could not be built (${e.message})`)); };
    worker.postMessage({ base });
  });
}
