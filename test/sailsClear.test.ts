import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Quaternion, Vector3 } from 'three/webgpu';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { mastSolids, type MastSolid } from '../src/sim/ship/mastSolids.ts';
import type { SailStanding } from '../src/sim/ship/sailing.ts';
import { HANGING } from '../src/sim/rules/rig.ts';
import { swingMatrix, swingsOf } from '../src/render/ship/swings.ts';
import { ROW, ROW_FLOATS, clothAt, sailForms } from '../src/render/ship/sailForm.ts';
import { CLEAR_MARGIN } from '../src/render/ship/sailClear.ts';
import { SailsView } from '../src/render/ship/sailsView.ts';

const RIG = rigPlan(shipPlan()), SWINGS = swingsOf(RIG), FORMS = sailForms(RIG);
/** The timber each square sail hangs before and the boom sail abaft (the masts' own solids, as the drawing's table is made from). */
const TIMBER = FORMS.map((f) => (f.sail.kind === 'square' || f.sail.kind === 'boom' ? mastSolids(RIG.masts[f.sail.mast as 'fore' | 'main']) : []));
/** A moment, s, and the cloth's points tried across and down each sail. */
const T = 3.7;
const GRID = 14;
/** How far into a piece of timber cloth may lie and still count as clear (rounding), m. */
const TOLERANCE = 1e-3;
/** The share a sail is let fall to (hanging, sheeted home), the braces, winds and reefs tried (the brace is the yard's whole turn either way). */
const SHARES = [0, HANGING, (HANGING + 1) / 2, 1];
const BRACES = [-1, 0, 1];
const WINDS = [
  { pressure: 0, aback: false, shivering: false }, { pressure: 0.05, aback: false, shivering: false }, { pressure: 0.09, aback: false, shivering: false },
  { pressure: 0.05, aback: true, shivering: false }, { pressure: 0.09, aback: true, shivering: false }, { pressure: 0.01, aback: false, shivering: true },
];

/** The depth of `p` past the face of `q` that a sail keeps to (a square sail's forward face, the boom sail's after face) and past its far face, m (positive: in front of the face is negative). */
const past = (p: Vector3, q: MastSolid, square: boolean): { face: number; far: number } => {
  const front = p.z - (q.front.a + q.front.k * p.y), back = q.back.a + q.back.k * p.y - p.z;
  return square ? { face: front, far: back } : { face: back, far: front };
};
const within = (p: Vector3, q: MastSolid): boolean => p.y >= q.y0 && p.y <= q.y1 && Math.abs(p.x) <= q.half;

/**
 * Every sail's cloth as it is drawn at each share, brace, wind and reef (the sail view as the ship drives it, yards
 * hoisted as the sails are): calls `each(sail index, point held clear, the same point not held)` over a grid of points.
 */
function sample(each: (index: number, held: Vector3, free: Vector3) => void): void {
  const held = new Vector3(), free = new Vector3(), view = new SailsView(RIG);
  for (const share of SHARES) for (const brace of BRACES) for (const wind of WINDS) for (const reefs of [0, 1]) {
    view.stand(FORMS.map((f) => ({ id: f.sail.id, area: share, angle: brace * (f.kind === 0 ? 0.7 : 0.4), ...wind }) as SailStanding), FORMS.map((f) => ({ set: share > 0, reefs: Math.min(reefs, f.sail.reefs), share })));
    view.follow(1000);
    const hoists = new Map(view.hoists());
    view.write((id) => { const w = SWINGS.find((s) => s.id === id); return w ? swingMatrix(w, brace * w.limit, hoists.get(id) ?? 1) : null; }, new Quaternion(), T, () => {});
    for (const f of FORMS) {
      // The sail's row as drawn, and the same row without its clearance table.
      const row = view.rows.subarray(f.index * ROW_FLOATS, (f.index + 1) * ROW_FLOATS), bare = row.slice();
      bare.fill(0, ROW.clear);
      for (let i = 0; i <= GRID; i++) for (let j = 0; j <= GRID; j++) {
        clothAt(row, i / GRID, j / GRID, T, held);
        clothAt(bare, i / GRID, j / GRID, T, free);
        each(f.index, held, free);
      }
    }
  }
}

test('no sail goes through a mast, its top, cap, crosstrees or topmasts, at every brace, wind, reef and share; and cloth well clear of them is left alone', () => {
  let points = 0, without = 0, moved = 0, worst = 0, worstAt = '';
  sample((index, held, free) => {
    points++;
    const square = FORMS[index]!.sail.kind === 'square', id = FORMS[index]!.sail.id;
    assert.ok(held.x === free.x && held.y === free.y, 'only z moves');
    const dz = held.z - free.z;
    assert.ok(square ? dz <= 0 : dz >= 0, `${id} moved the wrong way by ${dz} m`);
    if (dz !== 0) moved++;
    let clear = true;
    for (const q of TIMBER[index]!) {
      const was = past(free, q, square), now = past(held, q, square);
      // Cloth that came out in front of, or in, a piece must leave it in front (cloth already behind it, a yardarm braced round it, is another matter).
      if (within(free, q) && was.far > 0 && was.face > TOLERANCE) without++;
      if (within(held, q) && was.far > 0 && now.face > worst) { worst = now.face; worstAt = `${id} ${q.name}`; }
      if (!(was.face < -CLEAR_MARGIN)) clear = false;
    }
    if (clear) assert.equal(dz, 0, `${id} hangs clear of every piece and was moved`);
  });
  assert.ok(points > 1e5, `${points} points tried`);
  assert.ok(worst <= TOLERANCE, `${worstAt}: cloth lies ${worst.toFixed(3)} m into the timber`);
  // The check can fail: without the clearance the same cloth does go through.
  assert.ok(without > 100 && moved > 100, `unheld, ${without} points lie in the timber (the check bites), ${moved} moved`);
});
