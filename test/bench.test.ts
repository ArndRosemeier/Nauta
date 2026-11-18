import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRAME_BUDGET_MS, benchPose, frameStats, percentile, statsLines } from '../src/app/bench.ts';

test('the flight starts low, climbs to the masthead halfway, comes down and goes north', () => {
  const start = benchPose(0, 60), mid = benchPose(30, 60), end = benchPose(60, 60);
  assert.equal(start.y, 3);
  assert.ok(Math.abs(mid.y - 30) < 1e-9);
  assert.ok(Math.abs(end.y - 3) < 1e-9);
  assert.ok(end.z < mid.z && mid.z < start.z && start.z === 0);
  assert.ok(Math.abs(end.look.yaw - 4 * Math.PI) < 1e-9, 'two whole turns');
});

test('before it starts the flight waits at the start, after its end it stays there', () => {
  assert.deepEqual(benchPose(-1, 60), benchPose(0, 60));
  assert.deepEqual(benchPose(99, 60), benchPose(60, 60));
});

test('the eye never looks far up or down on the flight', () => {
  for (let t = 0; t <= 60; t += 0.25) {
    const p = benchPose(t, 60).look.pitch;
    assert.ok(p > -0.3 && p < 0.1, `pitch ${p} at ${t} s`);
  }
});

test('a percentile is the nearest rank of the sorted values', () => {
  const v = Array.from({ length: 100 }, (_, i) => i + 1);
  assert.equal(percentile(v, 0.5), 50);
  assert.equal(percentile(v, 0.95), 95);
  assert.equal(percentile(v, 1), 100);
  assert.equal(percentile([7], 0.99), 7);
  assert.ok(Number.isNaN(percentile([], 0.5)));
});

test('a steady run at the display\'s rate is within budget, jitter round 16.7 ms included', () => {
  const frames = Array.from({ length: 600 }, (_, i) => FRAME_BUDGET_MS + (i % 2 ? 1.5 : -1.5));
  const s = frameStats({ frames, work: frames.map(() => 3) });
  assert.equal(s.count, 600);
  assert.equal(s.onTime, 1);
  assert.equal(s.hitches, 0);
  assert.equal(s.workMedian, 3);
  assert.ok(s.withinBudget);
  assert.match(statsLines(s).join('\n'), /within budget/);
});

test('one frame over 33 ms, or more than 5 of 100 late, is over budget', () => {
  const steady = Array.from({ length: 100 }, () => FRAME_BUDGET_MS);
  const hitch = frameStats({ frames: [...steady.slice(1), 40], work: [] });
  assert.equal(hitch.hitches, 1);
  assert.equal(hitch.worst, 40);
  assert.equal(hitch.withinBudget, false);
  const late = frameStats({ frames: [...steady.slice(6), ...Array(6).fill(2 * FRAME_BUDGET_MS - 1)], work: [] });
  assert.equal(late.hitches, 0);
  assert.equal(late.onTime, 0.94);
  assert.equal(late.withinBudget, false);
  assert.match(statsLines(late).join('\n'), /OVER BUDGET/);
});

test('no frames: nothing is within budget', () => {
  assert.equal(frameStats({ frames: [], work: [] }).withinBudget, false);
});
