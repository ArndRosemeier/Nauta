/**
 * The crew trial (`?crew`, plans N4.0 and N4.3) and the crew's knobs in the quality table: each level gives the crew
 * no more than the one above, and the trial runs its phases in order and says what both crews add.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUALITY_LEVELS } from '../src/app/quality.ts';
import { TRIAL_PHASES, TRIAL_SECONDS, TRIAL_SETTLE_SECONDS, emptySamples, trialAt, trialLines } from '../src/app/crewTrial.ts';

test('each quality level gives the crew no more than the one above', () => {
  QUALITY_LEVELS.forEach((l, i) => {
    const c = l.crew, up = QUALITY_LEVELS[i - 1]?.crew;
    assert.equal(c.steps.length, c.stepsTo.length + 1);
    assert.ok(c.poolFull <= c.pool && c.fullTo <= c.poolTo && c.poolTo <= c.dressTo && c.dressTo <= c.crowdTo);
    if (!up) return;
    assert.ok(c.pool <= up.pool && c.poolFull <= up.poolFull && c.poolTo <= up.poolTo && c.fullTo <= up.fullTo, l.name);
    assert.ok(c.shadowTo <= up.shadowTo && c.dressTo <= up.dressTo && c.crowdTo <= up.crowdTo && c.hiddenStep >= up.hiddenStep && c.dressEvery >= up.dressEvery, l.name);
    c.steps.forEach((s, k) => assert.ok(s >= up.steps[k]!));
  });
});

test('the trial runs its phases in order, each settling before it is measured, and says what both crews add', () => {
  assert.deepEqual(trialAt(0), { phase: 0, measuring: false });
  assert.deepEqual(trialAt(TRIAL_SETTLE_SECONDS + 0.1), { phase: 0, measuring: true });
  assert.equal(trialAt(TRIAL_SECONDS + 1).phase, TRIAL_PHASES.length);
  assert.deepEqual(TRIAL_PHASES.slice(0, 4).map((p) => [p.crews, p.pool]), [[0, false], [1, false], [2, false], [2, true]]);
  const samples = TRIAL_PHASES.map(emptySamples);
  samples.forEach((s, i) => { for (let k = 0; k < 10; k++) { s.frames.push(16.7); s.work.push(2 + i); s.crew.push(i); s.draws.push(100 * i); } });
  const lines = trialLines(samples);
  assert.equal(lines.length, TRIAL_PHASES.length + 2);
  assert.match(lines[lines.length - 1]!, /both crews add 3\.0 ms of page work/);
});
