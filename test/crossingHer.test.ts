/**
 * "Cross her stern" and "Cross her bow" (implementation plan N7.6, design thread 2026-11-18): the master's standing helm
 * orders that plan a pass across the end of her with the computer captain's look-ahead (captain/tactics.ts), and report
 * it when it is made; and the plan itself: a ship pays for position, a pace table to read it by, the same plan from the
 * same state. Pure: short passes stepped on, no page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sightOf } from '../src/sim/captain/sight.ts';
import { crossedAt, pace, plan } from '../src/sim/captain/tactics.ts';
import { noticed } from '../src/sim/notices.ts';
import { giveOrder } from '../src/sim/orders.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { DEGREE, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { saysOf } from '../src/app/speech/reports.ts';
import { FROM, MODERATE, SEED } from './support/orders.ts';

/** Two brigs in a north wind: mine at the origin heading east, hers at (`x`, `z`) heading `hers` degrees, both 3 m/s. */
const meet = (x: number, z: number, hers: number): SimState => startMatch({
  seed: SEED, windForce: MODERATE, windFrom: FROM,
  ships: [{ x: 0, z: 0, heading: 90 * DEGREE, speed: 3 }, { x, z, heading: hers * DEGREE, speed: 3 }],
});

/** The ends my master reports crossed in `seconds` of the order `kind`, with the second of each. */
function crossings(s: SimState, kind: 'rake' | 'crossbow', seconds: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) {
    const r = step(s, i === 0 ? [{ kind, ship: 0 }] : []);
    for (const n of noticed(s, r.state, 0)) if (n.kind === 'crossed') out.push(`${n.end} ${Math.round(i / STEPS_PER_SECOND)}`);
    s = r.state;
  }
  return out;
}

test('cross her stern: the master takes her across the end of her, and reports it; ordered across her bow he does not', () => {
  // She lies close off my port bow going north: I go across her stern.
  const stern = crossings(meet(60, -60, 0), 'rake', 20);
  assert.ok(stern.length > 0 && stern.every((c) => c.startsWith('stern ')), `crossed her stern: ${stern}`);
  assert.deepEqual(crossings(meet(60, -60, 0), 'crossbow', 20), []);
});

test('cross her bow: where I can cross ahead of her, the master does, and reports it', () => {
  // She comes down toward my track from the north, going south, and I cross ahead of her.
  const bow = crossings(meet(150, -250, 180), 'crossbow', 20);
  assert.ok(bow.length > 0 && bow.every((c) => c.startsWith('bow ')), `crossed her bow: ${bow}`);
  assert.deepEqual(crossings(meet(150, -250, 180), 'rake', 20), [], 'ordered across her stern he does not cross her bow');
});

test('what he says when the pass is made', () => {
  const notice = { kind: 'crossed', tick: 0, ship: 0, end: 'stern' } as const;
  assert.deepEqual(saysOf(notice, 0).map((m) => m.line), ['across her stern']);
  assert.deepEqual(saysOf({ ...notice, end: 'bow' }, 0).map((m) => m.line), ['across her bow']);
  assert.deepEqual(saysOf(notice, 1), [], 'only the ship crossing says it');
});

test('the order is refused with no way on her or with no ship in sight; the same order is refused again once it stands', () => {
  const s = meet(150, -120, 0), told = s.ships[0]!.told, moment = (enemy: number | null) => ({ tick: 0, wind: { from: FROM, speed: 5, toward: 0 } as never, force: MODERATE, enemy });
  const still = { ...s.ships[0]!.sailing, ahead: 0 };
  assert.equal(giveOrder(told, still, { kind: 'rake', ship: 0 }, moment(200)).code, 'no way');
  assert.equal(giveOrder(told, s.ships[0]!.sailing, { kind: 'crossbow', ship: 0 }, moment(null)).code, 'no enemy');
  const taken = giveOrder(told, s.ships[0]!.sailing, { kind: 'rake', ship: 0 }, moment(200));
  assert.equal(taken.refused, false);
  assert.equal(taken.told.keep?.kind, 'rake');
  assert.equal(giveOrder(taken.told, s.ships[0]!.sailing, { kind: 'rake', ship: 0 }, moment(200)).code, 'keeping so already');
  assert.equal(giveOrder(taken.told, s.ships[0]!.sailing, { kind: 'crossbow', ship: 0 }, moment(200)).refused, false, 'the other end is taken instead');
});

test('the plan: the same from the same state, a pass across her end is a plan worth leaving the course for, and the pace table is read as she sails', () => {
  const s = meet(150, -120, 0), sight = sightOf(s, 0, 'master');
  assert.deepEqual(plan(sight, 'master', 90 * DEGREE), plan(sight, 'master', 90 * DEGREE));
  const across = plan(sight, 'master', 90 * DEGREE, 'stern');
  assert.ok(across.departs && Number.isFinite(across.score));
  // Slowest in the wind's eye, fastest with it on the quarter; a light wind slower than a fresh one.
  assert.ok(pace(40 * DEGREE, 5) < pace(70 * DEGREE, 5) && pace(70 * DEGREE, 5) < pace(110 * DEGREE, 5));
  assert.ok(pace(110 * DEGREE, 3) < pace(110 * DEGREE, 5));
  // Her stern lies across my broadside when I lie square to it, close.
  assert.ok(crossedAt({ x: 0, z: 60, heading: 90 * DEGREE }, { x: 0, z: 0, heading: 0 }, 'stern'));
  assert.ok(!crossedAt({ x: 0, z: 60, heading: 90 * DEGREE }, { x: 0, z: 0, heading: 0 }, 'bow'));
  assert.ok(!crossedAt({ x: 0, z: 600, heading: 90 * DEGREE }, { x: 0, z: 0, heading: 0 }, 'stern'), 'too far off');
});
