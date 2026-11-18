/**
 * Two captains through the fake hub (implementation plan N3.7): a guest runs the host's match on through the host's
 * orders and ends at the host's hash; late joiners, jittery networks and a room of another build.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DuelSession, MOST_STEPS, SNAPSHOT_STEPS } from '../src/net/duel.ts';
import type { Order } from '../src/sim/orders.ts';
import type { SimEvent } from '../src/sim/step.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { Rng } from '@futuremagic/core';
import { BUILD, DuelRoom } from './support/duelRoom.ts';
import { orderScript } from './support/match.ts';

const SECONDS = 12;

/** A room with a host and a guest in it, the match begun. */
async function twoInARoom(): Promise<{ room: DuelRoom; host: DuelSession; guest: DuelSession }> {
  const room = new DuelRoom();
  const host = room.machine('Host'), guest = room.machine('Guest');
  await host.create('duel');
  await room.settle();
  await guest.join(host.code.toLowerCase());
  await room.settle();
  return { room, host, guest };
}

/** Gives each scripted order to the captain of its ship, at its tick on the host's clock. */
function scripted(host: DuelSession, guest: DuelSession, seed: number, seconds: number): (i: number) => void {
  const script = orderScript(seed, seconds);
  return () => {
    const tick = host.state.tick;
    for (const entry of script) if (entry.tick === tick) for (const o of entry.orders) (o.ship === 0 ? host : guest).give(o);
  };
}

test('the host has the first ship and the guest the second; the guest runs the match to the host\'s hash at every second', async () => {
  const { room, host, guest } = await twoInARoom();
  assert.equal(host.role, 'host');
  assert.equal(guest.role, 'guest');
  assert.equal(host.mine, 0);
  assert.equal(guest.mine, 1);
  assert.equal(guest.state.ships.length, 2);
  room.run(SECONDS * STEPS_PER_SECOND, scripted(host, guest, 7, SECONDS));
  const { both, differ } = room.agreement(0, 1);
  assert.ok(both >= SECONDS - 2, `hashed together at ${both} seconds`);
  assert.deepEqual(differ, []);
  assert.equal(guest.drifts, 0);
  // The guest runs a little behind the host, never ahead.
  assert.ok(guest.state.tick <= host.state.tick && host.state.tick - guest.state.tick < STEPS_PER_SECOND, `host ${host.state.tick}, guest ${guest.state.tick}`);
  // The guest made every step itself (no state taken from the host after the first).
  assert.ok(guest.stepsMade >= guest.state.tick - SNAPSHOT_STEPS, `${guest.stepsMade} steps made`);
});

test('a guest\'s order is carried out on the host for his ship, and he hears it refused or done as the host does', async () => {
  const { room, host, guest } = await twoInARoom();
  const heard: SimEvent[] = [], hostHeard: SimEvent[] = [];
  guest.on('events', (e) => heard.push(...e));
  host.on('events', (e) => hostHeard.push(...e));
  room.run(STEPS_PER_SECOND);
  guest.give({ kind: 'sail', ship: 0, canvas: 'plain' });
  guest.give({ kind: 'sail', ship: 1, canvas: 'royals' as 'plain' });
  assert.equal(guest.pending.length, 2);
  // The orders reach the host, are stepped there and come back.
  room.run(STEPS_PER_SECOND);
  assert.equal(guest.pending.length, 0, 'stepped and acknowledged');
  // Named to the guest's own ship whatever it said: the host's ship was not touched.
  assert.equal(host.state.ships[1]!.told.canvas, 'plain');
  assert.equal(host.state.ships[0]!.told.canvas, 'battle');
  assert.equal(guest.state.ships[1]!.told.canvas, 'plain');
  const refusal = (e: readonly SimEvent[]) => e.filter((x) => x.kind === 'refused').map((x) => x.kind === 'refused' && `${x.tick} ${x.order.ship} ${x.reason}`);
  assert.equal(refusal(heard).length, 1);
  assert.match(String(refusal(heard)[0]), /^\d+ 1 there is no "royals sail"/);
  assert.deepEqual(refusal(heard), refusal(hostHeard));
});

test('a late joiner starts from the host\'s snapshot and agrees with it', async () => {
  const room = new DuelRoom();
  const host = room.machine('Host');
  await host.create('duel');
  await room.settle();
  room.run(3 * STEPS_PER_SECOND, scripted(host, host, 11, 3));
  const guest = room.machine('Late');
  await guest.join(host.code);
  await room.settle();
  assert.equal(guest.role, 'guest');
  assert.equal(guest.mine, 1);
  // It starts from the room's history (the last snapshot and the deltas after it) and is soon close behind the host.
  room.run(STEPS_PER_SECOND);
  assert.ok(host.state.tick - guest.state.tick < STEPS_PER_SECOND, `host ${host.state.tick}, guest ${guest.state.tick}`);
  room.run(3 * STEPS_PER_SECOND, scripted(host, guest, 12, 4 + 3));
  const { both, differ } = room.agreement(0, 1);
  assert.ok(both >= 2, `hashed together at ${both} seconds`);
  assert.deepEqual(differ, []);
});

test('through a network that holds messages back by turns the guest still agrees, never runs ahead and draws smoothly between steps', async () => {
  const { room, host, guest } = await twoInARoom();
  const rng = new Rng(3);
  let past = 0, smooth = true;
  room.run(SECONDS * STEPS_PER_SECOND, (i) => {
    scripted(host, guest, 9, SECONDS)(i);
    const d = guest.drawn();
    if (d.time < past - 1e-9) smooth = false;
    past = d.time;
    assert.ok(d.f >= 0 && d.f <= 1);
  }, () => rng.chance(0.3));
  const { both, differ } = room.agreement(0, 1);
  assert.ok(both >= SECONDS - 3, `hashed together at ${both} seconds`);
  assert.deepEqual(differ, []);
  assert.ok(smooth, 'the drawn time never goes back');
});

test('a guest whose tab slept jumps to the host\'s latest snapshot instead of racing through every step', async () => {
  const { room, host, guest } = await twoInARoom();
  const pump = guest.pump.bind(guest);
  guest.pump = () => {};
  room.run(6 * STEPS_PER_SECOND);
  guest.pump = pump;
  const before = guest.stepsMade;
  room.run(1);
  assert.ok(guest.stepsMade - before <= MOST_STEPS);
  assert.ok(host.state.tick - guest.state.tick < 2 * STEPS_PER_SECOND, `host ${host.state.tick}, guest ${guest.state.tick}`);
  room.run(2 * STEPS_PER_SECOND);
  assert.deepEqual(room.agreement(0, 1).differ, []);
});

test('a page of another build does not join the room, and says why', async () => {
  const room = new DuelRoom();
  const host = room.machine('Host');
  await host.create('duel');
  await room.settle();
  const other = room.machine('Old', '0.099');
  await other.join(host.code);
  await room.settle();
  assert.equal(other.role, 'refused');
  assert.match(other.problem, /version 0\.100, this page 0\.099/);
  assert.equal(other.started, false);
  other.give({ kind: 'tack', ship: 1 } as Order);
  room.run(2);
  assert.equal(room.server.room(host.code)!.players.length, 1, 'it left the room');
});

test('alone, the page is its own host: the match steps by the clock and the captain\'s orders are carried out', async () => {
  let t = 0;
  const solo = new DuelSession({ build: BUILD, now: () => t });
  assert.equal(solo.role, 'solo');
  assert.equal(solo.mine, 0);
  assert.equal(solo.state.tick, 0);
  solo.give({ kind: 'sail', ship: 0, canvas: 'plain' });
  t = 1;
  solo.pump();
  assert.equal(solo.state.tick, STEPS_PER_SECOND);
  assert.equal(solo.state.ships[0]!.told.canvas, 'plain');
  await assert.rejects(solo.create('x'), /no room/);
});

test('alone, the address\'s wind wins over the start\'s own; the rest of the start stays', () => {
  const own = new DuelSession({ build: BUILD, now: () => 0, seed: 7 }).state.wind;
  const force = own.windForce === 6 ? 2 : 6;
  const asked = new DuelSession({ build: BUILD, now: () => 0, seed: 7, windForce: force }).state.wind;
  assert.equal(asked.windForce, force);
  assert.equal(asked.windFrom, own.windFrom, 'from the same quarter');
});
