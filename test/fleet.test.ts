/**
 * Sides at sea (docs/design/scenarios.md, stage 2): a ship's enemies are the ships of the other sides, nearest first, her
 * foe the nearest; her guns each take the nearest enemy their side faces; the fight ends when one side is left; sailing
 * apart is judged between sides. The duel (two ships of two sides) is unchanged, which end.test.ts and the rest hold.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDamage, type Damage } from '../src/sim/damage.ts';
import { founderTonnes } from '../src/sim/damage/flood.ts';
import { stepFight, winner, winningSide } from '../src/sim/end.ts';
import { enemiesOf, enemyPoses, foeOf, lostNow } from '../src/sim/foes.ts';
import { captainOrders } from '../src/sim/captain/captain.ts';
import { sightOf } from '../src/sim/captain/sight.ts';
import { battery, gunAt } from '../src/sim/guns/guns.ts';
import { PARTING } from '../src/sim/rules/end.ts';
import { startMatch, type ShipStart, type SimState } from '../src/sim/state.ts';
import { step } from '../src/sim/step.ts';
import { musterCrew } from './support/muster.ts';
import './support/warm.ts';

/** Ships lying still in a calm heading east, each at `[x, z]` of side `side[i]`. */
function fleet(sides: readonly number[], at: readonly (readonly [number, number])[]): SimState {
  const ships = at.map(([x, z], i): ShipStart => ({ x, z, heading: Math.PI / 2, canvas: 'bare', side: sides[i]! }));
  const s = startMatch({ seed: 4, windForce: 0, windFrom: 0, ships });
  return { ...s, ships: s.ships.map((sh) => ({ ...sh, crew: musterCrew() })) };
}
const SUNK: Partial<Damage> = { flooded: [founderTonnes(), 0] };
const sunk = (s: SimState, ...which: number[]): SimState => ({ ...s, ships: s.ships.map((sh, i) => (which.includes(i) ? { ...sh, damage: { ...startDamage(), ...SUNK } } : sh)) });

test('a ship starts on the side given, or on a side of her own', () => {
  assert.deepEqual(fleet([0, 0, 1], [[0, 0], [0, 100], [0, 200]]).ships.map((s) => s.side), [0, 0, 1]);
  assert.deepEqual(startMatch({ seed: 1, windForce: 0, windFrom: 0, ships: [{ x: 0, z: 0, heading: 0 }, { x: 0, z: 200, heading: 0 }] }).ships.map((s) => s.side), [0, 1]);
});

test('enemies are the ships of other sides, nearest first; the lost are enemies only when none stands', () => {
  const s = fleet([0, 0, 1, 1, 2], [[0, 0], [0, 50], [0, 400], [0, 300], [0, 200]]);
  assert.deepEqual(enemiesOf(s.ships, 0), [4, 3, 2]);
  assert.deepEqual(enemiesOf(s.ships, 1), [4, 3, 2]);
  assert.equal(foeOf(s.ships, 0), 4);
  assert.equal(foeOf(s.ships, 4), 3, 'her nearest is the 300 m one');
  assert.deepEqual(enemyPoses(s.ships, 0).map((p) => p.z), [200, 300, 400]);
  const down = sunk(s, 4);
  assert.deepEqual(lostNow(down.ships), [false, false, false, false, true]);
  assert.deepEqual(enemiesOf(down.ships, 0), [3, 2], 'the sunk ship is no enemy while others stand');
  assert.deepEqual(enemiesOf(sunk(s, 2, 3, 4).ships, 0), [4, 3, 2], 'with none standing, they are all she has');
  const duel = fleet([0, 1], [[0, 0], [0, 300]]);
  assert.deepEqual([foeOf(duel.ships, 0), foeOf(duel.ships, 1)], [1, 0]);
  assert.equal(foeOf(fleet([0], [[0, 0]]).ships, 0), null, 'alone: no foe');
});

test('each gun takes the nearest enemy its side faces: a broadside to each beam', () => {
  // Heading east, starboard is to the south (+z): one enemy 150 m off each beam, the starboard one nearer.
  const s = fleet([0, 1, 1], [[0, 0], [0, 150], [0, -300]]);
  let state: SimState = { ...s, ships: s.ships.map((sh, i) => (i === 0 ? { ...sh, told: { ...sh.told, quarters: true } } : sh)) };
  const trained = new Set<number>();
  for (let t = 0; t < 40; t++) {
    state = step(state, []).state;
    battery().forEach((p, i) => { if (Math.abs(gunAt(state.ships[0]!.guns, i).trained) > 0) trained.add(Math.sign(p.side)); });
  }
  assert.deepEqual([...trained].sort(), [-1, 1], 'guns of both sides are laid');
});

test('the fight ends when at most one side has a ship that is not lost; its winner is that side', () => {
  const s = fleet([0, 0, 1, 1], [[0, 0], [0, 50], [0, 300], [0, 350]]);
  const ends = (st: SimState) => step(st, []).state.fight.end;
  assert.equal(ends(sunk(s, 0)), null, 'a side with a ship left fights on');
  assert.equal(ends(sunk(s, 0, 2)), null);
  const done = step(sunk(s, 2, 3), []).state;
  assert.deepEqual(done.fight.end?.lost, [null, null, 'sunk', 'sunk']);
  assert.equal(winningSide(done.fight, done.ships), 0);
  assert.equal(winner(done.fight), null, 'two ships stand: no single winner');
  const all = step(sunk(s, 0, 1, 2, 3), []).state;
  assert.equal(winningSide(all.fight, all.ships), null, 'every side lost in a step: drawn');
  // Free for all: three sides, the fight ends when one is left.
  const ffa = fleet([0, 1, 2], [[0, 0], [0, 200], [0, 400]]);
  assert.equal(ends(sunk(ffa, 1)), null);
  const last = step(sunk(ffa, 1, 2), []).state;
  assert.equal(winningSide(last.fight, last.ships), 0);
  assert.equal(winner(last.fight), 0);
});

test('sailing apart is judged between sides: ships of one side close together do not part, nor does a fleet with a side still near', () => {
  const s = fleet([0, 0, 1], [[0, 0], [0, 60], [0, 400]]);
  const away = (st: SimState, dz: readonly number[]) => st.ships.map((sh, i) => ({ ...sh, motion: { ...sh.motion, pose: { ...sh.motion.pose, z: sh.motion.pose.z + dz[i]! } } }));
  // The third ship sails off alone from the other two: the master reports losing her once past the distance.
  const r = stepFight(s.fight, s.ships, away(s, [0, 0, PARTING.losing]), 0);
  assert.deepEqual(r.events.map((e) => e.kind), ['losing']);
  // The same ships, the near one of side 0 staying within reach of side 1: not losing her.
  assert.deepEqual(stepFight(s.fight, s.ships, away(s, [0, PARTING.losing, 0]), 0).events, [], 'the two of side 0 are far apart but each side still has a pair near');
});

test('a computer captain sights the nearest enemy of another side, and gives orders in a fleet', () => {
  const s = fleet([0, 0, 1, 1], [[0, 0], [0, 60], [0, 900], [0, 600]]);
  const sight = sightOf(s, 0, 'master');
  assert.equal(sight.enemy.z, 600, 'the nearer of the two enemies, not her own side');
  assert.equal(sightOf(s, 2, 'master').enemy.z, 60, 'and the other side sees the nearer of his');
  const given = Array.from({ length: 5 }, (_, i) => captainOrders({ ...s, tick: i * 60 }, 0, 'master')).flat();
  assert.ok(given.length > 0, 'the captain takes his ship in hand');
  assert.deepEqual(captainOrders(fleet([0], [[0, 0]]), 0, 'master'), [], 'alone there is no enemy to fight');
});
