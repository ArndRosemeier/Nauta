import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import type { SailStanding } from '../src/sim/ship/sailing.ts';
import { MOST_FRAMES, swingMatrix, swingsOf } from '../src/render/ship/swings.ts';
import { ROW_FLOATS, bilerp, clothAt, sailForms, sailPoints, shiftFrame } from '../src/render/ship/sailForm.ts';
import { FLAGS, SAIL_ATLAS_SIZE, SAIL_DETAIL, buildSailGrids, sailAtlas } from '../src/render/ship/sailGrid.ts';
import { SailsView } from '../src/render/ship/sailsView.ts';
import { shipPoint } from '../src/render/ship/swings.ts';

const RIG = rigPlan(shipPlan()), SWINGS = swingsOf(RIG), FORMS = sailForms(RIG);
/** Close enough to be the same place, m. */
const SAME = 0.01;
/** A moment, s. */
const T = 3.7;
/** A long time for the crew, s: every change done. */
const LONG = 120;
const STEP = 0.1;

/** A sail view with every sail set as `set` (a square sail drawing, the others to starboard), stepped until it is so. */
function viewWith(set: boolean, extra: Partial<SailStanding> = {}): SailsView {
  const v = new SailsView(RIG);
  v.stand(FORMS.map((f) => ({ id: f.sail.id, area: set ? 1 : 0, angle: 0.3, pressure: 0.05, aback: false, shivering: false, ...extra })), FORMS.map(() => ({ set, reefs: 0 })));
  v.follow(STEP);
  return v;
}
const swingAt = (angle: number) => (id: string) => { const w = SWINGS.find((s) => s.id === id); return w ? swingMatrix(w, angle, 1) : null; };
const rowOf = (v: SailsView, i: number) => v.rows.subarray(i * ROW_FLOATS, (i + 1) * ROW_FLOATS);
const write = (v: SailsView, angle = 0) => v.write(swingAt(angle), new Quaternion(), T, () => {});

test('every line made fast to a sail ends on one of its points, each with a moving frame the rope kind can hold', () => {
  const points = sailPoints(RIG, FORMS, SWINGS.length + 1);
  assert.ok(SWINGS.length + 1 + points.length <= MOST_FRAMES, `${points.length} sail points`);
  for (const line of RIG.lines) {
    for (const e of line.ends) {
      if (e.on !== 'sail') continue;
      assert.ok(points.some((p) => p.rest.distanceTo(shipPoint(e)) < SAME), `${line.id} ends on a sail point`);
    }
  }
});

test('a set sail has its corners where the spars carry them, and bellies along its belly by its depth, deepest inside', () => {
  const v = viewWith(true);
  write(v);
  for (const f of FORMS) {
    const row = rowOf(v, f.index), corners = [[0, 0], [1, 0], [0, 1], [1, 1]] as const;
    // Unbraced, its corners are its rest corners (a headsail's clew swung to its sheet).
    corners.forEach(([u, w], i) => { if (f.kind === 0 || f.sail.kind === 'boom' || i !== 1) assert.ok(clothAt(row, u, w, T).distanceTo(f.rest[i]!) < SAME, `${f.sail.id} corner ${i}`); });
    const flat = bilerp([0, 4, 8, 12].map((k) => new Vector3(row[k]!, row[k + 1]!, row[k + 2]!)), 1 / 2, 1 / 2, new Vector3());
    const mid = clothAt(row, 1 / 2, 1 / 2, T), belly = new Vector3(row[16]!, row[17]!, row[18]!);
    const off = mid.clone().sub(flat).dot(belly);
    assert.ok(off > 0.3 * row[7]! && off < 1.6 * row[7]!, `${f.sail.id} bellies ${off.toFixed(2)} m of ${row[7]!.toFixed(2)}`);
  }
  // A square sail bellies forward (-z), filled from aft; aback it bellies aft.
  const course = rowOf(v, 0);
  assert.ok(clothAt(course, 1 / 2, 1 / 2, T).z < bilerp(FORMS[0]!.rest, 1 / 2, 1 / 2, new Vector3()).z - 0.5);
  const back = viewWith(true, { aback: true });
  write(back);
  assert.ok(clothAt(rowOf(back, 0), 1 / 2, 1 / 2, T).z > bilerp(FORMS[0]!.rest, 1 / 2, 1 / 2, new Vector3()).z);
});

test('furled, a square sail lies rolled on its yard, a headsail down its stay, the boom sail brailed to the mast', () => {
  const v = viewWith(false);
  write(v);
  for (const f of FORMS) {
    const row = rowOf(v, f.index);
    for (const [u, w] of [[0.1, 0.9], [1 / 2, 1], [0.9, 0.3]] as const) {
      const p = clothAt(row, u, w, T);
      if (f.kind === 0) {
        const head = bilerp(f.rest, u, 0, new Vector3());
        assert.ok(p.distanceTo(head) < 1, `${f.sail.id} at ${u},${w} lies on its yard`);
      } else if (f.sail.kind === 'boom') {
        assert.ok(Math.abs(p.z - f.rest[0].z) < 0.25 * f.breadth, `${f.sail.id} brailed in`);
      } else {
        assert.ok(p.distanceTo(f.rest[0]) < 0.3 * f.height, `${f.sail.id} hauled down to its tack`);
      }
    }
  }
});

test('setting a sail is seen: the gaskets let go, then sheeted home and her topsail yards hoisted; taken in, clewed up then rolled up', () => {
  const v = viewWith(false), topsail = FORMS.find((f) => f.sail.id === 'main-topsail')!;
  assert.ok(v.hoists().every(([, h]) => h === 0), 'furled, the topsail and topgallant yards lie on their caps');
  v.stand(null, FORMS.map(() => ({ set: true, reefs: 0 })));
  const foot = () => { write(v); return clothAt(rowOf(v, topsail.index), 1 / 2, 1, T).y; };
  const furledFoot = foot();
  const seen: number[] = [];
  for (let t = 0; t < LONG; t += 1) { v.follow(1); seen.push(foot()); }
  // The foot comes down over many seconds, not at once, and ends at the sheeted clews' height.
  assert.ok(seen[2]! > seen[seen.length - 1]! + 1, 'still coming down after two seconds');
  assert.ok(Math.abs(seen[seen.length - 1]! - topsail.rest[2].y) < 0.5 && seen[seen.length - 1]! < furledFoot - 5);
  assert.ok(v.hoists().every(([, h]) => h === 1), 'set, the yards are hoisted');
  v.stand(null, FORMS.map((f) => ({ set: f.sail.id === 'main-topsail', reefs: f.sail.id === 'main-topsail' ? 2 : 0 })));
  for (let t = 0; t < LONG; t += 1) v.follow(1);
  const reefed = v.hoists().find(([id]) => id === topsail.hoisted!.yard)![1];
  assert.ok(reefed < 1 && reefed > 1 / 2, `two reefs lower the topsail yard a little (${reefed})`);
});

test('the flags stream down the true wind from their hoists, and hang when there is none', () => {
  const v = viewWith(true);
  v.blow({ x: 1, z: 0, speed: 10 });
  write(v);
  FLAGS.forEach((flag, i) => {
    const row = rowOf(v, FORMS.length + i), hoist = clothAt(row, 0, 1 / 2, T), fly = clothAt(row, 1, 1 / 2, T);
    assert.ok(fly.x - hoist.x > 0.8 * flag.fly, `${flag.id} flies downwind`);
  });
  v.blow({ x: 1, z: 0, speed: 0 });
  write(v);
  const row = rowOf(v, FORMS.length), top = clothAt(row, 0, 0, T), end = clothAt(row, 1, 0, T);
  assert.ok(top.y - end.y > 0.8 * FLAGS[0].fly, 'without wind the ensign hangs');
  // Her heel turns the wind into her frame: rolled 20° to starboard, the fly still lies level in the world.
  v.blow({ x: 1, z: 0, speed: 10 });
  const heel = new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), -0.35);
  v.write(swingAt(0), heel, T, () => {});
  const w = clothAt(rowOf(v, FORMS.length), 1, 0, T).sub(clothAt(rowOf(v, FORMS.length), 0, 0, T)).applyQuaternion(heel);
  assert.ok(Math.abs(w.y) < 0.15 * w.length());
});

test('a sail point\'s frame carries its line to where the sail draws that point, braced and clewed up alike', () => {
  const v = viewWith(true), frames = new Map<number, Matrix4>();
  v.write(swingAt(0.4), new Quaternion(), T, (i, m) => frames.set(i, m.clone()));
  for (const p of v.points) {
    const drawn = clothAt(rowOf(v, p.sail), p.u, p.v, T);
    assert.ok(p.rest.clone().applyMatrix4(frames.get(p.frame)!).distanceTo(drawn) < 1e-6);
  }
  assert.ok(shiftFrame(new Vector3(1, 2, 3), new Vector3(4, 4, 4)).elements[12] === 3);
});

test('the grids: every sail and flag at every detail, positions finite, each sail in its own place of the hole map', () => {
  for (const detail of Object.keys(SAIL_DETAIL) as (keyof typeof SAIL_DETAIL)[]) {
    const p = buildSailGrids(detail), rows = new Set<number>(), cloth = p.attributes.find((a) => a.name === 'cloth')!.data;
    for (let i = 0; i < cloth.length; i += 3) rows.add(cloth[i]!);
    assert.equal(rows.size, FORMS.length + FLAGS.length, detail);
    for (const a of p.attributes) for (const x of a.data) assert.ok(Number.isFinite(x), `${detail} ${a.name}`);
  }
  const atlas = sailAtlas(FORMS);
  atlas.forEach((a, i) => {
    assert.ok(a.x + a.width <= SAIL_ATLAS_SIZE && a.y + a.height <= SAIL_ATLAS_SIZE);
    atlas.forEach((b, j) => { if (j > i) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y, `${i} and ${j} overlap`); });
  });
});
