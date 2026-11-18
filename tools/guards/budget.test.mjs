import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summary, verdict } from './budget.mjs';

test('a step is ok up to its warning, warns up to its limit and fails past it', () => {
  assert.equal(verdict(120, 120, 180), 'ok');
  assert.equal(verdict(121, 120, 180), 'warn');
  assert.equal(verdict(181, 120, 180), 'fail');
});

test('the slow checks are summed against the job limit, warning past two thirds of it', () => {
  const log = '140.2\tnpm run check:shots\n6.0\tnpm run check:replay\n';
  const { total, lines, verdict: v } = summary(log, 600);
  assert.equal(total, 146.2);
  assert.equal(lines.length, 3);
  assert.match(lines[2], /146\.2 s {2}all slow checks together \(warn at 400 s, the job's limit 600 s\)/);
  assert.equal(v, 'ok');
  assert.equal(summary('300\ta\n150\tb\n', 600).verdict, 'warn');
  assert.equal(summary('', 600).total, 0);
});
