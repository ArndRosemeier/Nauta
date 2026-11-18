/** Damage built for tests: holes in her planking at a depth under her waterline. */
import { holeCode } from '../../src/sim/damage.ts';
import { plankingPlace } from '../../src/sim/damage/meet.ts';
import { designWaterline } from '../../src/sim/ship/hull.ts';
import { shipPlan } from '../../src/sim/ship/plan.ts';

/** A planking cell of her side (`side`) amidships with a spot `depth` m under her load waterline: the cell and the spot's girth. */
export function spotUnder(side: 1 | -1, depth: number): { cell: number; u: number; v: number } {
  for (const c of shipPlan().cells) {
    if (c.kind !== 'planking' || c.side !== side || c.aft > 0 || c.fore < 0) continue;
    for (let v = 0; v < c.to - c.from; v += 0.04) {
      const p = plankingPlace(c, 0.5, v);
      if (Math.abs(p[2] - (designWaterline(p[0]) - depth)) < 0.03) return { cell: c.id, u: 0.5, v };
    }
  }
  throw new Error('no such spot');
}

/** `n` carronade holes a hand apart in her starboard planking amidships, `depth` m under her load waterline. */
export function holesUnder(depth: number, n: number): number[] {
  const s = spotUnder(1, depth);
  return Array.from({ length: n }, (_, k) => holeCode(s.cell, 0.2 + 0.2 * k, s.v, 'round', 'carronade', false));
}
