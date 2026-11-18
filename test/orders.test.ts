/**
 * The captain's orders (implementation plan N3.4): every order parses from its words and back, is applied and shows in
 * the state, and is carried out over its time from the table; orders she cannot take are refused with a reason as an
 * event; a course closer than close-hauled is answered and changed; a course on the other tack is reached by wearing,
 * never through the wind; heaving to stops her and she lies still. Whole matches of one brig (sea and wind), a few
 * simulated minutes each.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDiff } from '@futuremagic/core';
import {
  carryOut, giveOrder, headingWords, heard, orderWords, parseOrder, startOrders, VOCABULARY, type Order, type OrderKind,
} from '../src/sim/orders.ts';
import { NO_WAY, POINT, SAIL_SECONDS, TACK_SECONDS } from '../src/sim/rules/orders.ts';
import { CLOSE_HAULED } from '../src/sim/rules/sailing.ts';
import { canvasFor, startSailing } from '../src/sim/ship/sailing.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { simTime, startMatch, type SimState } from '../src/sim/state.ts';
import { meanWind } from '../src/sim/wind.ts';
import { step, type SimEvent } from '../src/sim/step.ts';
import { DEGREE, KNOT, STEPS_PER_SECOND, wrapBearing } from '../src/sim/units.ts';
import { steadyWind } from './support/sail.ts';

const SEED = 1805;
/** The wind blows from the north: a heading is then the wind's angle off her bow, to starboard of it on the larboard tack. */
const FROM = 0;
const FRESH = 5;
const MODERATE = 4;
/** The longest any order here takes to carry out, s (plain sail from battle sail: a course, then a topgallant). */
const MOST_ORDER_SECONDS = 60;

/** One brig in a match, `angle` degrees off the wind (to the east: the wind on her larboard side), sailed on for `settle` s. */
function underWay(force: number, angle: number, settle = 20, canvas: 'battle' | 'plain' | 'bare' = 'battle', speed = 3): SimState {
  let s = startMatch({ seed: SEED, windForce: force, windFrom: FROM, ships: [{ x: 0, z: 0, heading: angle * DEGREE, canvas, speed }] });
  for (let i = 0; i < settle * STEPS_PER_SECOND; i++) s = step(s).state;
  return s;
}

/** Stepped on for `seconds`, the `orders` given in the first step; every event with the time it came, s from the start. */
function run(s: SimState, seconds: number, orders: readonly Order[] = [], each?: (s: SimState, t: number) => void): { state: SimState; events: { t: number; e: SimEvent }[] } {
  const events: { t: number; e: SimEvent }[] = [];
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) {
    const r = step(s, i === 0 ? orders : []);
    s = r.state;
    for (const e of r.events) events.push({ t: i / STEPS_PER_SECOND, e });
    each?.(s, i / STEPS_PER_SECOND);
  }
  return { state: s, events };
}

/** The mean wind's bearing in a state (what the master judges by). */
const windFrom = (s: SimState): number => meanWind(s.wind, simTime(s)).from;
const kinds = (events: { e: SimEvent }[]) => events.map(({ e }) => e.kind);
const reasons = (events: { e: SimEvent }[]) => events.flatMap(({ e }) => (e.kind === 'refused' ? [e.reason] : []));

/** One order of each kind of the vocabulary, for ship 0. */
const EACH: Readonly<Record<OrderKind, Order>> = {
  steer: { kind: 'steer', ship: 0, heading: 120 * DEGREE },
  up: { kind: 'up', ship: 0 }, away: { kind: 'away', ship: 0 }, by: { kind: 'by', ship: 0 },
  tack: { kind: 'tack', ship: 0 }, wear: { kind: 'wear', ship: 0 }, heave: { kind: 'heave', ship: 0 },
  sail: { kind: 'sail', ship: 0, canvas: 'plain' }, shorten: { kind: 'shorten', ship: 0 },
  back: { kind: 'back', ship: 0, mast: 'main' }, fill: { kind: 'fill', ship: 0 },
};

test('every order of the vocabulary parses from its own words and back, and from the words a captain might use', () => {
  assert.deepEqual(VOCABULARY.map((w) => w.kind).sort(), Object.keys(EACH).sort());
  for (const order of Object.values(EACH)) assert.deepEqual(parseOrder(orderWords(order), 0), order, orderWords(order));
  for (const canvas of ['battle', 'plain', 'all'] as const) assert.deepEqual(parseOrder(`${canvas} sail`, 1), { kind: 'sail', ship: 1, canvas });
  assert.deepEqual(parseOrder('back the fore topsail', 0), { kind: 'back', ship: 0, mast: 'fore' });
  const said: [string, Order][] = [
    ['Steer 090!', { kind: 'steer', ship: 0, heading: 90 * DEGREE }],
    ['course to nne', { kind: 'steer', ship: 0, heading: 22.5 * DEGREE }],
    ['steer west', { kind: 'steer', ship: 0, heading: 270 * DEGREE }],
    ['Come up a point, sir', { kind: 'up', ship: 0 }],
    ['bear off', { kind: 'away', ship: 0 }],
    ['Ready about', { kind: 'tack', ship: 0 }],
    ['wear ship', { kind: 'wear', ship: 0 }],
    ['back the main', { kind: 'back', ship: 0, mast: 'main' }],
    ['take in sail', { kind: 'shorten', ship: 0 }],
    ['let draw', { kind: 'fill', ship: 0 }],
  ];
  for (const [words, order] of said) {
    const got = parseOrder(words, 0);
    assert.ok(typeof got === 'object', `${words}: ${String(got)}`);
    assert.equal(got.kind, order.kind, words);
    if (order.kind === 'steer') assert.ok(Math.abs((got as typeof order).heading - order.heading) < 1e-12, words);
    else assert.deepEqual(got, order, words);
  }
  assert.match(parseOrder('splice the main brace', 0) as string, /no such order/);
  assert.match(parseOrder('steer', 0) as string, /which course/);
  assert.match(parseOrder('steer 400', 0) as string, /which course/);
  assert.match(parseOrder('tack now', 0) as string, /takes nothing more/);
});

test('every order is applied and shows in the state at once, and is carried out over its time from the table', () => {
  const start = underWay(MODERATE, 100);
  for (const order of Object.values(EACH)) {
    // Fill needs something aback: the main topsail backed in the same step, which the fill then replaces.
    const orders = order.kind === 'fill' ? [EACH.back, order] : [order];
    let s = step(start, orders);
    assert.deepEqual(s.events.filter((e) => e.kind === 'refused'), [], `${order.kind} is taken`);
    const told = s.state.ships[0]!.told;
    assert.deepEqual(told.given.map((g) => g.order), [order], `${order.kind} is being carried out`);
    assert.ok(told.acts.length > 0, `${order.kind} has its work still to do`);
    let t = 0;
    while (!s.events.some((e) => e.kind === 'done') && t < MOST_ORDER_SECONDS) { s = step(s.state); t += 1 / STEPS_PER_SECOND; }
    const done = s.events.find((e) => e.kind === 'done');
    assert.ok(done && done.kind === 'done' && done.order === order, `${order.kind} is reported done`);
    assert.ok(t >= 1, `${order.kind} takes time: done after ${t.toFixed(1)} s`);
  }
  // What each shows: the course told and steered, the canvas, the yards aback.
  const steer = run(start, 5, [EACH.steer]).state.ships[0]!;
  assert.deepEqual(steer.told.helm, { heading: wrapBearing(120 * DEGREE), by: 0 });
  assert.equal(steer.sailing.steer.heading, steer.told.helm.heading);
  const plain = run(start, 90, [EACH.sail]).state.ships[0]!;
  assert.equal(plain.told.canvas, 'plain');
  assert.deepEqual(plain.sailing.canvas, canvasFor('plain', MODERATE));
  const back = run(start, 20, [EACH.back]).state.ships[0]!;
  assert.deepEqual([back.told.backed, back.sailing.backed], [[false, true], [false, true]]);
});

test('the sails are set one after another over the time from the table, and a later order replaces the work not yet done', () => {
  const start = underWay(MODERATE, 100);
  const sails = rigPlan().sails, before = start.ships[0]!.sailing.canvas;
  const setAt = new Map<string, number>();
  run(start, 90, [EACH.sail], (s, t) => s.ships[0]!.sailing.canvas.forEach((c, i) => {
    if (c.set && !before[i]!.set && !setAt.has(sails[i]!.id)) setAt.set(sails[i]!.id, t);
  }));
  // Plain sail adds the courses and topgallants: on each mast one after the other, the masts side by side.
  assert.deepEqual([...setAt.keys()].sort(), ['fore-course', 'fore-topgallant', 'main-course', 'main-topgallant']);
  for (const mast of ['fore', 'main']) {
    const course = setAt.get(`${mast}-course`)!, topgallant = setAt.get(`${mast}-topgallant`)!;
    assert.ok(Math.abs(topgallant - course - SAIL_SECONDS[`${mast}-topgallant`]!) < 1, `${mast}: course at ${course} s, topgallant at ${topgallant} s`);
  }
  // Changed before it is done: battle sail again, and the sails already set come in.
  const half = run(start, 25, [EACH.sail]).state;
  const back = run(half, 60, [{ kind: 'sail', ship: 0, canvas: 'battle' }]);
  assert.deepEqual(back.state.ships[0]!.sailing.canvas, before);
  assert.deepEqual(back.state.ships[0]!.told.given, []);
  // Two courses one after the other: one helm act, the later course.
  const twice = step(start, [EACH.steer, { kind: 'steer', ship: 0, heading: 110 * DEGREE }]).state.ships[0]!.told;
  assert.deepEqual(twice.acts.map((a) => a.kind), ['helm']);
  assert.deepEqual(twice.given.map((g) => g.order.kind), ['steer']);
});

test('orders that cannot be done are refused with the reason as an event, and change nothing', () => {
  const irons = startMatch({ seed: SEED, windForce: MODERATE, windFrom: FROM, ships: [{ x: 0, z: 0, heading: 20 * DEGREE, speed: 0 }] });
  const none = run(irons, 1, [EACH.tack, EACH.wear]);
  assert.deepEqual(reasons(none.events), ['she has no way on her', 'she has no way on her']);
  assert.deepEqual(none.state.ships[0]!.told.given, []);
  const s = underWay(MODERATE, 90);
  // A tack during a tack is refused until she is round.
  const tacking = run(s, 10, [EACH.tack]).state;
  assert.match(reasons(run(tacking, 1, [EACH.tack]).events)[0]!, /in stays/);
  const cases: [Order[], RegExp][] = [
    [[EACH.heave, EACH.heave], /hove to already/],
    [[{ kind: 'sail', ship: 0, canvas: 'battle' }], /battle sail already/],
    [[EACH.shorten, EACH.shorten], /bare poles/],
    [[EACH.fill], /every sail is drawing/],
    [[EACH.back, EACH.back], /aback already/],
    [[EACH.by, EACH.up], /as close to the wind/],
    [[EACH.by, EACH.by], /full and by on the larboard tack already/],
    [[{ kind: 'splice', ship: 0 } as unknown as Order], /no order "splice"/],
  ];
  for (const [orders, reason] of cases) {
    const r = run(s, 1, orders);
    assert.equal(reasons(r.events).length, 1, String(reason));
    assert.match(reasons(r.events)[0]!, reason);
  }
  // In a gale plain sail is what battle sail is (close-reefed topsails): nothing to set.
  assert.match(reasons(run(underWay(STRONGEST_FORCE, 90, 1), 1, [EACH.sail]).events)[0]!, /in this wind plain sail is what she carries already/);
});
const STRONGEST_FORCE = 8;

test('a course closer than close-hauled is answered: she will not lie it, and steers full and by on the nearer tack', () => {
  const s = underWay(MODERATE, 90), from = windFrom(s);
  // 30° to the east of the wind: on her own (larboard) tack.
  const r = run(s, 60, [{ kind: 'steer', ship: 0, heading: from + 30 * DEGREE }]);
  assert.match(reasons(r.events)[0]!, new RegExp(`will not lie ${headingWords(from + 30 * DEGREE)}: full and by on the larboard tack, ${headingWords(from + CLOSE_HAULED)}$`));
  const ship = r.state.ships[0]!;
  assert.deepEqual(ship.told.helm, { heading: 0, by: -1 });
  assert.ok(Math.abs(angleDiff(ship.sailing.heading, windFrom(r.state) + CLOSE_HAULED)) < 6 * DEGREE, `heading ${(ship.sailing.heading / DEGREE).toFixed(1)}°`);
  assert.ok(!kinds(r.events).includes('tacked') && !kinds(r.events).includes('wore'));
  // On the other side of the wind's eye, the nearer tack is the other one: she wears round to it.
  assert.match(reasons(run(s, 1, [{ kind: 'steer', ship: 0, heading: from - 30 * DEGREE }]).events)[0]!, /starboard tack, \d{3}, wearing round/);
  // Coming up a point at a time stops at close-hauled the same way.
  let up = run(s, 1, [{ kind: 'steer', ship: 0, heading: from + 90 * DEGREE }]).state;
  up = run(up, 1, [EACH.up, EACH.up]).state;
  assert.ok(Math.abs(angleDiff(up.ships[0]!.told.helm.heading, from + 90 * DEGREE - 2 * POINT)) < 1e-9, 'two points up from the beam');
  assert.match(reasons(run(up, 1, [EACH.up]).events)[0]!, /will not lie/);
});

test('a course on the other tack is reached by wearing, never through the wind; tack takes her through it', () => {
  const s = underWay(MODERATE, 90);
  const wear = run(s, 120, [{ kind: 'steer', ship: 0, heading: 270 * DEGREE }]);
  assert.ok(kinds(wear.events).includes('wore') && !kinds(wear.events).includes('tacked'), kinds(wear.events).join(', '));
  assert.ok(Math.abs(angleDiff(wear.state.ships[0]!.sailing.heading, 270 * DEGREE)) < 5 * DEGREE);
  const tack = run(underWay(FRESH, 70, 40), 90, [EACH.tack]);
  const tacked = tack.events.find(({ e }) => e.kind === 'tacked');
  assert.ok(tacked && tacked.t > TACK_SECONDS, `through the wind after the hands are at their stations: ${tacked?.t.toFixed(1)} s`);
  const after = tack.state.ships[0]!;
  assert.deepEqual(after.told.helm, { heading: 0, by: 1 });
  assert.ok(Math.abs(angleDiff(after.sailing.heading, -CLOSE_HAULED)) < 8 * DEGREE, `full and by on the starboard tack: ${(after.sailing.heading / DEGREE).toFixed(1)}°`);
});

test('heaving to stops her within a couple of minutes in a fresh breeze, she lies still, and filling puts her under way again', () => {
  const s = underWay(FRESH, 90, 40);
  assert.ok(s.ships[0]!.sailing.ahead > 6 * KNOT, `under way at ${(s.ships[0]!.sailing.ahead / KNOT).toFixed(1)} kn`);
  let stopped = Infinity, most = 0;
  const hove = run(s, 240, [EACH.heave], (st, t) => {
    const v = st.ships[0]!.sailing.ahead;
    if (stopped === Infinity && v < NO_WAY) stopped = t;
    if (stopped < t) most = Math.max(most, Math.abs(v));
  });
  assert.ok(stopped < 120, `her way off after ${stopped.toFixed(0)} s`);
  assert.ok(most < 1 * KNOT, `then she lies within ${(most / KNOT).toFixed(2)} kn of still`);
  const ship = hove.state.ships[0]!;
  assert.ok(ship.told.hove);
  assert.ok(ship.sailing.canvas.every((c, i) => !c.set || rigPlan().sails[i]!.id.includes('topsail')), 'only the topsails set');
  const filled = run(hove.state, 90, [EACH.fill]).state.ships[0]!;
  assert.ok(!filled.told.hove && filled.told.helm.by === -1);
  assert.deepEqual(filled.sailing.canvas, canvasFor('battle', FRESH));
  assert.deepEqual(filled.sailing.backed, [false, false]);
  assert.ok(filled.sailing.ahead > 2 * KNOT, `under way again at ${(filled.sailing.ahead / KNOT).toFixed(1)} kn`);
});

test('full and by, the helmsman follows the wind as it shifts; missing stays, the master bears away and that is her course', () => {
  const wind = steadyWind(MODERATE, FROM), shifted = steadyWind(MODERATE, FROM + 10 * DEGREE);
  const sailing = startSailing({ heading: CLOSE_HAULED, speed: 2 }, wind, MODERATE);
  const told = giveOrder(startOrders(CLOSE_HAULED, 'battle'), sailing, EACH.by, { tick: 0, wind, force: MODERATE }).told;
  const steered = carryOut(told, sailing, STEPS_PER_SECOND * 3, wind);
  assert.ok(Math.abs(steered.sailing.steer.heading - CLOSE_HAULED) < 1e-9);
  const veered = carryOut(steered.told, steered.sailing, STEPS_PER_SECOND * 4, shifted);
  assert.ok(Math.abs(veered.sailing.steer.heading - (CLOSE_HAULED + 10 * DEGREE)) < 1e-9, 'the wind veered ten degrees, and so did her course');
  const missed = heard(veered.told, ['missed stays'], { ...veered.sailing, steer: { heading: 1, turn: 0 } });
  assert.deepEqual(missed.helm, { heading: 1, by: 0 });
});
