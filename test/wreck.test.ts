/** Her spars going over the side, drawn (plan N6.5, render/ship/wreck.ts): what goes, how it comes to lie, what it takes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Matrix4, Vector3 } from 'three/webgpu';
import { sparParts } from '../src/sim/damage/meet.ts';
import { FALLS_AT_PART } from '../src/sim/rules/damage.ts';
import { hullHalfBreadth, sheer } from '../src/sim/ship/hull.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { shipPoint } from '../src/render/ship/swings.ts';
import { cutAtSide, driftedOff, fallShape, keptIndex, takeFallen, wreckMatrix } from '../src/render/ship/wreck.ts';
import type { Packed } from '../src/render/ship/gathered.ts';

const RIG = rigPlan();
const breakOf = (spar: string) => sparParts().findIndex((p) => p.spar === spar) + FALLS_AT_PART;

test('a topmast broken at its cap takes the topgallant mast and their yards over her starboard side, and comes to lie in the water alongside', () => {
  const f = fallShape(RIG, breakOf('fore-topmast'), 1);
  assert.deepEqual([...f.carried].sort(), ['fore-topgallant-mast', 'fore-topgallant-yard', 'fore-topmast', 'fore-topsail-yard']);
  assert.ok(wreckMatrix(f, 0, Number.NaN).equals(new Matrix4()), 'it stands until it falls');
  const head = shipPoint(RIG.spars.find((s) => s.id === 'fore-topgallant-mast')!.head), lies = wreckMatrix(f, f.topple, Number.NaN);
  const at = head.clone().applyMatrix4(lies), along = -f.hinge.z;
  assert.ok(Math.abs(at.y) < 1, `its head lies at the water, ${at.y.toFixed(2)} m`);
  assert.ok(at.x > hullHalfBreadth(along, sheer(along)), 'outboard of her side');
  assert.ok(at.z > f.hinge.z, 'trailing aft');
  // Halfway through its time it has not yet gone half over: a falling pole gathers speed.
  const half = head.clone().applyMatrix4(wreckMatrix(f, f.topple / 2, Number.NaN));
  assert.ok(half.y > (head.y + at.y) / 2, 'it falls faster as it goes');
  // Lying alongside it rises and falls a little, no more.
  for (let s = 0; s < 10; s += 0.7) assert.ok(Math.abs(head.clone().applyMatrix4(wreckMatrix(f, f.topple + s, Number.NaN)).y - at.y) < 0.2);
  // Cut away, it drops astern and sinks, and is gone from sight before long.
  const adrift = head.clone().applyMatrix4(wreckMatrix(f, f.topple + 20, 10));
  assert.ok(adrift.z > at.z + 10 && adrift.y < at.y, 'astern and lower');
  assert.ok(!driftedOff(10) && driftedOff(60));
  // What was made fast to it is cut at her side.
  const end = new Vector3(3, 20, -10).applyMatrix4(cutAtSide(f));
  assert.ok(end.distanceTo(f.landing) < 1e-9);
});

test('a mast falling to larboard goes to larboard; one broken low takes all above it', () => {
  const f = fallShape(RIG, breakOf('main-mast'), -1);
  assert.ok(['main-topmast', 'main-topgallant-mast', 'main-yard', 'boom', 'gaff'].every((id) => f.carried.has(id)));
  assert.ok(!f.carried.has('fore-mast'));
  const head = shipPoint(RIG.spars.find((s) => s.id === 'main-mast')!.head).applyMatrix4(wreckMatrix(f, f.topple, Number.NaN));
  assert.ok(head.x < 0, 'to larboard');
});

test('her outside gives up what falls: the spars it takes, and of the broken spar only what is past the break; nothing twice', () => {
  // Three triangles: one on the topmast low (below the break near its heel), one high on it, one on the topgallant mast, one on the mainmast.
  const f = fallShape(RIG, breakOf('fore-topmast'), 1), up = f.axis;
  const near = (d: number) => f.hinge.clone().addScaledVector(up, d);
  const tri = (c: Vector3) => [c.x, c.y, c.z, c.x + 0.1, c.y, c.z, c.x, c.y, c.z + 0.1];
  const pos = new Float32Array([...tri(near(-1)), ...tri(near(3)), ...tri(near(12)), ...tri(new Vector3(0, 10, 0))]);
  const packed: Packed = {
    attributes: [{ name: 'position', size: 3, data: pos }],
    index: Uint32Array.from({ length: 12 }, (_, i) => i),
    runs: [['fore-topmast', 0, 6], ['fore-topgallant-mast', 6, 9], ['main-mast', 9, 12]],
  };
  const gone = new Uint8Array(4);
  assert.deepEqual([...takeFallen(packed, f, gone)], [3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...keptIndex(packed, gone)], [0, 1, 2, 9, 10, 11]);
  // The lower mast falling later takes what is left of the fore, never the topmast's again.
  assert.deepEqual([...takeFallen(packed, fallShape(RIG, breakOf('fore-mast'), 1), gone)], [0, 1, 2]);
});
