/**
 * The scenario (docs/design/scenarios.md, stage 1): the edits the dialog makes, what a kept scenario reads back as,
 * what the simulation can run of one yet, and where its fleets start.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addShip, DEFAULT_SCENARIO, LEAST_SHIPS, limitOf, MOST_SHIPS, navyOfShip, PRESETS, PRESET_NAMES, playOf, playerShips, readScenario, removeShip,
  setCommand, setNavy, setSide, setSideNavy, sidesIn, youFirst, youShip, type Scenario,
} from '../src/sim/scenario.ts';
import { ABREAST, duelStart, fleetStart } from '../src/sim/start.ts';

const apart = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

test('the default is you against a seasoned computer captain, in the two navies, and can be run', () => {
  assert.equal(DEFAULT_SCENARIO.ships.length, 2);
  assert.equal(youShip(DEFAULT_SCENARIO), 0);
  assert.deepEqual(sidesIn(DEFAULT_SCENARIO), [0, 1]);
  assert.equal(navyOfShip(DEFAULT_SCENARIO, 0), 'british');
  assert.equal(navyOfShip(DEFAULT_SCENARIO, 1), 'french');
  assert.equal(limitOf(DEFAULT_SCENARIO), null);
  assert.equal(playOf(DEFAULT_SCENARIO), 'alone');
});

test('the presets are the old three ways to start and a fleet action', () => {
  assert.deepEqual(PRESET_NAMES.map((n) => playOf(PRESETS[n])), ['alone', 'room', 'watch', 'alone']);
  assert.deepEqual(playerShips(PRESETS.room), [1]);
  assert.equal(PRESETS.fleets.ships.length, 6);
  assert.deepEqual(PRESET_NAMES.map((n) => limitOf(PRESETS[n])), [null, null, null, 'more ships']);
});

test('ships are added on the smaller side up to eight and removed down to two', () => {
  let sc: Scenario = DEFAULT_SCENARIO;
  sc = addShip(sc);
  assert.deepEqual(sc.ships.map((s) => s.side), [0, 1, 0]);
  sc = addShip(sc);
  assert.deepEqual(sc.ships.map((s) => s.side), [0, 1, 0, 1]);
  for (let i = 0; i < 10; i++) sc = addShip(sc);
  assert.equal(sc.ships.length, MOST_SHIPS);
  assert.equal(addShip(sc), sc);
  for (let i = 0; i < 10; i++) sc = removeShip(sc, sc.ships.length - 1);
  assert.equal(sc.ships.length, LEAST_SHIPS);
});

test('only one ship is yours: taking another hands the first to a computer captain', () => {
  const sc = setCommand(addShip(DEFAULT_SCENARIO), 2, { kind: 'you' });
  assert.equal(youShip(sc), 2);
  assert.deepEqual(sc.ships[0]!.command, { kind: 'computer', skill: 'seasoned' });
  assert.equal(sc.ships.filter((s) => s.command.kind === 'you').length, 1);
});

test('a navy is a side\'s, and a ship may wear another', () => {
  let sc = setNavy(DEFAULT_SCENARIO, 1, 'british');
  assert.equal(navyOfShip(sc, 1), 'british');
  assert.equal(sc.ships[1]!.navy, 'british');
  assert.equal(limitOf(sc), 'same navy');
  sc = setNavy(sc, 1, 'french');
  assert.equal(sc.ships[1]!.navy, null, 'her side\'s own navy clears the override');
  sc = setSideNavy(sc, 1, 'british');
  assert.equal(navyOfShip(sc, 1), 'british', 'a ship without a navy of her own follows her side');
  assert.equal(navyOfShip(setNavy(sc, 1, 'french'), 1), 'french');
  assert.equal(setSide(sc, 0, 4), sc, 'there are four sides');
});

test('what cannot be run yet is named: one side, more ships, a room with no ship of the host\'s', () => {
  assert.equal(limitOf(setSide(DEFAULT_SCENARIO, 1, 0)), 'one side');
  assert.equal(limitOf(addShip(DEFAULT_SCENARIO)), 'more ships');
  assert.equal(limitOf(setCommand(PRESETS.room, 0, { kind: 'computer', skill: 'green' })), 'host ship');
});

test('the ship you command goes first, the others keep their order', () => {
  const sc = setCommand(PRESETS.watch, 1, { kind: 'you' }), first = youFirst(sc);
  assert.equal(youShip(first), 0);
  assert.deepEqual(first.ships.map((s) => s.side), [1, 0]);
  assert.equal(youFirst(DEFAULT_SCENARIO), DEFAULT_SCENARIO);
});

test('a kept scenario reads back as it was, and anything wrong falls back', () => {
  for (const n of PRESET_NAMES) assert.deepEqual(readScenario(JSON.parse(JSON.stringify(PRESETS[n]))), PRESETS[n]);
  assert.deepEqual(readScenario(null), DEFAULT_SCENARIO);
  assert.deepEqual(readScenario({ ships: [{ side: 0, command: { kind: 'you' } }] }), DEFAULT_SCENARIO, 'one ship is not a scenario');
  const wild = readScenario({ sideNavies: ['dutch', 'french'], ships: Array.from({ length: 12 }, (_, i) => ({ side: i, navy: 'dutch', command: { kind: i === 3 ? 'admiral' : 'you', skill: 'god' } })) });
  assert.equal(wild.ships.length, MOST_SHIPS);
  assert.equal(wild.sideNavies[0], 'british');
  assert.equal(wild.ships.filter((s) => s.command.kind === 'you').length, 1);
  assert.ok(wild.ships.every((s) => s.side >= 0 && s.side < 4 && s.navy === null));
  assert.deepEqual(wild.ships[3]!.command, { kind: 'computer', skill: 'seasoned' });
});

test('a fleet of one ship against one is the duel from the same seed, to the bit', () => {
  for (let seed = 0; seed < 40; seed++) {
    for (const terms of [{}, { wind: 'light', meet: 'weather' }, { wind: 'strong', meet: 'lee' }] as const) {
      assert.deepEqual(fleetStart(seed, [0, 1], terms), duelStart(seed, terms));
      assert.deepEqual(fleetStart(seed, [3, 2], terms), duelStart(seed, terms), 'any two sides, in the order they appear');
    }
  }
});

test('fleets of two to four sides lie apart: no two ships closer than the spacing, a side keeping together', () => {
  for (const sides of [[0, 0, 1, 1], [0, 0, 0, 1, 1, 1], [0, 1, 2], [0, 1, 2, 3], [0, 0, 1, 1, 2, 2, 3, 3], [0, 1, 0, 1, 2, 3, 2, 3]]) {
    for (let seed = 0; seed < 8; seed++) {
      const setup = fleetStart(seed, sides), ships = setup.ships;
      assert.equal(ships.length, sides.length);
      for (const s of ships) {
        assert.equal(s.canvas, 'battle');
        assert.ok(Math.hypot(s.x, s.z) < 1500, 'within a kilometre and a half of the middle');
      }
      for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
        assert.ok(apart(ships[i]!, ships[j]!) >= ABREAST - 1e-6, `seed ${seed} ${sides.join('')}: ships ${i} and ${j}`);
        if (sides[i] === sides[j]) assert.ok(apart(ships[i]!, ships[j]!) <= (sides.length) * ABREAST, 'a side keeps together');
      }
    }
  }
});

test('a fleet of one side has no enemy and is refused at the start', () => {
  assert.throws(() => fleetStart(1, [0, 0]), RangeError);
});
