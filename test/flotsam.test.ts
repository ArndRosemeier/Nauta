/** What floats after a ship goes down (plan N6.5, render/flotsam.ts): it comes up where she sank, floats and drifts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { startSea, surfaceAt } from '../src/sim/sea/sea.ts';
import { startMotion } from '../src/sim/ship/motion.ts';
import { FlotsamView, goneDown } from '../src/render/flotsam.ts';

const sea = startSea(7, { speed: 8, toward: 0 }, 0);
const afloat = startMotion(0, 0, 0).pose;
const sunk = { ...afloat, heave: afloat.heave - 8 };

test('afloat, nothing; gone down, her wreckage comes up where she sank, floats on the sea and drifts down the wind', () => {
  assert.equal(goneDown(afloat, sea, 0), false);
  assert.equal(goneDown(sunk, sea, 0), true);
  const view = new FlotsamView(2), origin = new Vector3(0, 0, 0);
  view.show(0, afloat, sea, 10, origin);
  assert.equal(view.mesh.visible, false);
  view.show(0, sunk, sea, 20, origin);
  assert.equal(view.mesh.visible, true);
  const pos = view.mesh.geometry.getAttribute('position').array as Float32Array;
  const shown = () => { const out: number[][] = []; for (let i = 0; i < pos.length; i += 3) if (pos[i + 1]! > -100) out.push([pos[i]!, pos[i + 1]!, pos[i + 2]!]); return out; };
  const early = shown().length;
  view.show(0, sunk, sea, 60, origin);
  const later = shown();
  assert.ok(later.length > early, 'more comes up as time goes');
  // All of it near where she went down, at the sea's surface.
  for (const [x, y, z] of later) {
    assert.ok(Math.hypot(x!, z!) < 20, 'where she sank');
    assert.ok(Math.abs(y! - surfaceAt(sea, x!, z!, 60).height) < 1, 'on the surface');
  }
  // A long while after, down the wind (toward +x).
  view.show(0, sunk, sea, 600, origin);
  const mean = shown().reduce((a, p) => a + p[0]!, 0) / shown().length;
  assert.ok(mean > 3, `drifted ${mean.toFixed(1)} m down the wind`);
});
