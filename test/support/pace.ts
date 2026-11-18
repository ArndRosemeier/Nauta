/**
 * Timing tests without bare milliseconds (docs/CHECKS.md, "Timing tests"). A CI runner is slower than the tablet
 * and shares its cores with the other test files, so "under 1 ms" fails there by chance. Instead a test compares
 * its work with a reference loop of plain sines and cosines measured in the same rounds on the same machine:
 * `pace(work, pairs)` is the work's time as a share of `pairs` bare sine and cosine pairs. The quietest of many
 * rounds counts for both, and the rounds are interleaved so a busy moment hits both alike.
 */
const WARM_ROUNDS = 20;
const ROUNDS = 60;

let sink = 0;

function trig(pairs: number): void {
  for (let i = 0; i < pairs; i++) {
    const p = i * 0.731 + 0.2;
    sink += Math.sin(p) + Math.cos(p);
  }
}

function time(work: () => void): number {
  const t0 = performance.now();
  work();
  return performance.now() - t0;
}

/** The time of `work` divided by the time of `pairs` bare sine and cosine pairs, each the best of many rounds. */
export function pace(work: () => void, pairs: number): number {
  const reference = () => trig(pairs);
  for (let i = 0; i < WARM_ROUNDS; i++) { reference(); work(); }
  let bestReference = Infinity, bestWork = Infinity;
  for (let i = 0; i < ROUNDS; i++) {
    bestReference = Math.min(bestReference, time(reference));
    bestWork = Math.min(bestWork, time(work));
  }
  if (!Number.isFinite(sink)) throw new Error('the reference loop lost its sum');
  return bestWork / bestReference;
}
