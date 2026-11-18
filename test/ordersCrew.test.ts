/**
 * The captain's orders carried out by the crew (implementation plan N3.4, N4.1): every order is applied and shows in
 * the state at once, and is done over the time its men take; the sails are set when their men have loosed and
 * sheeted them home, and a later order replaces the work not yet done. Whole matches of one brig (sea and wind).
 * The vocabulary, refusals and manoeuvres are in test/orders.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOBS, PASSED } from '../src/sim/rules/crew.ts';
import { canvasFor } from '../src/sim/ship/sailing.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import type { Order } from '../src/sim/orders.ts';
import { step } from '../src/sim/step.ts';
import { DEGREE, STEPS_PER_SECOND, wrapBearing } from '../src/sim/units.ts';
import { EACH, MODERATE, run, underWay } from './support/orders.ts';

/** The longest any order here takes to carry out, s (plain sail from battle sail: a course, then a topgallant). */
const MOST_ORDER_SECONDS = 60;
/** Long enough for plain sail to be set in full, s. */
const PLAIN_SECONDS = 90;

/** The orders that give `order`: fill needs something aback, the main topsail backed in the same step, which the fill then replaces. */
const ordersFor = (order: Order): Order[] => (order.kind === 'fill' ? [EACH.back, order] : [order]);

test('every order is applied and shows in the state at once: taken, being carried out, its work still to do', () => {
  const start = underWay(MODERATE, 100);
  for (const order of Object.values(EACH)) {
    const s = step(start, ordersFor(order)), told = s.state.ships[0]!.told;
    assert.deepEqual(s.events.filter((e) => e.kind === 'refused'), [], `${order.kind} is taken`);
    assert.deepEqual(told.given.map((g) => g.order), [order], `${order.kind} is being carried out`);
    assert.ok(told.acts.length > 0, `${order.kind} has its work still to do`);
  }
  // What each shows: the course told and steered, the yards aback.
  const steer = run(start, 5, [EACH.steer]).state.ships[0]!;
  assert.deepEqual(steer.told.helm, { heading: wrapBearing(120 * DEGREE), by: 0 });
  assert.equal(steer.sailing.steer.heading, steer.told.helm.heading);
  const back = run(start, 20, [EACH.back]).state.ships[0]!;
  assert.deepEqual([back.told.backed, back.sailing.backed], [[false, true], [false, true]]);
});

test('every order is carried out by the crew over the time the men take, and reported done', () => {
  const start = underWay(MODERATE, 100);
  // Plain sail, the longest, is followed to the end in the next test.
  for (const order of Object.values(EACH).filter((o) => o !== EACH.sail)) {
    let s = step(start, ordersFor(order)), t = 0;
    while (!s.events.some((e) => e.kind === 'done') && t < MOST_ORDER_SECONDS) { s = step(s.state); t += 1 / STEPS_PER_SECOND; }
    const done = s.events.find((e) => e.kind === 'done');
    assert.ok(done && done.kind === 'done' && done.order === order, `${order.kind} is reported done`);
    assert.ok(t >= 1, `${order.kind} takes time: done after ${t.toFixed(1)} s`);
  }
});

test('the sails are set when their men have loosed and sheeted them home, and a later order replaces the work not yet done', () => {
  const start = underWay(MODERATE, 100);
  const sails = rigPlan().sails, before = start.ships[0]!.sailing.canvas;
  const setAt = new Map<string, number>();
  const plain = run(start, PLAIN_SECONDS, [EACH.sail], (s, t) => s.ships[0]!.sailing.canvas.forEach((c, i) => {
    if (c.set && !before[i]!.set && !setAt.has(sails[i]!.id)) setAt.set(sails[i]!.id, t);
  }));
  // Plain sail is reported done, and shows: the canvas told and set.
  const done = plain.events.find(({ e }) => e.kind === 'done');
  assert.ok(done && done.e.kind === 'done' && done.e.order === EACH.sail && done.t >= 1, `plain sail is reported done after ${done?.t.toFixed(1)} s`);
  const ship = plain.state.ships[0]!;
  assert.equal(ship.told.canvas, 'plain');
  assert.deepEqual(ship.sailing.canvas, canvasFor('plain', MODERATE));
  // Plain sail adds the courses and topgallants; each is set no sooner than the order comes down and its work is done.
  assert.deepEqual([...setAt.keys()].sort(), ['fore-course', 'fore-topgallant', 'main-course', 'main-topgallant']);
  for (const [id, t] of setAt) {
    const level = id.endsWith('course') ? 'course' : 'topgallant', work = JOBS.loose.work as Record<string, number>, sheet = JOBS.sheet.work as Record<string, number>;
    assert.ok(t >= PASSED['first lieutenant'] + work[level]! + sheet[level]!, `${id} set after ${t.toFixed(1)} s`);
  }
  // Changed when some are set: battle sail again, and the sails already set come in.
  const half = run(start, Math.min(...setAt.values()) + 1, [EACH.sail]).state;
  assert.ok(half.ships[0]!.sailing.canvas.some((c, i) => c.set && !before[i]!.set), 'a sail is set');
  const back = run(half, MOST_ORDER_SECONDS, [{ kind: 'sail', ship: 0, canvas: 'battle' }]);
  assert.deepEqual(back.state.ships[0]!.sailing.canvas, before);
  assert.deepEqual(back.state.ships[0]!.told.given, []);
  // Changed before any is set: nothing to take in, the work is simply stopped.
  const early = run(run(start, 2, [EACH.sail]).state, 30, [{ kind: 'sail', ship: 0, canvas: 'battle' }]).state.ships[0]!;
  assert.deepEqual([early.sailing.canvas, early.told.given, early.told.acts, early.crew.tasks], [before, [], [], []]);
  // Two courses one after the other: one helm act, the later course.
  const twice = step(start, [EACH.steer, { kind: 'steer', ship: 0, heading: 110 * DEGREE }]).state.ships[0]!.told;
  assert.deepEqual(twice.acts.map((a) => a.kind), ['helm']);
  assert.deepEqual(twice.given.map((g) => g.order.kind), ['steer']);
});
