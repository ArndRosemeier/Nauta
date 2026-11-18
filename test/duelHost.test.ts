/**
 * The host's side of the duel through the fake hub (implementation plan N3.7): a change of host loses nothing, orders
 * from another machine are checked (refused, never thrown), the host's state wins over a guest's that drifted, and
 * what the host sends stays inside GameHub's limits and the plan's network budget.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELTA_STEPS, type DuelSession } from '../src/net/duel.ts';
import type { Order } from '../src/sim/orders.ts';
import { hashState, type SimState } from '../src/sim/state.ts';
import type { SimEvent } from '../src/sim/step.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { DuelRoom } from './support/duelRoom.ts';

/** GameHub's limit of messages a second per player, and the plan's network budget: 20 states a second of 16 KB at most. */
const HUB_MESSAGES_PER_SECOND = 60;
const STATES_PER_SECOND = 20;
const STATE_BYTES = 16 * 1024;

async function twoInARoom(): Promise<{ room: DuelRoom; host: DuelSession; guest: DuelSession }> {
  const room = new DuelRoom();
  const host = room.machine('Host'), guest = room.machine('Guest');
  await host.create('duel');
  await room.settle();
  await guest.join(host.code);
  await room.settle();
  return { room, host, guest };
}

/** The two courses the guest orders, rad: near each other, so each is reached in a moment, without wearing round. */
const FIRST_COURSE = 1;
const SECOND_COURSE = 1.1;
/** Long enough for her to come to a course ordered (about 2.5 s), s. */
const STEER_SECONDS = 4;
/** The orders given to a ship that were carried out, by kind, from the events one machine saw. */
const doneOf = (events: readonly SimEvent[], ship: number) => events.filter((e) => e.kind === 'done' && e.ship === ship).map((e) => e.kind === 'done' && e.order.kind);

test('the host leaving passes hosting to the guest, who goes on from every step the old host passed on and steps each of his orders once', async () => {
  const { room, host, guest } = await twoInARoom();
  const heard: SimEvent[] = [], hostHashes = new Map<number, string>();
  guest.on('events', (e) => heard.push(...e));
  host.on('events', () => hostHashes.set(host.state.tick, hashState(host.state)));
  room.run(STEPS_PER_SECOND);
  // An order the old host steps and acknowledges...
  guest.give({ kind: 'steer', ship: 1, heading: FIRST_COURSE });
  // ...and carries out, run on to a step between two deltas, so the host has stepped a little it never sent...
  room.run(STEER_SECONDS * STEPS_PER_SECOND + 2);
  assert.equal(guest.pending.length, 0);
  assert.notEqual(host.state.tick % DELTA_STEPS, 0);
  // ...and one it never gets: the host goes before the message is handed out.
  guest.give({ kind: 'steer', ship: 1, heading: SECOND_COURSE });
  const lastTick = host.state.tick - (host.state.tick % DELTA_STEPS), lastHash = hostHashes.get(lastTick);
  host.close();
  await room.settle();
  assert.equal(guest.role, 'host');
  assert.deepEqual(guest.shipCaptains, [null, guest.me], 'the old host\'s ship has no captain now; she sails on');
  // The new host ran on through every step the old one sent: it stands at the old host's last delta, with its hash.
  assert.equal(guest.state.tick, lastTick);
  assert.equal(hashState(guest.state), lastHash);
  room.run(STEER_SECONDS * STEPS_PER_SECOND);
  assert.ok(guest.state.tick > lastTick + (STEER_SECONDS - 1) * STEPS_PER_SECOND, 'the match goes on');
  assert.deepEqual(doneOf(heard, 1), ['steer', 'steer'], 'each order carried out once');
  assert.equal(guest.state.ships[1]!.told.helm.heading, SECOND_COURSE);
});

test('a new host takes up the old one\'s state and acknowledgements, so a guest\'s order sent again is not stepped twice', async () => {
  const room = new DuelRoom();
  const a = room.machine('A'), b = room.machine('B');
  await a.create('duel');
  await room.settle();
  await b.join(a.code);
  await room.settle();
  room.run(STEPS_PER_SECOND);
  b.give({ kind: 'sail', ship: 1, canvas: 'plain' });
  room.run(STEPS_PER_SECOND);
  // A third machine cannot join a room of two.
  const c = room.machine('C');
  await assert.rejects(c.join(a.code), /room_full/);
  // The host goes; B takes over with its acknowledgement of its own order, and does not step it again.
  a.close();
  await room.settle();
  const given = b.state.ships[1]!.told.given.length;
  room.run(2);
  assert.ok(b.state.ships[1]!.told.given.length <= given, 'nothing given again');
  assert.equal(b.pending.length, 0);
});

test('a guest who becomes host after the old host left, and a new guest joining him, play on together', async () => {
  const { room, host, guest } = await twoInARoom();
  room.run(STEPS_PER_SECOND);
  host.close();
  await room.settle();
  room.run(STEPS_PER_SECOND);
  const third = room.machine('Third');
  await third.join(guest.code);
  await room.settle();
  assert.equal(third.role, 'guest');
  assert.equal(third.mine, 0, 'he takes the ship that has no captain');
  room.run(4 * STEPS_PER_SECOND, (i) => { if (i === STEPS_PER_SECOND) third.give({ kind: 'sail', ship: 0, canvas: 'plain' }); });
  assert.equal(guest.state.ships[0]!.told.canvas, 'plain');
  assert.deepEqual(room.agreement(1, 2).differ, []);
});

test('orders from another machine are checked: junk is refused or dropped, never thrown, and a guest commands only his own ship', async () => {
  const { room, host, guest } = await twoInARoom();
  const heard: SimEvent[] = [];
  host.on('events', (e) => heard.push(...e));
  // The guest's connection sends what a broken or hostile page might.
  const send = (data: unknown) => (guest as unknown as { hub: { send: (d: unknown, to?: number) => void } }).hub.send(data, host.me);
  send(null);
  send('steer');
  send({ kind: 'mutiny' });
  send({ kind: 'orders', orders: 'all' });
  send({ kind: 'orders', orders: [null, { seq: 'x' }, { seq: 1, order: 'tack' }, { seq: 2, order: { kind: 'steer', heading: 'north' } }, { seq: 3, order: { kind: 'steer', ship: 0, heading: 2, extra: 'x'.repeat(1000) } }, { seq: 3, order: { kind: 'tack' } }, { seq: 4, order: { kind: 'sail', canvas: { a: 1 } } }] });
  assert.doesNotThrow(() => room.run(STEPS_PER_SECOND));
  // (A course that makes her wear is answered in words too, as taken: not one of the refusals here.)
  const refused = heard.filter((e) => e.kind === 'refused' && !/^wearing round/.test(e.reason)).map((e) => e.kind === 'refused' && [e.order.ship, e.reason]);
  assert.equal(refused.length, 3);
  for (const r of refused) assert.equal((r as [number, string])[0], 1, 'named to the sender\'s ship');
  assert.match(String(refused[0]), /no order ""/);
  assert.match(String(refused[1]), /course is not a number/);
  assert.match(String(refused[2]), /no "null sail"/);
  // Seq 3 named ship 0 and carried junk: it was stepped for ship 1 alone, cut to an order's fields; the second seq 3 was dropped.
  assert.ok(Math.abs(host.state.ships[1]!.told.helm.heading - 2) < 1e-9 || host.state.ships[1]!.told.helm.by !== 0);
  assert.equal(host.state.ships[0]!.told.given.length, 0, 'the host\'s ship took no order');
  assert.deepEqual(room.agreement(0, 1).differ, [], 'the guest still agrees');
});

test('a guest whose state drifted from the host\'s (another engine\'s last bit) takes the host\'s at the next snapshot', async () => {
  const { room, host, guest } = await twoInARoom();
  room.run(STEPS_PER_SECOND);
  const inside = guest as unknown as { known: SimState };
  const s = inside.known, ship = s.ships[0]!;
  inside.known = { ...s, ships: [{ ...ship, motion: { ...ship.motion, pose: { ...ship.motion.pose, x: ship.motion.pose.x + 1e-12 } } }, s.ships[1]!] };
  room.run(2 * STEPS_PER_SECOND);
  assert.equal(guest.drifts, 1);
  // From the snapshot on they agree again.
  const tick = guest.state.tick;
  room.run(STEPS_PER_SECOND);
  const later = [...room.hashes[1]!.keys()].filter((t) => t > tick);
  assert.ok(later.length >= 1);
  for (const t of later) assert.equal(room.hashes[1]!.get(t), room.hashes[0]!.get(t));
  void host;
});

test('what the host sends fits GameHub\'s limits and the plan\'s network budget', async () => {
  const { room, host, guest } = await twoInARoom();
  const seconds = 10;
  room.run(seconds * STEPS_PER_SECOND, (i) => { if (i % STEPS_PER_SECOND === 0) { host.give({ kind: 'away', ship: 0 } as Order); guest.give({ kind: 'up', ship: 1 } as Order); } });
  const sent = room.server.sent;
  assert.ok((sent.state + sent.delta) / seconds < HUB_MESSAGES_PER_SECOND / 2, `${sent.state + sent.delta} messages from the host in ${seconds} s`);
  assert.ok(sent.state / seconds <= STATES_PER_SECOND);
  assert.ok(sent.stateBytes < STATE_BYTES, `a state is ${sent.stateBytes} bytes`);
  assert.ok(sent.msg <= seconds + 1, `${sent.msg} orders from the guest`);
});
