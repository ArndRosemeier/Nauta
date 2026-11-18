import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BODY_STATIONS, HALF_BREADTH_PLAN, MIDSHIP_SECTION, PROFILE } from '../src/sim/rules/ships.ts';
import {
  designWaterline, displacedVolume, HULL_AFT, HULL_FORE, hullBottom, hullEnds, hullHalfBreadth, hullMesh, sheer, sideTop,
} from '../src/sim/ship/hull.ts';
import { halfBreadth } from '../src/sim/ship/section.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { displacementTonnes, shipWeight } from '../src/sim/ship/weight.ts';
import { monotoneCurve } from '../src/sim/curve.ts';

/** How close the fair surface must come to the half-breadth plan's lines, m: two readings' worth amidships, more at the bow's last metres. */
const ON_THE_LINES = 0.08;
const AT_THE_STEM = 0.25;
/** A reading's error off the draught, m. */
const READING = 0.04;
/** Where the stern's last metre ends, m forward of the mainmast. */
const STERN_ENDS = -9.5;
/** Where the bow's last metres begin, m forward of the mainmast (forward of the last body-plan station read off the sheet). */
const BOW_ENDS = 17.5;

test('a monotone curve passes through its readings and never overshoots between them', () => {
  const xs = [0, 1, 2, 3, 4], ys = [0, 1, 1, 3, 2.5], c = monotoneCurve(xs, ys);
  xs.forEach((x, i) => assert.ok(Math.abs(c(x) - ys[i]!) < 1e-12));
  for (let x = 0; x <= 4; x += 0.01) {
    const i = Math.min(3, Math.floor(x));
    assert.ok(c(x) >= Math.min(ys[i]!, ys[i + 1]!) - 1e-12 && c(x) <= Math.max(ys[i]!, ys[i + 1]!) + 1e-12, `at ${x}`);
  }
});

test('the dead flat of the whole hull is the midship section taken off the draught for the slice', () => {
  const flat = BODY_STATIONS.find((s) => s.offsets === MIDSHIP_SECTION)!;
  for (const [h] of MIDSHIP_SECTION) {
    if (h <= flat.rising || h > sideTop(flat.along)) continue;
    assert.ok(Math.abs(hullHalfBreadth(flat.along, h) - halfBreadth(h)) < 0.02, `at ${h} m`);
  }
});

test('the fair surface runs through the half-breadth plan: the load waterline and the top breadth, stern to stem', () => {
  for (const [along, waterline, top] of HALF_BREADTH_PLAN) {
    const near = along > BOW_ENDS || along < STERN_ENDS ? AT_THE_STEM : ON_THE_LINES;
    assert.ok(Math.abs(hullHalfBreadth(along, designWaterline(along)) - waterline) < near, `waterline at ${along} m`);
    assert.ok(Math.abs(hullHalfBreadth(along, sheer(along)) - top) < near, `top breadth at ${along} m`);
  }
});

test('her hull is fair: no hollow or bump along her at any height, and it ends at the stem, the sternpost and the transom', () => {
  for (let h = 1; h < 6; h += 0.5) {
    const { aft, fore } = hullEnds(h);
    // Widest once, near the dead flat: once she has narrowed from her widest by more than a reading's error, she
    // never widens again by more than that (the twin flats differ by a centimetre).
    let widest = 0, past = false, narrowest = Infinity;
    for (let a = aft + 0.05; a < fore - 0.05; a += 0.1) {
      const b = hullHalfBreadth(a, h);
      assert.ok(b > 0, `${h} m at ${a.toFixed(1)}`);
      widest = Math.max(widest, b);
      if (!past && b < widest - READING) past = true;
      if (past) {
        narrowest = Math.min(narrowest, b);
        assert.ok(b < narrowest + READING, `she widens again at ${a.toFixed(1)} m, ${h} m up`);
      }
    }
    assert.equal(hullHalfBreadth(fore + 0.1, h), 0);
    assert.equal(hullHalfBreadth(aft - 0.1, h), 0);
  }
});

test('her hull is closed, its faces turn outward, and it is the same on both sides', () => {
  const m = hullMesh(240, 48), p = m.points, t = m.triangles;
  // Every edge is shared by exactly two faces, running opposite ways.
  const edges = new Map<string, number>();
  for (let k = 0; k < t.length; k += 3) {
    for (let e = 0; e < 3; e++) {
      const a = t[k + e]!, b = t[k + ((e + 1) % 3)]!, key = `${a},${b}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
  }
  for (const [key, n] of edges) {
    const [a, b] = key.split(',');
    assert.equal(n, 1, `edge ${key} used ${n} times one way`);
    assert.equal(edges.get(`${b},${a}`), 1, `edge ${key} has no twin`);
  }
  // Its volume by the divergence theorem is positive (outward faces) and matches the hull integrated by sections.
  let volume = 0;
  for (let k = 0; k < t.length; k += 3) {
    const a = t[k]! * 3, b = t[k + 1]! * 3, c = t[k + 2]! * 3;
    volume += (p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!)) / 6;
  }
  const top = Math.max(...PROFILE.map((r) => r[4]));
  const integrated = displacedVolume((a) => Math.min(top, sideTop(a)));
  // The integration adds her planking and keel outside the moulded line.
  assert.ok(volume > 0 && volume < integrated && volume > integrated * 0.9, `mesh ${volume.toFixed(1)} m³, sections ${integrated.toFixed(1)} m³`);
  // Mirror: every starboard point has its port twin.
  for (let k = 0; k < p.length; k += 3) {
    if (p[k]! >= 0) continue;
    assert.ok(Math.abs(hullHalfBreadth(p[k + 2]!, p[k + 1]!) + p[k]!) < 1e-9);
  }
  // Both ends close: the last sections have next to no area left.
  for (const a of [HULL_AFT, HULL_FORE]) assert.ok(sideTop(a) - hullBottom(a) < 0.5 || hullHalfBreadth(a, sideTop(a)) < 3, `${a}`);
});

test('she displaces her weight fitted for sea within 3 % at the draught\'s load waterline', () => {
  const displacement = displacementTonnes(displacedVolume());
  const weight = shipWeight(shipPlan());
  assert.ok(Math.abs(weight.tonnes - displacement) / displacement < 0.03, `weight ${weight.tonnes.toFixed(1)} t, displacement ${displacement.toFixed(1)} t`);
  // A brig of her size displaced 400 to 500 tons; her weight's centre lies near her waterline.
  assert.ok(displacement > 400 && displacement < 500);
  assert.ok(weight.centre > 3 && weight.centre < designWaterline(0) + 0.5, `centre ${weight.centre.toFixed(2)} m`);
});
