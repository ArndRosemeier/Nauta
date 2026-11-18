/**
 * Striking and sinking (implementation plan N6.4, design decisions for N6): each ending (sunk, burnt out, blown up,
 * struck, both at once, drawn at nightfall) ends the fight as one record; orders after it are refused and the ship
 * goes on going down; striking is asked twice; a ship is beaten by the rule and her first lieutenant says so once; a
 * headless duel ends (a short one here, the full one in `check:gunnery`).
 *
 * Each from a state built for the purpose (CHECKS.md), at most a minute of steps a test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startDamage, type Damage } from '../src/sim/damage.ts';
import { founderTonnes } from '../src/sim/damage/flood.ts';
import { sparParts } from '../src/sim/damage/meet.ts';
import { brigRoster } from '../src/sim/crew/roster.ts';
import { winner, type Fight } from '../src/sim/end.ts';
import { battery, dismountGun } from '../src/sim/guns/guns.ts';
import { parseOrder, type Order } from '../src/sim/orders.ts';
import { HARMS } from '../src/sim/rules/damage.ts';
import { ASK_AGAIN, BEATEN, LIGHT_WARNING_MINUTES } from '../src/sim/rules/end.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { duelStart } from '../src/sim/start.ts';
import { step, type SimEvent } from '../src/sim/step.ts';
import { SECONDS_PER_MINUTE, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { holesUnder } from './support/damage.ts';

/** Two ships lying still in a calm 300 m apart, the first with the damage `damage`. */
function pair(damage: Partial<Damage> = {}, minutes?: number): SimState {
  const s = startMatch({ seed: 9, windForce: 0, windFrom: 0, minutes, ships: [{ x: 0, z: 0, heading: Math.PI / 2, canvas: 'bare' }, { x: 0, z: 300, heading: Math.PI / 2, canvas: 'bare' }] });
  return { ...s, ships: s.ships.map((sh, i) => (i === 0 ? { ...sh, damage: { ...startDamage(), ...damage } } : sh)) };
}

/** One step with `orders`: the state after and its events. */
const once = (s: SimState, orders: readonly Order[] = []) => step(s, orders);
const ofKind = (events: readonly SimEvent[], kind: string) => events.filter((e) => e.kind === kind);
const say = (words: string, ship = 0): Order => parseOrder(words, ship) as Order;
const space = (id: string) => shipPlan().spaces.findIndex((s) => s.id === id);

test('each way of being lost ends the fight as one record: sunk, burnt out, blown up; both at once is a draw', () => {
  const cases: [Partial<Damage>, string][] = [
    [{ flooded: [founderTonnes() / 2, founderTonnes() / 2] }, 'sunk'],
    [{ blownUp: true }, 'blew up'],
    [{ fires: ['messdeck', 'cockpit', 'hold'].map((id) => ({ space: space(id), size: 0.6 })).sort((p, q) => p.space - q.space) }, 'burnt'],
    [{ fires: [{ space: space('lightroom'), size: 1 }] }, 'burnt'],
  ];
  for (const [damage, how] of cases) {
    const r = once(pair(damage));
    assert.deepEqual(r.state.fight.end, { tick: 0, lost: [how, null] }, how);
    assert.deepEqual(ofKind(r.events, 'end'), [{ kind: 'end', tick: 0, lost: [how, null] }]);
    assert.equal(winner(r.state.fight), 1, 'the other ship wins');
  }
  // Not yet past saving: two spaces at over half, or the light room not wholly alight.
  for (const fires of [[space('messdeck'), space('cockpit')].sort((p, q) => p - q).map((sp) => ({ space: sp, size: 0.6 })), [{ space: space('lightroom'), size: 0.9 }]]) {
    assert.equal(once(pair({ fires })).state.fight.end, null);
  }
  // Both lost in the same step.
  const both = pair({ blownUp: true });
  const r = once({ ...both, ships: both.ships.map((s) => ({ ...s, damage: { ...s.damage, blownUp: true } })) });
  assert.deepEqual(r.state.fight.end?.lost, ['blew up', 'blew up']);
  assert.equal(winner(r.state.fight), null, 'a draw');
});

test('after the end every order is refused, and a foundered ship goes on going down', () => {
  let s = once(pair({ flooded: [founderTonnes() / 2, founderTonnes() / 2] })).state;
  const ended: Fight = s.fight;
  const r = once(s, [say('hands to the pumps'), say('beat to quarters', 1)]);
  assert.deepEqual(ofKind(r.events, 'refused').map((e) => (e.kind === 'refused' ? e.code : '')), ['fight over', 'fight over']);
  s = r.state;
  const heave = s.ships[0]!.motion.pose.heave, water = s.ships[0]!.damage.flooded[0] + s.ships[0]!.damage.flooded[1];
  for (let k = 0; k < 60 * STEPS_PER_SECOND; k++) s = once(s).state;
  const d = s.ships[0]!.damage;
  assert.ok(d.flooded[0] + d.flooded[1] > water + founderTonnes() * 0.8, 'the sea pours in over her side: as much again in about a minute');
  assert.ok(s.ships[0]!.motion.pose.heave < heave - 2, `she settles: ${heave.toFixed(1)} to ${s.ships[0]!.motion.pose.heave.toFixed(1)} m`);
  assert.equal(s.fight, ended, 'the end stays as it was');
});

test('striking is asked twice: "Strike, sir?", then given again within ten seconds she strikes', () => {
  let s = pair();
  let r = once(s, [say('strike the colours')]);
  assert.deepEqual(ofKind(r.events, 'answered').map((e) => (e.kind === 'answered' ? e.code : '')), ['strike, sir?']);
  assert.equal(r.state.fight.end, null, 'asked, not struck');
  // Too late: asked again.
  s = r.state;
  for (let k = 0; k < (ASK_AGAIN + 1) * STEPS_PER_SECOND; k++) s = once(s).state;
  r = once(s, [say('strike')]);
  assert.equal(ofKind(r.events, 'answered').length, 1, 'asked again after ten seconds');
  r = once(r.state, [say('strike the colours')]);
  assert.deepEqual(r.state.fight.end?.lost, ['struck', null]);
  assert.equal(winner(r.state.fight), 1);
});

test('drawn at nightfall, the master warning five minutes before; a headless duel ends', () => {
  const minutes = LIGHT_WARNING_MINUTES + 1;
  let s = startMatch({ ...duelStart(4), minutes });
  const warn = s.fight.nightfall - LIGHT_WARNING_MINUTES * SECONDS_PER_MINUTE * STEPS_PER_SECOND;
  // From just before the warning to the end (the minutes between change nothing: the step's own clock decides).
  s = { ...s, tick: warn - 2 };
  const lights: number[] = [];
  for (let k = 0; k < 3; k++) { const r = once(s); s = r.state; for (const e of ofKind(r.events, 'light')) lights.push(e.tick); }
  assert.deepEqual(lights, [warn - 1], 'the light is failing, sir');
  s = { ...s, tick: s.fight.nightfall - 2 };
  let r = once(s);
  assert.equal(r.state.fight.end, null);
  r = once(r.state);
  assert.deepEqual(r.state.fight.end, { tick: s.fight.nightfall - 1, lost: [null, null] }, 'they part at nightfall');
  assert.equal(winner(r.state.fight), null);
  // A whole headless duel of a minute: over when its time runs out.
  let h = startMatch({ ...duelStart(4), minutes: 1 });
  for (let k = 0; k < SECONDS_PER_MINUTE * STEPS_PER_SECOND; k++) h = once(h).state;
  assert.deepEqual(h.fight.end?.lost, [null, null]);
});

test('beaten by the rule, said once: a quarter of her men out; the water gaining past 0.95 of foundering; dismasted facing a ship that can sail, or with fewer than four gun crews', () => {
  const men = brigRoster().length, half = Math.ceil(men * BEATEN.out);
  const hurt = Array.from({ length: half }, (_, i) => i * HARMS.length + HARMS.indexOf('killed'));
  let r = once(pair({ hurt }));
  assert.deepEqual(ofKind(r.events, 'beaten'), [{ kind: 'beaten', tick: 0, ship: 0 }], '"We must strike, sir"');
  assert.deepEqual(r.state.fight.beaten, [true, false]);
  r = once(r.state);
  assert.deepEqual(ofKind(r.events, 'beaten'), [], 'said once');
  assert.equal(r.state.fight.end, null, 'a player is never made to strike');
  assert.deepEqual(once(pair({ hurt: hurt.slice(1) })).state.fight.beaten, [false, false], 'one man short');
  // Water over the mark and gaining (foundered she pours in), not when it is falling.
  const deep = founderTonnes() * (BEATEN.water + (1 - BEATEN.water) / 2);
  assert.deepEqual(once(pair({ flooded: [deep / 2, deep / 2], holes: holesUnder(1, 5) })).state.fight.beaten, [true, false], 'over the mark and gaining');
  assert.deepEqual(once(pair({ flooded: [deep / 2, deep / 2] })).state.fight.beaten, [false, false], 'over the mark but not gaining (the pumps draw it down)');
  // Dismasted: both lower masts broken at their heels.
  const heels = ['fore-mast', 'main-mast'].map((spar) => sparParts().findIndex((p) => p.spar === spar));
  const masts = pair({ fallen: heels });
  assert.deepEqual(once(masts).state.fight.beaten, [true, false], 'dismasted facing a ship that can sail with half her guns: helpless (N7.5a)');
  let guns = masts.ships[0]!.guns;
  for (let g = 0; g < battery().length; g++) guns = dismountGun(guns, g);
  const halfGuns = battery().length / 2;
  let fewer = masts.ships[1]!.guns;
  for (let g = 0; g <= halfGuns; g++) fewer = dismountGun(fewer, g);
  assert.deepEqual(once({ ...masts, ships: masts.ships.map((s, i) => (i === 1 ? { ...s, guns: fewer } : s)) }).state.fight.beaten, [false, false], 'dismasted with her guns manned, facing a ship with fewer than half hers, fights on');
  assert.deepEqual(once({ ...masts, ships: masts.ships.map((s, i) => (i === 0 ? { ...s, guns } : { ...s, guns: fewer })) }).state.fight.beaten, [true, false], 'dismasted and every gun dismounted');
});
