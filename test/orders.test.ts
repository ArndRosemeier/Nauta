/**
 * The captain's orders (implementation plan N3.4): every order parses from its words and back; orders she cannot take
 * are refused with a reason as an event; a course closer than close-hauled is answered (an `answered` event with its
 * code) and changed; a course on the other tack is reached by wearing, never through the wind, and the master says so;
 * heaving to takes in and backs what the design says. Short rules on one brig in a whole match (sea and wind), a few simulated seconds each. Carried out
 * over minutes (she wears round, tacks, lies still hove to, gets under way again) they are scenarios of
 * `npm run check:sailing`; the crew carrying the orders out is in test/ordersCrew.test.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDiff } from '@futuremagic/core';
import {
  carryOut, giveOrder, headingWords, heard, orderWords, parseOrder, startOrders, VOCABULARY, type Order,
} from '../src/sim/orders.ts';
import { HOVE_TO_IN, POINT } from '../src/sim/rules/orders.ts';
import { CLOSE_HAULED } from '../src/sim/rules/sailing.ts';
import { startSailing } from '../src/sim/ship/sailing.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { DEGREE } from '../src/sim/units.ts';
import { steadyWind } from './support/sail.ts';
import { EACH, FROM, MODERATE, SEED, answers, reasons, run, underWay, windFrom } from './support/orders.ts';

/** On the beam in a moderate breeze, settled: built once for the file (states are plain data, never changed). */
const BEAM = Object.freeze(underWay(MODERATE, 90));

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

test('orders that cannot be done are refused with the reason as an event, and change nothing', () => {
  const irons = startMatch({ seed: SEED, windForce: MODERATE, windFrom: FROM, ships: [{ x: 0, z: 0, heading: 20 * DEGREE, speed: 0 }] });
  const none = run(irons, 1, [EACH.tack, EACH.wear]);
  assert.deepEqual(reasons(none.events), ['she has no way on her', 'she has no way on her']);
  assert.deepEqual(none.state.ships[0]!.told.given, []);
  const s = BEAM;
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

/** Her course told to the helmsman by the act an order puts in hand (the helm put over), and which way he turns: + to starboard. */
function helmAct(st: SimState): { heading: number; turn: number } {
  const act = st.ships[0]!.told.acts.find((a) => a.kind === 'helm');
  assert.ok(act && act.kind === 'helm', 'a helm act');
  return { heading: act.heading, turn: act.turn };
}

test('a course closer than close-hauled is answered: she will not lie it, and steers full and by on the nearer tack', () => {
  const s = BEAM, from = windFrom(s);
  // 30° to the east of the wind: on her own (larboard) tack.
  const r = run(s, 1, [{ kind: 'steer', ship: 0, heading: from + 30 * DEGREE }]);
  assert.deepEqual(reasons(r.events), [], 'taken, not refused');
  assert.match(answers(r.events)[0]!, new RegExp(`^will not lie: she will not lie ${headingWords(from + 30 * DEGREE)}: full and by on the larboard tack, ${headingWords(from + CLOSE_HAULED)}$`));
  assert.deepEqual(r.state.ships[0]!.told.helm, { heading: 0, by: -1 });
  const helm = helmAct(r.state);
  assert.ok(Math.abs(angleDiff(helm.heading, from + CLOSE_HAULED)) < 1e-9 && helm.turn === 0, 'the helmsman is told close-hauled, the short way');
  // On the other side of the wind's eye, the nearer tack is the other one: she wears round to it.
  assert.match(answers(run(s, 1, [{ kind: 'steer', ship: 0, heading: from - 30 * DEGREE }]).events)[0]!, /^will not lie: .*starboard tack, \d{3}, wearing round$/);
  // Coming up a point at a time stops at close-hauled the same way.
  let up = run(s, 1, [{ kind: 'steer', ship: 0, heading: from + 90 * DEGREE }]).state;
  up = run(up, 1, [EACH.up, EACH.up]).state;
  assert.ok(Math.abs(angleDiff(up.ships[0]!.told.helm.heading, from + 90 * DEGREE - 2 * POINT)) < 1e-9, 'two points up from the beam');
  assert.match(answers(run(up, 1, [EACH.up]).events)[0]!, /^will not lie: /);
});

test('a course on the other tack is reached by wearing, never through the wind, and the master says so; tack takes her through it', () => {
  // On the larboard tack heading east (the wind from the north), 270 lies on the other tack: the helm turns her away
  // from the wind (to starboard, through south), and the course is still taken.
  const wear = run(BEAM, 1, [{ kind: 'steer', ship: 0, heading: 270 * DEGREE }]);
  assert.deepEqual(reasons(wear.events), []);
  assert.deepEqual(answers(wear.events), ['wearing round: wearing round, sir: 270 lies on the other tack']);
  assert.deepEqual(wear.state.ships[0]!.told.given.map((g) => g.order.kind), ['steer']);
  assert.deepEqual(helmAct(wear.state), { heading: 270 * DEGREE, turn: 1 });
  // A course on her own tack is simply taken.
  const own = run(BEAM, 1, [{ kind: 'steer', ship: 0, heading: 120 * DEGREE }]).events;
  assert.deepEqual([...reasons(own), ...answers(own)], []);
  // Tack: full and by on the other tack, the helm turning her up through the wind (to larboard), the hands at their stations first.
  const tack = run(BEAM, 1, [EACH.tack]).state.ships[0]!;
  assert.deepEqual(tack.told.helm, { heading: 0, by: 1 });
  const acts = tack.told.acts.filter((a) => a.kind === 'helm');
  assert.equal(acts.length, 1);
  const act = acts[0]!;
  assert.ok(act.kind === 'helm' && act.turn === -1, `turning to larboard: ${JSON.stringify(act)}`);
  assert.ok(Math.abs(angleDiff(act.heading, windFrom(BEAM) - CLOSE_HAULED)) < 1e-9, 'close-hauled on the starboard tack');
});

test('heaving to: the courses, boom sail and headsails taken in, both topsails aback, full and by; filling lets them draw again', () => {
  const hove = run(BEAM, 1, [EACH.heave]).state, ship = hove.ships[0]!, sails = rigPlan().sails;
  assert.ok(ship.told.hove);
  assert.deepEqual(ship.told.helm, { heading: 0, by: -1 });
  const aback = ship.told.acts.flatMap((a) => (a.kind === 'yards' && a.aback ? [a.mast] : [])).sort();
  assert.deepEqual(aback, [0, 1], 'both masts laid aback');
  const takenIn = ship.told.acts.flatMap((a) => (a.kind === 'sail' && !a.set ? [sails[a.sail]!.id] : []));
  const setNow = BEAM.ships[0]!.sailing.canvas.flatMap((c, i) => (c.set && HOVE_TO_IN.includes(sails[i]!.id) ? [sails[i]!.id] : []));
  assert.deepEqual(takenIn.sort(), setNow.sort(), 'what she carries of the sails hove to keeps in comes in');
  const filled = run(hove, 1, [EACH.fill]).state.ships[0]!;
  assert.ok(!filled.told.hove && filled.told.helm.by === -1);
  assert.deepEqual(filled.told.backed, [false, false]);
  assert.ok(filled.told.acts.some((a) => a.kind === 'yards' && !a.aback), 'her yards filled');
});

test('full and by, the helmsman follows the wind as it shifts; missing stays, the master bears away and that is her course', () => {
  const wind = steadyWind(MODERATE, FROM), shifted = steadyWind(MODERATE, FROM + 10 * DEGREE);
  const sailing = startSailing({ heading: CLOSE_HAULED, speed: 2 }, wind, MODERATE);
  const told = giveOrder(startOrders(CLOSE_HAULED, 'battle'), sailing, EACH.by, { tick: 0, wind, force: MODERATE }).told;
  const steered = carryOut(told, sailing, told.acts.map((a) => a.id), wind);
  assert.ok(Math.abs(steered.sailing.steer.heading - CLOSE_HAULED) < 1e-9);
  const veered = carryOut(steered.told, steered.sailing, [], shifted);
  assert.ok(Math.abs(veered.sailing.steer.heading - (CLOSE_HAULED + 10 * DEGREE)) < 1e-9, 'the wind veered ten degrees, and so did her course');
  const missed = heard(veered.told, ['missed stays'], { ...veered.sailing, steer: { heading: 1, turn: 0 } });
  assert.deepEqual(missed.helm, { heading: 1, by: 0 });
});
