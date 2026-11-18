/**
 * The order fan (implementation plan N4.4, docs/design/orders.md): what each man offers (at most six, one more ring at
 * most), dim and ringed as the match stands, where a finger finds a man and an order, the course "steer there" gives,
 * the order keys, whom an order goes to and whether the captain's voice reaches him, and the midshipman running a
 * message. Pure rules on a match at its start; no page.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startMatch } from '../src/sim/state.ts';
import { giveOrder, type Order } from '../src/sim/orders.ts';
import { openShip } from '../src/sim/crew/closures.ts';
import { routeNetwork, standable } from '../src/sim/crew/network.ts';
import { DEGREE, KNOT } from '../src/sim/units.ts';
import { meanWind } from '../src/sim/wind.ts';
import { FAN_DEPTH, FAN_MOST, KEY_ORDERS, fanItems, fanSlots, manAt, slotAt, slotPlaces, type FanItem } from '../src/app/fanOrders.ts';
import { OFFICERS, TAKERS, deliverAt, floorApart, inVoice, midshipmanStart, postOf, quarterdeck, takerOf } from '../src/app/officers.ts';
import { Midshipman } from '../src/app/midshipman.ts';
import { lookBearing } from '../src/app/look.ts';
import { DEFAULT_SETTINGS, KEY_ACTIONS, readSettings } from '../src/app/settings.ts';
import type { SimState } from '../src/sim/state.ts';

/** A brig at the start, heading east in a north wind, under way or with no way on her. */
const brig = (knots: number): SimState => startMatch({ seed: 1805, windForce: 4, windFrom: 0, ships: [{ x: 0, z: 0, heading: 90 * DEGREE, speed: knots * KNOT }] });
const UNDER_WAY = brig(5), STOPPED = brig(0);

const depth = (items: readonly FanItem[]): number => 1 + Math.max(0, ...items.map((i) => (i.act.kind === 'ring' ? depth(i.act.items) : 0)));
const ids = (items: readonly FanItem[]) => items.map((i) => i.id);

test('every man offers at most six orders and at most one more ring', () => {
  for (const who of OFFICERS) {
    const items = fanItems(who, UNDER_WAY, 0);
    assert.ok(items.length <= FAN_MOST, `${who}: ${items.length}`);
    assert.ok(depth(items) <= FAN_DEPTH, `${who} goes ${depth(items)} rings deep`);
  }
  assert.deepEqual(ids(fanItems('master', UNDER_WAY, 0)), ['steer', 'up', 'away', 'by', 'about', 'heave']);
  assert.deepEqual(ids(fanItems('first lieutenant', UNDER_WAY, 0)), ['sail', 'shorten', 'back']);
  // The midshipman offers the men who have orders now, and each order goes to the man who takes it.
  assert.deepEqual(ids(fanItems('midshipman', UNDER_WAY, 0)), ['to-master', 'to-first lieutenant', 'to-lookout']);
  const orderOf = (i: FanItem): Order[] => (i.act.kind === 'order' ? [i.act.order] : i.act.kind === 'ring' ? i.act.items.flatMap(orderOf) : []);
  for (const who of TAKERS) for (const o of fanItems(who, UNDER_WAY, 0).flatMap(orderOf)) assert.equal(takerOf(o), who);
});

test('an order he cannot carry out now is dim, the one he carries out is ringed, and Back becomes Fill', () => {
  const about = (s: SimState) => fanSlots(fanItems('master', s, 0), s, 0).find((x) => x.item.id === 'about')!;
  assert.equal(about(UNDER_WAY).dim, false);
  assert.equal(about(STOPPED).dim, true, 'tack and wear need way on her');
  const s = UNDER_WAY.ships[0]!, moment = { tick: UNDER_WAY.tick, wind: meanWind(UNDER_WAY.wind, 0), force: UNDER_WAY.wind.windForce };
  const backed = { ...UNDER_WAY, ships: [{ ...s, told: giveOrder(s.told, s.sailing, { kind: 'back', ship: 0, mast: 'main' }, moment).told }] };
  const slots = fanSlots(fanItems('first lieutenant', backed, 0), backed, 0);
  assert.deepEqual(slots.map((x) => x.item.id), ['sail', 'shorten', 'fill']);
  const battle = fanSlots(fanItems('first lieutenant', UNDER_WAY, 0), UNDER_WAY, 0).find((x) => x.item.id === 'sail')!;
  assert.equal(battle.on, true, 'she starts under battle sail: the ring "Make sail" is ringed');
});

test('a finger finds the order and the man nearest it, within reach', () => {
  const places = slotPlaces(6, 132);
  assert.deepEqual(places[0]!.map(Math.round), [0, -132]);
  assert.equal(slotAt(places, 110, 70, 48), 2);
  assert.equal(slotAt(places, 0, 0, 48), -1);
  const men = [{ who: 'master' as const, x: 100, y: 100, seen: true }, { who: 'gunner' as const, x: 140, y: 100, seen: false }];
  assert.equal(manAt(men, 130, 100, 64), 'master', 'a man out of view is never found');
  assert.equal(manAt(men, 300, 300, 64), null);
});

test('steer there is the bearing he looks along from her', () => {
  assert.equal(lookBearing({ yaw: 0, pitch: 0 }, 1), 1);
  assert.ok(Math.abs(lookBearing({ yaw: Math.PI / 2, pitch: 0 }, 0) - 3 * Math.PI / 2) < 1e-9, 'looking to larboard from her heading north is west');
});

test('the order keys: each a different key, and a glass kept on G gives G up to Wear', () => {
  const keys = Object.values(DEFAULT_SETTINGS.keys);
  assert.equal(new Set(keys).size, keys.length);
  for (const a of ['steer', 'up', 'away', 'tack', 'wear', 'heave', 'battle', 'plain', 'all', 'shorten'] as const) assert.ok(KEY_ORDERS[a], a);
  const old = readSettings({ keys: { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', glass: 'KeyG' } });
  assert.equal(old.keys.glass, 'KeyQ');
  assert.equal(old.keys.wear, 'KeyG');
  assert.equal(new Set(KEY_ACTIONS.map((a) => old.keys[a])).size, KEY_ACTIONS.length);
});

test('the men stand on her floor; the voice reaches across the weather deck and aloft, not from below', () => {
  const net = routeNetwork();
  for (const who of TAKERS) assert.ok(standable(net, postOf(who), []), `${who} stands at ${JSON.stringify(postOf(who))}`);
  assert.ok(standable(net, midshipmanStart(), []));
  assert.equal(inVoice(quarterdeck(), postOf('master')), true);
  assert.equal(inVoice(quarterdeck(), postOf('lookout')), true);
  assert.equal(inVoice({ space: 'cabin', along: -7, across: 0 }, postOf('master')), false);
  assert.equal(inVoice(null, postOf('master')), false);
});

test('the midshipman runs a message to the man and gives it when he gets there', () => {
  const mid = new Midshipman(midshipmanStart()), order = { kind: 'tack' as const, ship: 0 };
  assert.ok(mid.send({ to: 'master', order }, 0, openShip()));
  let given = null, t = 0;
  const FRAME = 1 / 30, MOST = 20;
  for (; t < MOST && !given; t += FRAME) given = mid.step(FRAME, quarterdeck(), 0, openShip());
  assert.deepEqual(given, { to: 'master', order });
  const w = mid.where();
  assert.ok(floorApart(w, deliverAt('master')) < 0.5, 'he gives it where he was sent');
  assert.ok(t > 1 && t < 10, `the wheel is a few seconds' run from the quarterdeck (${t.toFixed(1)} s)`);
  assert.equal(mid.away, false);
});
