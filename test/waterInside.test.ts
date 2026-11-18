/** Water rising in her, drawn (plan N6.5, render/ship/waterInside.ts): level with the world, out to her sides. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three/webgpu';
import { lyingOf } from '../src/sim/damage/flood.ts';
import { insideBreadth } from '../src/sim/ship/plan.ts';
import { LOAD_WATERLINE } from '../src/sim/rules/ships.ts';
import { shipY } from '../src/sim/ship/section.ts';
import { WATER_VERTICES, waterSurface } from '../src/render/ship/waterInside.ts';

const grid = () => new Float32Array(WATER_VERTICES * 3);
const points = (g: Float32Array) => Array.from({ length: WATER_VERTICES }, (_, v) => [g[v * 3]!, g[v * 3 + 1]!, g[v * 3 + 2]!] as const);

test('upright, the water lies flat at the height her inside gives it, out to the inside of her sides', () => {
  const g = grid(), level = shipY(lyingOf(120).level);
  assert.equal(waterSurface(120, new Vector3(0, 1, 0), g), true);
  const wet = points(g).filter(([x]) => x !== 0);
  assert.ok(wet.length > WATER_VERTICES / 2);
  for (const [x, y, z] of wet) {
    assert.ok(Math.abs(y - level) < 1e-4, `flat, ${y} against ${level}`);
    assert.ok(Math.abs(x) <= insideBreadth(-z, y + LOAD_WATERLINE) + 1e-4, 'inside her');
  }
  // Wider amidships than at her ends.
  const widest = Math.max(...wet.map(([x]) => Math.abs(x)));
  assert.ok(widest > 2);
  assert.equal(waterSurface(0.2, new Vector3(0, 1, 0), g), false, 'a little is under her floors, not drawn');
});

test('heeled to starboard, it stays level with the world: up her starboard side, down from her larboard', () => {
  const g = grid(), heel = 0.15, up = new Vector3(-Math.sin(heel), Math.cos(heel), 0);
  waterSurface(120, up, g);
  const mid = points(g).slice(Math.floor(WATER_VERTICES / 2) - 5, Math.floor(WATER_VERTICES / 2) + 6);
  const port = mid.reduce((a, b) => (b[0] < a[0] ? b : a)), starboard = mid.reduce((a, b) => (b[0] > a[0] ? b : a));
  assert.ok(starboard[1] > port[1] + 0.3, `starboard ${starboard[1].toFixed(2)}, larboard ${port[1].toFixed(2)}`);
  // Square to the world's up all across.
  for (const p of mid) assert.ok(Math.abs(up.x * (p[0] - port[0]) + up.y * (p[1] - port[1])) < 1e-3);
});
