/**
 * Builds the ship off the page's thread at load (plan N2.4): the fittings pack fetched and her whole build made here,
 * its typed arrays handed over to the page without a copy. The page asks with its base address.
 */
import { loadFittings } from './fittings';
import { buildShip, shipBuffers } from './ship';

self.onmessage = async (e: MessageEvent<{ base: string }>) => {
  try {
    const build = buildShip(await loadFittings(e.data.base));
    (self as unknown as Worker).postMessage({ build }, shipBuffers(build));
  } catch (err) {
    (self as unknown as Worker).postMessage({ error: err instanceof Error ? err.message : String(err) });
  }
};
