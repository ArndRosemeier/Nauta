import { test } from 'node:test';
import assert from 'node:assert/strict';
import { judge } from './judge.mjs';

const budgets = { test: 2, file: 5, suiteWarn: 20, suiteFail: 30 };
const t = (file, name, seconds) => ({ file, name, seconds });

test('a quick run passes and names its slowest tests, slowest first', () => {
  const r = judge([t('a.test.ts', 'one', 0.1), t('a.test.ts', 'two', 0.4), t('b.test.ts', 'three', 0.2)], 3, budgets);
  assert.deepEqual(r.failures, []);
  assert.deepEqual(r.warnings, []);
  assert.match(r.lines[1], /0\.40 s {2}a\.test\.ts: two/);
});

test('a file whose tests add up past its limit fails, by name', () => {
  const r = judge([t('slow.test.ts', 'a', 1.9), t('slow.test.ts', 'b', 1.9), t('slow.test.ts', 'c', 1.9), t('ok.test.ts', 'd', 1)], 8, budgets);
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /slow\.test\.ts took 5\.7 s/);
});

test('a test past its own limit fails, by name, though its file is within its limit', () => {
  const r = judge([t('long.test.ts', 'one long test', 2.4), t('long.test.ts', 'quick', 0.1)], 3, budgets);
  assert.equal(r.failures.length, 1);
  assert.match(r.failures[0], /long\.test\.ts: "one long test" took 2\.4 s/);
});

test('the suite warns past its warning and fails past its budget', () => {
  assert.equal(judge([], 20.5, budgets).warnings.length, 1);
  assert.equal(judge([], 20.5, budgets).failures.length, 0);
  assert.equal(judge([], 30.5, budgets).failures.length, 1);
  assert.equal(judge([], 30.5, budgets).warnings.length, 0);
});
