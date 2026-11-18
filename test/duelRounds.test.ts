/**
 * Rounds of a room's match (docs/design/menu.md, the waiting room and the end card; duel.ts "Rounds"): the match
 * running since the room opened gives way to a fresh one once both captains are ready, the guest follows the host into
 * it and agrees with it, and both tapping Again begins another with a seed of its own.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomSeed, roundSeed, type DuelHub } from '../src/net/duel.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { DuelRoom } from './support/duelRoom.ts';

/** How long the room's first match runs before the captains are ready, and each round after, s. */
const WAIT_SECONDS = 2;
const ROUND_SECONDS = 3;

test('once both captains are ready the host begins a fresh match, and the guest follows it into it and agrees with it', async () => {
  const room = new DuelRoom();
  const { host, guest } = await room.pair();
  room.run(WAIT_SECONDS * STEPS_PER_SECOND);
  const waited = host.state.tick;
  assert.equal(host.round, 0);
  // The host alone ready: nothing begins, but the guest hears that he is.
  host.ready();
  room.run(STEPS_PER_SECOND);
  assert.equal(host.round, 0);
  assert.deepEqual(guest.readyPlayers, [host.me]);
  guest.ready();
  room.run(1);
  assert.equal(host.round, 1);
  assert.ok(host.state.tick < waited, `the host's match begins again (tick ${host.state.tick})`);
  room.run(ROUND_SECONDS * STEPS_PER_SECOND);
  assert.equal(guest.round, 1);
  assert.deepEqual(guest.readyPlayers, []);
  assert.ok(guest.state.tick < waited + ROUND_SECONDS * STEPS_PER_SECOND, `the guest's too (tick ${guest.state.tick})`);
  assert.equal(guest.mine, 1);
  // The guest runs the new match on himself and ends at the host's hash.
  const tick = guest.state.tick;
  room.run(STEPS_PER_SECOND);
  assert.equal(guest.drifts, 0);
  const { differ } = room.agreement(0, 1);
  assert.deepEqual(differ.filter((t) => t > tick), []);
});

test('Again: both ready after a round begins another with its own seed; a ready of a round gone by and one who left count for nothing', async () => {
  const room = new DuelRoom();
  const { host, guest } = await room.pair();
  host.ready();
  guest.ready();
  room.run(ROUND_SECONDS * STEPS_PER_SECOND);
  assert.equal(guest.round, 1);
  assert.notEqual(roundSeed(host.code, 2), roomSeed(host.code));
  // A guest's ready of round 0, come late, does not count for round 1.
  (guest as unknown as { hub: DuelHub }).hub.send({ kind: 'ready', round: 0 }, host.me);
  host.ready();
  room.run(STEPS_PER_SECOND);
  assert.equal(host.round, 1);
  guest.ready();
  room.run(ROUND_SECONDS * STEPS_PER_SECOND);
  assert.equal(host.round, 2);
  assert.equal(guest.round, 2);
  // Her captain gone: the host's ready waits, and nothing begins.
  host.ready();
  guest.close();
  room.run(STEPS_PER_SECOND);
  assert.equal(host.round, 2);
});
