/**
 * A room's scenario of more than two ships (docs/design/scenarios.md, stage 4): the host seats the players in the ships a
 * person commands and steps the computer captains of the rest, a guest learns who commands what from the room's meta and
 * runs the same match to the host's hash, whoever becomes host goes on with the computer captains, and the whole state
 * stays inside GameHub's 64 KB for eight ships.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roomScenario, makeSnapshot, snapshotState, type RoomTerms } from '../src/net/wire.ts';
import { readScenario, type Scenario } from '../src/sim/scenario.ts';
import { fleetStart, withSides } from '../src/sim/start.ts';
import { hashState, startMatch } from '../src/sim/state.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { musterCrew } from './support/muster.ts';
import { DuelRoom } from './support/duelRoom.ts';

const ship = (side: number, command: Scenario['ships'][number]['command']): Scenario['ships'][number] => ({ side, navy: null, command, at: null });
/** You and a friend (a player) against two computer captains, two masters. */
const FOUR: Scenario = {
  sideNavies: ['british', 'french', 'british', 'french'],
  ships: [ship(0, { kind: 'you' }), ship(0, { kind: 'player' }), ship(1, { kind: 'computer', skill: 'master' }), ship(1, { kind: 'computer', skill: 'master' })],
};
const SHOWN: RoomTerms = { wind: 'moderate', hour: 10, meet: 'ahead', minutes: 0, navy: 'british', scenario: FOUR };
const SECONDS = 6;

async function fleetRoom() {
  const room = new DuelRoom();
  const host = room.machine('Host', undefined, { scenario: FOUR }), guest = room.machine('Guest');
  await host.create('fleet', SHOWN);
  await room.settle();
  await guest.join(host.code);
  await room.settle();
  return { room, host, guest };
}

test('the room carries the scenario; the host takes the first ship a person commands, the guest the next, the computers none', async () => {
  assert.deepEqual(roomScenario({ terms: SHOWN }), readScenario(FOUR));
  assert.equal(roomScenario({ terms: { ...SHOWN, scenario: undefined } }), null, 'an older room: a duel');
  const { host, guest } = await fleetRoom();
  assert.equal(host.seats, 2);
  assert.equal(guest.seats, 2, 'the guest learned it from the room');
  assert.deepEqual(host.shipCaptains, [host.me, guest.me, null, null]);
  assert.equal([host.mine, guest.mine].join(), '0,1');
  assert.deepEqual(host.state.ships.map((s) => s.side), [0, 0, 1, 1]);
  assert.equal(guest.state.ships.length, 4);
});

test('the host seats the players where he likes: moved, swapped or emptied, until someone is ready', async () => {
  const { room, host, guest } = await fleetRoom();
  assert.deepEqual(host.people.map((p) => p.id).sort(), [host.me, guest.me].sort());
  assert.equal(guest.assign(0, guest.me), false, 'only the host seats');
  assert.equal(host.assign(2, host.me), false, 'a computer\'s ship takes no player');
  assert.equal(host.assign(0, guest.me), true);
  assert.deepEqual(host.shipCaptains, [guest.me, host.me, null, null], 'the one who sat there takes the seat she left');
  await room.settle();
  assert.deepEqual(guest.shipCaptains, [guest.me, host.me, null, null], 'the guest has it');
  assert.equal(guest.mine, 0);
  assert.equal(host.assign(1, null), true);
  assert.deepEqual(host.shipCaptains, [guest.me, null, null, null]);
  host.ready();
  assert.equal(host.assign(1, host.me), false, 'not once someone is ready');
});

test('the host steps the computer captains with the players; the guest runs the same match to the host\'s hash', async () => {
  const { room, host, guest } = await fleetRoom();
  room.run(SECONDS * STEPS_PER_SECOND);
  for (const i of [2, 3]) assert.equal(host.state.ships[i]!.told.quarters, true, `the master of ship ${i} cleared for action`);
  assert.equal(host.state.ships[0]!.told.quarters, false, 'and the players are left to their own captains');
  const { both, differ } = room.agreement(0, 1);
  assert.ok(both >= SECONDS - 2, `hashed together at ${both} seconds`);
  assert.deepEqual(differ, []);
  assert.equal(guest.drifts, 0);
});

test('the host leaving passes the computer captains on to the guest, who goes on commanding them', async () => {
  const { room, host, guest } = await fleetRoom();
  room.run(STEPS_PER_SECOND);
  host.close();
  await room.settle();
  assert.equal(guest.role, 'host');
  assert.deepEqual(guest.shipCaptains, [null, guest.me, null, null], 'the host\'s ship stands free');
  room.run(SECONDS * STEPS_PER_SECOND);
  for (const i of [2, 3]) assert.equal(guest.state.ships[i]!.told.quarters, true, `the master of ship ${i} cleared for action under the new host`);
});

test('eight ships at work stay well inside GameHub\'s 64 KB as sent, and the state comes back whole', () => {
  const sides = [0, 1, 0, 1, 0, 1, 0, 1];
  const state = startMatch(withSides(fleetStart(5, sides), sides));
  const crewed = { ...state, ships: state.ships.map((s) => ({ ...s, crew: musterCrew() })) };
  const snapshot = makeSnapshot(crewed, [0, null, null, null, null, null, null, null], []);
  assert.ok(JSON.stringify(snapshot).length < 64 * 1024 / 2, `${JSON.stringify(snapshot).length} bytes as sent`);
  assert.equal(hashState(snapshotState(snapshot)), hashState(crewed), 'bit for bit');
});
