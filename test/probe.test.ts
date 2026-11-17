import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, formatMs, formatReport, hzFromIntervals, medianOf } from '../src/probe/report.ts';
import { probeWaves, waveHeight, WAVE_FLOATS } from '../src/probe/waves.ts';

test('the report lines up each section and ends with a newline', () => {
  const text = formatReport('head', [{ title: 'A', rows: [['x', '1'], ['longer', '2']] }]);
  assert.equal(text, 'head\n\n== A ==\nx       1\nlonger  2\n');
});

test('the median ignores a hitch, and the refresh rate comes from it', () => {
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([4, 1, 2, 3]), 2.5);
  assert.ok(Number.isNaN(medianOf([])));
  assert.equal(hzFromIntervals([16.0, 16.0, 50, 16.0]), 62.5);
});

test('sizes and times read as people read them', () => {
  assert.equal(formatBytes(512), '512 B');
  assert.equal(formatBytes(65536), '64 KiB');
  assert.equal(formatBytes(1.5 * 1024 ** 3), '1.5 GiB');
  assert.equal(formatMs(0.123456), '0.123 ms');
  assert.equal(formatMs(NaN), 'not measured');
});

test('the probe waves are a fixed table and their height is the sum the GPU checks against', () => {
  const t = probeWaves(16);
  assert.equal(t.length, 16 * WAVE_FLOATS);
  assert.deepEqual(probeWaves(16), t);
  const one = probeWaves(1);
  // One wave along x: amplitude times sine of k·x + phase + ω·t.
  const [dx, , k, amp, phase, w] = one;
  assert.ok(Math.abs(waveHeight(one, 10, 0, 2) - amp * Math.sin(k * dx * 10 + phase + w * 2)) < 1e-12);
  const hs = Array.from({ length: 200 }, (_, i) => waveHeight(t, i * 3.1, i * 1.7, 0));
  assert.ok(Math.max(...hs.map(Math.abs)) < 6, 'the heights stay within what half floats hold well');
});
