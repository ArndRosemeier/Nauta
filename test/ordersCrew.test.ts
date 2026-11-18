/**
 * The captain's orders handed to the crew (implementation plan N3.4, N4.1), in a whole match of one brig (sea and
 * wind): every order is applied and shows in the state at once, its work left to the men; a course and the yards
 * aback show once the men have done them; a later order replaces work not yet done. Rules on the smallest case, from
 * one state built once for the file: every order carried out to the end and plain sail set sail by sail are scenarios
 * of the crew's slow check (tools/sim/crew.ts). The vocabulary, refusals and manoeuvres are in test/orders.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGunnery, type Order } from '../src/sim/orders.ts';
import type { SimState } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { DEGREE, wrapBearing } from '../src/sim/units.ts';
import { EACH, MODERATE, run, underWay } from './support/orders.ts';

/** Her way settles in this long from the match's start, s (enough for a tack to be taken). */
const SETTLE = 2;
/** Long enough for the helm put over, and for the main yards braced aback, s. */
const HELM_SECONDS = 5;
const BACK_SECONDS = 16;
/** Plain sail stopped this soon, before any sail is set, and how long she is followed after, s. */
const EARLY = 2;
const AFTER = 20;

/** The orders that give `order`: fill needs something aback, the main topsail backed in the same step, which the fill then replaces. */
const ordersFor = (order: Order): Order[] => (order.kind === 'fill' ? [EACH.back, order] : [order]);

/** The file's one start: a beam reach under battle sail with way on, built once and frozen. */
let built: SimState | null = null;
const start = (): SimState => (built ??= Object.freeze(underWay(MODERATE, 100, SETTLE)));

test('every order is applied and shows in the state at once: taken, being carried out, its work still to do', () => {
  // The gunnery orders take none of the sailing drill's hands (test/gunnery.test.ts).
  for (const order of Object.values(EACH).filter((o) => !isGunnery(o))) {
    const s = step(start(), ordersFor(order)), told = s.state.ships[0]!.told;
    assert.deepEqual(s.events.filter((e) => e.kind === 'refused'), [], `${order.kind} is taken`);
    assert.deepEqual(told.given.map((g) => g.order), [order], `${order.kind} is being carried out`);
    assert.ok(told.acts.length > 0, `${order.kind} has its work still to do`);
  }
});

test('a course and the yards aback show once the men have done them', () => {
  const steer = run(start(), HELM_SECONDS, [EACH.steer]).state.ships[0]!;
  assert.deepEqual(steer.told.helm, { heading: wrapBearing(120 * DEGREE), by: 0 });
  assert.equal(steer.sailing.steer.heading, steer.told.helm.heading);
  const back = run(start(), BACK_SECONDS, [EACH.back]).state.ships[0]!;
  assert.deepEqual([back.told.backed, back.sailing.backed], [[false, true], [false, true]]);
});

test('a later order replaces the work not yet done, and two courses at once are one helm act', () => {
  const before = start().ships[0]!.sailing.canvas;
  // Plain sail changed to battle sail before any sail is set: nothing to take in, the work is simply stopped.
  const early = run(run(start(), EARLY, [EACH.sail]).state, AFTER, [{ kind: 'sail', ship: 0, canvas: 'battle' }]).state.ships[0]!;
  assert.deepEqual([early.sailing.canvas, early.told.given, early.told.acts, early.crew.tasks], [before, [], [], []]);
  // Two courses one after the other: one helm act, the later course.
  const twice = step(start(), [EACH.steer, { kind: 'steer', ship: 0, heading: 110 * DEGREE }]).state.ships[0]!.told;
  assert.deepEqual(twice.acts.map((a) => a.kind), ['helm']);
  assert.deepEqual(twice.given.map((g) => g.order.kind), ['steer']);
});
