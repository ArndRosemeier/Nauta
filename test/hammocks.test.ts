import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HammocksStowed } from '../src/app/hammocks';

test('hammocks: found as she is, then stowed and taken down over time, never past full or empty', () => {
  const h = new HammocksStowed();
  assert.equal(h.after(false, 0.02), 0);
  const half = h.after(true, 22.5);
  assert.ok(half > 0.4 && half < 0.6, `half way after half the time: ${half}`);
  assert.equal(h.after(true, 100), 1);
  assert.equal(h.after(false, 1000), 0);
  assert.equal(new HammocksStowed().after(true, 0.02), 1);
});
