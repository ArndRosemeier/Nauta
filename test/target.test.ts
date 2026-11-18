/**
 * The captain's choice of enemy (scenarios stage 6b): the order "lay on ship N" is a wish; while that ship stands as an
 * enemy her guns and the master go for her, else for the nearest. And the gunner's fan offers the ring only with a choice.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDamage, type Damage } from '../src/sim/damage.ts';
import { founderTonnes } from '../src/sim/damage/flood.ts';
import { enemiesOf, foeOf } from '../src/sim/foes.ts';
import { malformed, parseOrder } from '../src/sim/orders.ts';
import { startMatch, type ShipStart, type SimState } from '../src/sim/state.ts';
import { cleanOrder } from '../src/net/wire.ts';
import { fanItems, fanSlots } from '../src/app/fanOrders.ts';
import { musterCrew } from './support/muster.ts';
import './support/warm.ts';

/** Ships lying still heading east at `[x, z]`, of sides `sides`. */
function fleet(sides: readonly number[], at: readonly (readonly [number, number])[]): SimState {
  const ships = at.map(([x, z], i): ShipStart => ({ x, z, heading: Math.PI / 2, canvas: 'bare', side: sides[i]! }));
  const s = startMatch({ seed: 4, windForce: 0, windFrom: 0, ships });
  return { ...s, ships: s.ships.map((sh) => ({ ...sh, crew: musterCrew() })) };
}
const SUNK: Partial<Damage> = { flooded: [founderTonnes(), 0] };
const told = (s: SimState, ship: number, target: number | null): SimState => ({ ...s, ships: s.ships.map((sh, i) => (i === ship ? { ...sh, told: { ...sh.told, target } } : sh)) });

test('the target is the foe while she stands and is an enemy; the nearest otherwise', () => {
  const s = fleet([0, 1, 1, 2], [[0, 0], [0, 200], [0, 400], [0, 300]]);
  assert.equal(foeOf(s.ships, 0), 1);
  assert.deepEqual(enemiesOf(told(s, 0, 2).ships, 0), [2, 1, 3], 'the wished ship first, the rest nearest first');
  assert.equal(foeOf(told(s, 0, 0).ships, 0), 1, 'no ship fights herself');
  const lost = { ...s, ships: s.ships.map((sh, i) => (i === 2 ? { ...sh, damage: { ...startDamage(), ...SUNK } } : sh)) };
  assert.equal(foeOf(told(lost, 0, 2).ships, 0), 1, 'a lost ship is not gone for while others stand');
  const friend = fleet([0, 0, 1], [[0, 0], [0, 100], [0, 300]]);
  assert.equal(foeOf(told(friend, 0, 1).ships, 0), 2, 'a friend is no target');
});

test('the order is given in words and malformed for a ship there is not', () => {
  const s = fleet([0, 1, 2], [[0, 0], [0, 200], [0, 400]]);
  assert.deepEqual(parseOrder('lay on ship 3', 0), { kind: 'target', ship: 0, at: 2 });
  assert.deepEqual(parseOrder('lay on the nearest', 0), { kind: 'target', ship: 0, at: null });
  assert.equal(malformed({ kind: 'target', ship: 0, at: 9 }), 'there is no such ship');
  assert.equal(s.ships[0]!.told.target, null, 'she starts with no wish');
  // A guest's gunnery orders keep their fields over the wire.
  assert.deepEqual(cleanOrder({ kind: 'target', at: 2 }, 1), { kind: 'target', ship: 1, at: 2 });
  assert.deepEqual(cleanOrder({ kind: 'aim', at: 'rigging' }, 1), { kind: 'aim', ship: 1, at: 'rigging' });
  assert.deepEqual(cleanOrder({ kind: 'shot', shot: 'chain' }, 1), { kind: 'shot', ship: 1, shot: 'chain' });
});

test('the gunner\'s fan offers the ring with two enemies standing, each ship by her compass point and range', () => {
  const duel = fleet([0, 1], [[0, 0], [0, 200]]);
  assert.ok(!fanItems('gunner', duel, 0).some((i) => i.id === 'target'), 'a duel has nothing to choose');
  const s = fleet([0, 1, 2], [[0, 0], [0, 200], [1500, 0]]);
  const ring = fanItems('gunner', s, 0).find((i) => i.id === 'target')!;
  assert.equal(ring.act.kind, 'ring');
  const items = (ring.act as { items: readonly { text?: string; word: string }[] }).items;
  assert.deepEqual(items.map((i) => i.text ?? i.word), ['fanTargetNearest', 'S · 200 m', 'E · 1.5 km']);
  assert.equal(fanSlots(fanItems('gunner', told(s, 0, 2), 0), told(s, 0, 2), 0).find((x) => x.item.id === 'target')!.on, true, 'the ring shows what is told');
});
