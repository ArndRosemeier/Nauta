import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sincos } from '../src/sim/trig.ts';

test('sincos agrees with Math.sin and Math.cos to 1e-8 over the angles the game meets', () => {
  const out: [number, number] = [0, 0];
  for (let i = -20000; i <= 20000; i++) {
    const t = i * 0.0731 + (i % 7) * 1e-3 + (i * i) % 13 * 1.3;
    sincos(t, out);
    assert.ok(Math.abs(out[0] - Math.sin(t)) < 1e-8 && Math.abs(out[1] - Math.cos(t)) < 1e-8, `at ${t}`);
  }
  for (const t of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, 1e5 + 0.3, -7e5]) {
    sincos(t, out);
    assert.ok(Math.abs(out[0] - Math.sin(t)) < 1e-8 && Math.abs(out[1] - Math.cos(t)) < 1e-8, `at ${t}`);
  }
});
