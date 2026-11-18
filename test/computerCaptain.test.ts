/**
 * The computer captain (implementation plan N7.1): he gives only orders a ship takes, the same on every machine and
 * from nothing but the match's state; he looks round as often as his skill says; he beats to quarters, loads and fires
 * by his ranges; he sees to water, fire and wreckage; he closes for the weather position, lays a broadside at his range,
 * turns away before the ships touch; and beaten, he strikes (asked twice). Whole duels are `check:captains`'.
 *
 * Each from a state built for the purpose (CHECKS.md), at most a few seconds of steps a test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleDiff } from '@futuremagic/core';
import { DuelSession } from '../src/net/duel.ts';
import { readParams } from '../src/app/params.ts';
import { captainOrders } from '../src/sim/captain/captain.ts';
import { sailableOn, wantedHeading } from '../src/sim/captain/helm.ts';
import { sightOf } from '../src/sim/captain/sight.ts';
import { startDamage, type Damage } from '../src/sim/damage.ts';
import { giveOrder, type Order } from '../src/sim/orders.ts';
import { HARMS } from '../src/sim/rules/damage.ts';
import { CLOSE_HAULED } from '../src/sim/rules/sailing.ts';
import { CLOSEST, SKILL, SKILLS, STRIKE_AGAIN, type Skill } from '../src/sim/rules/captain.ts';
import { beaten, lostHow } from '../src/sim/end.ts';
import { COMPLEMENT } from '../src/sim/rules/crew.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { duelStart } from '../src/sim/start.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { DEGREE, KNOT, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { meanWind } from '../src/sim/wind.ts';

/** The wind's bearing in these states: from the west. */
const WEST = 270 * DEGREE;
/**
 * Two ships in a force 4 from the west: the first at the origin heading north at 4 knots, the second at `at` (x east,
 * z south, m) heading `heading`; the first with the damage `damage`.
 */
function pair(at: [number, number], heading = 0, damage: Partial<Damage> = {}): SimState {
  const s = startMatch({ seed: 21, windForce: 4, windFrom: WEST, ships: [{ x: 0, z: 0, heading: 0, speed: 4 * KNOT }, { x: at[0], z: at[1], heading, speed: 4 * KNOT }] });
  return { ...s, ships: s.ships.map((sh, i) => (i === 0 ? { ...sh, damage: { ...startDamage(), ...damage } } : sh)) };
}

/** The orders of the first ship's captain at his first look (tick 0 is one for ship 0 at every skill). */
const firstLook = (s: SimState, skill: Skill = 'master'): Order[] => captainOrders(s, 0, skill);
const kinds = (orders: readonly Order[]) => orders.map((o) => o.kind);
/**
 * His orders given to his ship as the step would give them (orders.ts `giveOrder`), without stepping the match: he goes
 * by the state alone, so the tests move only what he reads. Fails on an order she refuses.
 */
function tell(s: SimState, orders: readonly Order[]): SimState {
  const moment = { tick: s.tick, wind: meanWind(s.wind, s.tick / STEPS_PER_SECOND), force: s.wind.windForce };
  let ships = s.ships;
  for (const o of orders) {
    const ship = ships[o.ship]!, answer = giveOrder(ship.told, ship.sailing, o, moment);
    assert.equal(answer.refused, false, `${o.kind} refused: ${answer.reason}`);
    ships = ships.map((sh, i) => (i === o.ship ? { ...sh, told: answer.told } : sh));
  }
  return { ...s, ships };
}

test('nothing once the fight is over', () => {
  const over = startMatch(duelStart(1));
  assert.deepEqual(captainOrders({ ...over, fight: { ...over.fight, end: { tick: 0, lost: [null, null] } } }, 0, 'master'), []);
});

test('he looks round as often as his skill says, gives nothing between his looks, the same orders from the same state, none refused', () => {
  for (const skill of SKILLS) {
    let s = pair([1200, 0]), looks = 0;
    const steps = Math.round(SKILL.green.look * STEPS_PER_SECOND) * 2;
    for (let k = 0; k < steps; k++) {
      // He goes by the state alone, so the clock is moved on without stepping between his orders.
      s = { ...s, tick: k };
      const orders = captainOrders(s, 0, skill);
      if (orders.length === 0) continue;
      looks++;
      assert.deepEqual(captainOrders(s, 0, skill), orders, 'the same state, the same orders');
      assert.equal(s.tick % Math.round(SKILL[skill].look * STEPS_PER_SECOND), 0, `${skill}: orders only at a look`);
      s = tell(s, orders);
    }
    assert.ok(looks >= 1, `${skill}: he gave orders at his first look`);
  }
});

test('the guns: quarters and opening fire by his ranges, grape close in, round shot at her hull farther off', () => {
  // A green captain beats to quarters only inside his range for it; a master at once.
  assert.ok(!kinds(firstLook(pair([0, -1400]), 'green')).includes('quarters'));
  assert.ok(kinds(firstLook(pair([0, -1400]), 'master')).includes('quarters'));
  // Abeam to starboard at 300 m a master opens fire, holding for his word; a green captain fires as they bear.
  assert.deepEqual(kinds(firstLook(pair([300, 0]))).filter((k) => ['quarters', 'hold', 'bear'].includes(k)), ['quarters', 'hold']);
  assert.ok(kinds(firstLook(pair([300, 0]), 'green')).includes('bear'));
  // Inside his grape range a master loads grape at her deck; a green captain keeps round shot at her hull.
  const near = SKILL.master.grape * (1 - 1 / 5);
  const close = firstLook(pair([near, 0]));
  assert.ok(close.some((o) => o.kind === 'shot' && o.shot === 'grape') && close.some((o) => o.kind === 'aim' && o.at === 'deck'));
  assert.ok(!firstLook(pair([near, 0]), 'green').some((o) => o.kind === 'shot'));
  // Out of his range he does not open fire (the guns stand loaded for when it counts).
  assert.ok(!kinds(firstLook(pair([900, 0]))).some((k) => k === 'bear' || k === 'hold'));
});

test('her life: pumps once the water passes his mark, a fire party at a fire, the wreckage cut away, the carpenter plugging', () => {
  const space = shipPlan().spaces.findIndex((sp) => sp.id === 'messdeck');
  const hurt: Partial<Damage> = { flooded: [2, 2], fires: [{ space, size: 0.05 }], alongside: [2] };
  assert.deepEqual(kinds(firstLook(pair([1200, 0], 0, hurt))).filter((k) => ['pumps', 'fires', 'wreckage'].includes(k)), ['pumps', 'fires', 'wreckage']);
  // A green captain waits for more water and for the fire to take hold; he cuts the wreckage away all the same.
  assert.deepEqual(kinds(firstLook(pair([1200, 0], 0, hurt), 'green')).filter((k) => ['pumps', 'fires', 'wreckage'].includes(k)), ['wreckage']);
  // Given once, they stand: he does not give them again.
  const s = pair([1200, 0], 0, hurt), given = firstLook(s);
  const later = { ...tell(s, given), tick: Math.round(SKILL.master.look * STEPS_PER_SECOND) };
  assert.deepEqual(kinds(captainOrders(later, 0, 'master')).filter((k) => ['pumps', 'fires', 'wreckage'].includes(k)), []);
});

test('the helm: never closer than close-hauled; closing to windward of her; a broadside at his range; away before they touch', () => {
  const from = WEST;
  for (const want of [250, 260, 300, 0, 90, 180] as const) {
    for (const tack of [1, -1]) {
      const h = sailableOn(tack, want * DEGREE, from);
      assert.ok(Math.abs(angleDiff(h, from)) >= CLOSE_HAULED, `${want} on tack ${tack}: no closer than close-hauled`);
    }
  }
  // Closing from afar a master steers for a point to windward of her; a green captain straight at her.
  const far = pair([0, -1400]);
  const master = wantedHeading(sightOf(far, 0, 'master'), 'master').heading, green = wantedHeading(sightOf(far, 0, 'green'), 'green').heading;
  assert.ok(angleDiff(green, master) < -2 * DEGREE, 'the master heads more to windward (west) of her than the green captain');
  // At his range, abeam: he lays the broadside on her (her bearing square to his side, within a few degrees).
  const at = pair([SKILL.master.range, 0]), seen = sightOf(at, 0, 'master'), wanted = wantedHeading(seen, 'master');
  assert.ok(wanted.side !== null && Math.abs(Math.abs(angleDiff(wanted.heading, seen.bearing)) - Math.PI / 2) < 10 * DEGREE, 'abeam at his range he holds her abeam');
  // Too close he turns away from her.
  const touching = pair([CLOSEST - 10, 0]), near = sightOf(touching, 0, 'master'), away = wantedHeading(near, 'master');
  assert.ok(Math.abs(angleDiff(away.heading, near.bearing)) > Math.PI / 2, 'inside CLOSEST he heads away from her');
  // Whatever he wants, the order he gives is one she takes.
  for (const s of [far, at, touching]) {
    const moment = { tick: s.tick, wind: meanWind(s.wind, 0), force: s.wind.windForce };
    let told = s.ships[0]!.told;
    for (const o of firstLook(s)) {
      const answer = giveOrder(told, s.ships[0]!.sailing, o, moment);
      assert.equal(answer.refused, false, o.kind);
      told = answer.told;
    }
  }
});

test('beaten, he strikes (a master after fighting on a little): he asks, and gives it again when asked back; the fight ends with her struck', () => {
  const killed = HARMS.indexOf('killed');
  const hurt = Array.from({ length: Math.ceil(COMPLEMENT / 2) }, (_, m) => (m + 1) * HARMS.length + killed);
  const was = pair([300, 0], 0, { hurt });
  assert.equal(beaten(was.ships[0]!, was.ships[0]!.damage), true, 'half her men out: beaten');
  // His first lieutenant has said so (end.ts sets `fight.beaten` as the step ends).
  const fightsOn = Math.round(SKILL.master.strikeAfter * STEPS_PER_SECOND);
  const just: SimState = { ...was, tick: 0, fight: { ...was.fight, beaten: [true, false], beatenAt: [0, null] } };
  // Just beaten, a green captain asks at once; a master fights on a little (N7.5a).
  assert.ok(captainOrders(just, 0, 'green').some((o) => o.kind === 'strike'), 'green: at once');
  assert.ok(!captainOrders({ ...just, tick: fightsOn - Math.round(SKILL.master.look * STEPS_PER_SECOND) }, 0, 'master').some((o) => o.kind === 'strike'), 'a master fights on');
  let s: SimState = { ...was, fight: { ...was.fight, beaten: [true, false], beatenAt: [-fightsOn, null] } };
  const struck: number[] = [];
  for (let k = 0; k < 3 * STEPS_PER_SECOND * SKILL.master.look && !s.ships[0]!.told.struck; k++) {
    s = { ...s, tick: k };
    const orders = captainOrders(s, 0, 'master');
    if (orders.some((o) => o.kind === 'strike')) struck.push(s.tick);
    s = tell(s, orders);
  }
  assert.equal(struck.length, 2, 'asked twice');
  assert.equal(struck[1]! - struck[0]!, Math.round(STRIKE_AGAIN * STEPS_PER_SECOND), 'again when asked back');
  assert.equal(lostHow(s.ships[0]!), 'struck');
});

test('played alone with a foe (?foe=master), the other ship is commanded by the computer captain; without one she is not', () => {
  assert.equal(readParams('?sail&foe=master').foe, 'master');
  assert.equal(readParams('?sail&foe').foe, 'seasoned');
  assert.equal(readParams('?sail').foe, null);
  // The second ship's captain looks round half a look after the match's first step and gives his orders (a master beats to quarters at any range).
  const firstLook = Math.round(SKILL.master.look * STEPS_PER_SECOND / 2);
  let t = 0;
  const alone = new DuelSession({ build: 'test', now: () => t, seed: 3 }), fought = new DuelSession({ build: 'test', now: () => t, seed: 3, foe: 'master' });
  while (fought.state.tick < firstLook) { t += 1 / STEPS_PER_SECOND; for (const s of [alone, fought]) s.pump(); }
  assert.equal(fought.state.ships[1]!.told.serial, 0, 'not before his first look');
  assert.ok(captainOrders(fought.state, 1, 'master').length > 0, 'he has orders at his first look');
  t += 1 / STEPS_PER_SECOND;
  for (const s of [alone, fought]) s.pump();
  assert.equal(alone.state.ships[1]!.told.serial, 0, 'alone, nobody orders her');
  assert.equal(fought.state.ships[1]!.told.quarters, true, 'with a foe, his orders were stepped: quarters');
});
