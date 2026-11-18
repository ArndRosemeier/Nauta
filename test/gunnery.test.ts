/**
 * The gunnery orders (implementation plan N5.3a): each order changes what her guns are told as the rule says, and is
 * refused with its code when it cannot be; a ship not at quarters never fires; at quarters the guns load the shot
 * ordered, run out and are laid on the part of her aimed at; held guns fire at the tick the word is given, rippling
 * down the side; fired as they bear they fire on the roll; the shots are events. Short rules, a few simulated seconds
 * each, from a battery made ready once for the file (the minute of loading is guns.ts's, tested there).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { giveOrder, type Order, type ShipOrders } from '../src/sim/orders.ts';
import { RIPPLE } from '../src/sim/rules/guns.ts';
import { battery, gunAt, startGuns, stepGuns, type Battery } from '../src/sim/guns/guns.ts';
import { aimPoint, beatingToQuarters } from '../src/sim/guns/gunnery.ts';
import { startMotion, toWorld } from '../src/sim/ship/motion.ts';
import { simTime, startMatch, type SimState } from '../src/sim/state.ts';
import { step, type SimEvent } from '../src/sim/step.ts';
import { DEGREE, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { meanWind } from '../src/sim/wind.ts';
import { eventWords } from '../src/app/orderReport.ts';
import { musterCrew } from './support/muster.ts';
import { EACH, MODERATE, SEED } from './support/orders.ts';

/** How far off her starboard beam the enemy lies, m: well inside the carronades' reach. */
const RANGE = 150;
/** Long enough for the gun captains to lay every gun on her, s (a gun not yet laid holds her fire at the word). */
const LAYING = 4;
/** A full crew at each gun, for making the battery ready. */
const FULL = 4;
/** Long enough for a full crew to load and run out every gun, s (a reload is 35 s, its recoil 1.5 s of it). */
const READYING = 40;

/** The battery loaded with round shot, run out and laid square: ready to fire. Made once for the file. */
const READY: Battery = (() => {
  let guns = startGuns();
  const men = battery().map(() => FULL), wants = battery().map(() => ({ load: 'round' as const, runOut: true, train: 0, elevation: 0 }));
  for (let k = 0; k < READYING * STEPS_PER_SECOND; k++) guns = stepGuns(guns, men, wants);
  return Object.freeze(guns);
})();

/** Two brigs lying still, heading north, the second `RANGE` m off the first's starboard beam; the first's guns `guns`. */
function duel(guns: Battery = startGuns()): SimState {
  const at = toWorld(startMotion(0, 0, 0).pose, RANGE, 0, 0);
  const s = startMatch({ seed: SEED, windForce: MODERATE, windFrom: 0, ships: [{ x: 0, z: 0, heading: 0 }, { x: at[0], z: at[2], heading: 0 }] });
  return { ...s, ships: s.ships.map((ship, i) => (i === 0 ? { ...ship, guns, crew: musterCrew() } : { ...ship, crew: musterCrew() })) };
}
const STILL = Object.freeze(duel());
const LOADED = Object.freeze(duel(READY));

/** Stepped `seconds` on, the `orders` (for ship 0) given in the first step; the events of every step. */
function run(s: SimState, seconds: number, orders: readonly Order[] = []): { state: SimState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (let k = 0; k < Math.round(seconds * STEPS_PER_SECOND); k++) {
    const r = step(s, k === 0 ? orders : []);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}
const firedIn = (events: readonly SimEvent[]) => events.flatMap((e) => (e.kind === 'fired' ? [e] : []));

/** An order given to ship 0 as she is told `told`: what she is told after, and the refusal's code (null: taken). */
function give(told: ShipOrders, order: Order): { told: ShipOrders; code: string | null } {
  const s = STILL.ships[0]!;
  const a = giveOrder(told, s.sailing, order, { tick: 0, wind: meanWind(STILL.wind, simTime(STILL)), force: MODERATE });
  return { told: a.told, code: a.refused ? a.code : null };
}

test('each gunnery order changes what her guns are told, or is refused with its code', () => {
  let told = STILL.ships[0]!.told;
  assert.deepEqual([told.quarters, told.shot, told.aim, told.firing, told.word], [false, 'round', 'hull', 'cease', false], 'at the start');
  // Not at quarters, nothing fires and nothing can be told to.
  for (const order of [EACH.bear, EACH.hold, EACH.fire, EACH.cease, EACH.stand]) assert.equal(give(told, order).code, 'not at quarters', order.kind);
  // The shot and the aim may be chosen before she goes to quarters.
  told = give(told, EACH.shot).told;
  told = give(told, EACH.aim).told;
  assert.deepEqual([told.shot, told.aim], ['chain', 'rigging']);
  assert.equal(give(told, EACH.shot).code, 'loading it already');
  assert.equal(give(told, EACH.aim).code, 'laid there already');
  told = give(told, EACH.quarters).told;
  assert.equal(told.quarters, true);
  assert.equal(give(told, EACH.quarters).code, 'at quarters already');
  assert.equal(give(told, EACH.cease).code, 'not firing');
  assert.equal(give(told, EACH.fire).code, 'not held', 'the word only to guns held for it');
  told = give(told, EACH.hold).told;
  assert.equal(give(told, EACH.hold).code, 'firing so already');
  told = give(told, EACH.fire).told;
  assert.equal(told.word, true);
  assert.equal(give(told, EACH.fire).code, 'word given');
  told = give(told, EACH.bear).told;
  assert.deepEqual([told.firing, told.word], ['bear', false], 'firing as they bear drops the word');
  told = give(told, EACH.stand).told;
  assert.deepEqual([told.quarters, told.firing], [false, 'cease'], 'stood down');
  // The refusal reaches the step's events with its code.
  const refused = step(STILL, [EACH.bear]).events.find((e) => e.kind === 'refused');
  assert.ok(refused && refused.kind === 'refused' && refused.code === 'not at quarters' && refused.reason === 'she is not at quarters');
});

test('at quarters the guns load the shot ordered and run out; stood down they run in; the drum beats until they are loading', () => {
  assert.equal(beatingToQuarters(STILL.ships[0]!.told, STILL.ships[0]!.guns), false);
  const quarters = run(STILL, 1, [EACH.shot, EACH.quarters]).state.ships[0]!;
  const loading = battery().map((_, i) => gunAt(quarters.guns, i)).filter((g) => g.drill === 'loading');
  assert.ok(loading.length > battery().length / 2, `${loading.length} guns loading`);
  assert.ok(loading.every((g) => g.loadedWith === 'chain'), 'with the shot ordered');
  assert.equal(beatingToQuarters(quarters.told, quarters.guns), true, 'the drum beats');
  assert.equal(beatingToQuarters(quarters.told, READY), false, 'every gun loaded: at quarters, the drum stops');
  const ready = run(LOADED, 1, [EACH.quarters]).state;
  const stood = run(ready, 1, [EACH.stand]).state.ships[0]!;
  // At quarters her gun crews went to her starboard guns, which bear on her: those run in at once; the larboard guns wait for their men.
  assert.ok(battery().every((g, i) => gunAt(stood.guns, i).drill === (g.side > 0 ? 'running-in' : 'ready')), 'stood down, the guns with their crews run in with their load');
});

test('a ship not at quarters never fires; at quarters the guns on her side are laid on the part of her aimed at', () => {
  // Ready guns, the enemy abeam: not at quarters nothing fires, whatever is ordered.
  assert.deepEqual(firedIn(run(LOADED, 2, [EACH.bear, EACH.fire]).events), []);
  // At quarters, ceasing fire: laid, never fired; the side away from her stands square and level.
  const hull = run(LOADED, 3, [EACH.quarters]), rigging = run(LOADED, 3, [EACH.aim, EACH.quarters]);
  assert.deepEqual(firedIn([...hull.events, ...rigging.events]), [], 'cease firing: none fires');
  const places = battery(), starboard = places.flatMap((p, i) => (p.side > 0 ? [i] : []));
  const elevated = (s: SimState, i: number) => gunAt(s.ships[0]!.guns, i).elevated;
  for (const i of starboard) assert.ok(elevated(rigging.state, i) > elevated(hull.state, i), `gun ${places[i]!.id} laid higher for her rigging`);
  for (const [i, p] of places.entries()) if (p.side < 0) assert.equal(gunAt(hull.state.ships[0]!.guns, i).trained, 0, `gun ${p.id} square`);
  const point = aimPoint(LOADED.ships[1]!.motion.pose, LOADED.ships[0]!.motion.pose, 'rigging');
  assert.ok(point[1] > aimPoint(LOADED.ships[1]!.motion.pose, LOADED.ships[0]!.motion.pose, 'hull')[1]);
});

test('held guns fire at the tick the word is given, rippling down her side until every one has fired', () => {
  const held = run(LOADED, LAYING, [EACH.quarters, EACH.hold]).state;
  assert.deepEqual(firedIn(run(held, 1).events), [], 'held: none fires before the word');
  const word = step(held, [EACH.fire]);
  const first = firedIn(word.events);
  assert.equal(first.length, RIPPLE, 'the first guns of the broadside');
  assert.ok(first.every((e) => e.tick === held.tick && e.ship === 0 && battery()[e.gun]!.side > 0), 'at the word, from the side that bears');
  const rest = run(word.state, 1);
  const all = [...first, ...firedIn(rest.events)];
  const starboard = battery().filter((p) => p.side > 0).length;
  assert.equal(all.length, starboard, 'every gun of her starboard side fired');
  assert.deepEqual(all.map((e) => e.gun), [...all.map((e) => e.gun)].sort((a, b) => a - b), 'in battery order');
  assert.ok(all.every((e) => e.fired.shot === 'round' && e.fired.balls.length === 1 && e.fired.balls[0]!.path.length > 1), 'round shot, each with its flight');
  assert.equal(rest.state.ships[0]!.told.word, false, 'the word is spent');
  assert.equal(rest.state.ships[0]!.told.firing, 'hold', 'and the guns are held again');
  // The panel's words for it, ours and hers.
  assert.equal(eventWords(first[0]!, 0)?.replace(/^\S+ /, ''), 'our guns fire round shot');
  assert.equal(eventWords(first[0]!, 1)?.replace(/^\S+ /, ''), 'she fires round shot');
});

test('fired as they bear, the guns fire on the roll, each once laid, and keep to their side', () => {
  const firing = run(LOADED, 8, [EACH.quarters, EACH.bear]);
  const shots = firedIn(firing.events);
  assert.ok(shots.length >= battery().length / 4, `${shots.length} fired`);
  assert.ok(shots.every((e) => battery()[e.gun]!.side > 0), 'only the side that bears');
  assert.equal(new Set(shots.map((e) => e.gun)).size, shots.length, 'each gun once: she reloads for half a minute');
  assert.ok(new Set(shots.map((e) => e.tick)).size > 1, 'on the roll, not all at once');
  const perStep = new Map<number, number>();
  for (const e of shots) perStep.set(e.tick, (perStep.get(e.tick) ?? 0) + 1);
  assert.ok(Math.max(...perStep.values()) <= RIPPLE, 'never more than a ripple in a step');
  assert.ok(Math.abs(LOADED.ships[0]!.motion.pose.roll) < 10 * DEGREE);
});
