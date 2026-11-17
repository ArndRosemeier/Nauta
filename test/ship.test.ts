import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodePack } from '@futuremagic/props';
import {
  BERTH_HEADROOM, DECK_AT_SIDE, DECK_BEAM, DECK_CAMBER, KEEL_HALF_SIDING, LOAD_WATERLINE, MIDSHIP_SECTION, PLANKING, RAIL_TOP,
} from '../src/sim/rules/ships.ts';
import { deckY, halfBreadth, sectionOutline, shipY, shipZ } from '../src/sim/ship/section.ts';
import { followWater, restingPose, waterPlane } from '../src/sim/ship/standIn.ts';
import { startSea } from '../src/sim/sea/sea.ts';
import { beaufortSpeed } from '../src/sim/rules/beaufort.ts';
import { STANDPOINTS, standpoint } from '../src/app/standpoints.ts';
import { buildSlice, SLICE_AFT, SLICE_FORE } from '../src/render/ship/slice.ts';

/** How close a curve through the readings must come to them, m. */
const ON_READING = 1e-9;
/** A girth step for the outline, m. */
const GIRTH = 0.07;

test('the half-breadth passes through every reading taken off the draught, and between them never overshoots', () => {
  for (const [h, b] of MIDSHIP_SECTION) assert.ok(Math.abs(halfBreadth(h) - b) < ON_READING, `at ${h} m`);
  for (let i = 1; i < MIDSHIP_SECTION.length; i++) {
    const [h0, b0] = MIDSHIP_SECTION[i - 1]!, [h1, b1] = MIDSHIP_SECTION[i]!;
    for (let k = 1; k < 10; k++) {
      const b = halfBreadth(h0 + ((h1 - h0) * k) / 10);
      assert.ok(b >= Math.min(b0, b1) - ON_READING && b <= Math.max(b0, b1) + ON_READING, `between ${h0} and ${h1} m`);
    }
  }
});

test("the section's outline runs from the keel up to the height asked, evenly by girth", () => {
  const out = sectionOutline(DECK_AT_SIDE, GIRTH);
  assert.ok(Math.abs(out[0]!.x - Math.max(KEEL_HALF_SIDING, halfBreadth(MIDSHIP_SECTION[0]![0]))) < ON_READING);
  assert.ok(Math.abs(out[out.length - 1]!.y - shipY(DECK_AT_SIDE)) < 1e-6);
  for (let i = 1; i < out.length; i++) {
    const step = out[i]!.girth - out[i - 1]!.girth;
    assert.ok(Math.abs(step - GIRTH) < GIRTH / 2, `step ${step}`);
    assert.ok(out[i]!.y > out[i - 1]!.y, 'it climbs');
  }
  // Pushed out by the planking, every point lies that far outside the moulded line.
  const planked = sectionOutline(DECK_AT_SIDE, GIRTH, PLANKING.side);
  for (let i = 0; i < out.length; i++) assert.ok(Math.abs(Math.hypot(planked[i]!.x - out[i]!.x, planked[i]!.y - out[i]!.y) - PLANKING.side) < 1e-6);
});

test('ship space: the load waterline is y 0, the deck is cambered, forward is -z', () => {
  assert.equal(shipY(LOAD_WATERLINE), 0);
  assert.equal(shipZ(2), -2);
  assert.ok(Math.abs(deckY(0) - shipY(DECK_AT_SIDE + DECK_CAMBER)) < 1e-12);
  assert.ok(Math.abs(deckY(halfBreadth(DECK_AT_SIDE)) - shipY(DECK_AT_SIDE)) < 1e-12);
});

test('she eases toward the water without overshooting, the same at any frame rate', () => {
  const target = { heave: 0.4, pitch: 0.05, roll: -0.08 };
  const run = (dt: number, seconds: number) => {
    let p = restingPose(), most = 0;
    for (let t = 0; t < seconds - 1e-9; t += dt) { p = followWater(p, target, dt); most = Math.max(most, p.heave); }
    return { p, most };
  };
  const slow = run(1 / 30, 6), fast = run(1 / 120, 6);
  assert.ok(slow.most <= target.heave + 1e-9, 'no overshoot');
  assert.ok(Math.abs(slow.p.heave - target.heave) < 0.01 && Math.abs(slow.p.roll - target.roll) < 0.01);
  assert.ok(Math.abs(slow.p.heave - fast.p.heave) < 1e-9, 'frame rate does not change the path');
});

test('on a moderate sea she pitches and rolls a little, not wildly', () => {
  const sea = startSea(1805, { speed: beaufortSpeed(4), toward: 0.4 }, 0);
  for (let t = 0; t < 120; t += 7) {
    const w = waterPlane(sea, 0, 0, 0, t);
    assert.ok(Math.abs(w.pitch) < 0.1 && Math.abs(w.roll) < 0.2 && Math.abs(w.heave) < 2, `at ${t} s: ${JSON.stringify(w)}`);
  }
});

test('every standpoint stands inside the slice, and below deck between the berth deck and the beams', () => {
  const below = standpoint('below');
  const berth = deckY(0) - PLANKING.deck - DECK_BEAM.moulded - BERTH_HEADROOM;
  assert.ok(below.eye[1] > berth && below.eye[1] < deckY(0) - PLANKING.deck - DECK_BEAM.moulded);
  for (const s of STANDPOINTS) {
    if (s.name === 'Alongside') continue;
    assert.ok(s.eye[2] > shipZ(SLICE_FORE) && s.eye[2] < shipZ(SLICE_AFT), s.name);
    assert.ok(Math.abs(s.eye[0]) < halfBreadth(DECK_AT_SIDE), s.name);
  }
  assert.equal(standpoint('nonsense'), STANDPOINTS[0]);
  assert.equal(standpoint('TOP').name, 'Top');
});

test('the slice builds from the fittings pack: whole, within her budget, nothing loose', () => {
  const s = buildSlice(decodePack(new Uint8Array(readFileSync('public/ship/fittings.fmpk'))));
  const tris = s.wood.triangles + s.iron.triangles + s.copper.triangles + s.glow.triangles + s.ropes.triangles;
  // About a quarter of her length: well inside a quarter of the 1.5M both ships may have.
  assert.ok(tris > 50000 && tris < 200000, `${tris} triangles`);
  for (const g of [s.wood, s.iron, s.copper, s.glow]) {
    const p = g.pos, n = g.nor;
    for (const v of p) assert.ok(Number.isFinite(v));
    for (let i = 0; i < n.length; i += 3) assert.ok(Math.abs(Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) - 1) < 1e-3);
    for (let i = 0; i < p.length; i += 3) {
      assert.ok(p[i + 1]! >= shipY(0) - 1e-6 && p[i + 1]! < shipY(RAIL_TOP) + 20, 'between keel and masthead');
    }
  }
  assert.ok(s.berthY < 0 && s.deckY > 0, 'the berth deck lies below the waterline, the deck above');
});
