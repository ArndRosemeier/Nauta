/**
 * Repairs and the wounded (implementation plan N6.3, design decisions for N6): each repair restores what the rule
 * says; unasked, the carpenter plugs, the boatswain splices and the quartermasters rig the relieving tackles; the
 * killed and badly wounded leave the quarter bill, the killed lie where they fell and the badly wounded are carried
 * below by two waisters, at most four parties at once; the first lieutenant's parties take men from the guns by the
 * quarter bill, and a fire party puts out a fire.
 *
 * Each from a state built for the purpose (CHECKS.md), the step for at most a minute a test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mend, openHoles, outOf, startDamage, type Damage } from '../src/sim/damage.ts';
import { sparParts } from '../src/sim/damage/meet.ts';
import { atWork, NO_ACT, sameSpot, type Crew } from '../src/sim/crew/crew.ts';
import { billOrder, brigRoster, placeSpot } from '../src/sim/crew/roster.ts';
import { handsAtGuns } from '../src/sim/guns/guns.ts';
import { parseOrder, type Order } from '../src/sim/orders.ts';
import { CARRY_PARTIES, PLUG_PARTIES, REPAIRS, SURGEON } from '../src/sim/rules/crew.ts';
import { HARMS } from '../src/sim/rules/damage.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { rigPlan } from '../src/sim/ship/rig.ts';
import { startMatch, type SimState } from '../src/sim/state.ts';
import { step, type SimEvent } from '../src/sim/step.ts';
import { STEPS_PER_SECOND } from '../src/sim/units.ts';
import { holesUnder } from './support/damage.ts';

const roster = brigRoster();
const BADLY = HARMS.indexOf('badly'), KILLED = HARMS.indexOf('killed');
const hurtCode = (man: number, harm: number): number => man * HARMS.length + harm;

/** One ship lying still in a calm with the damage `damage`. */
function lying(damage: Partial<Damage>): SimState {
  const state = startMatch({ seed: 5, windForce: 0, windFrom: 0, ships: [{ x: 0, z: 0, heading: Math.PI / 2, canvas: 'bare' }] });
  return { ...state, ships: state.ships.map((s) => ({ ...s, damage: { ...startDamage(), ...damage } })) };
}

/** A state stepped `seconds`, the orders given in the first step, `each` called after every step. */
function run(state: SimState, seconds: number, orders: readonly Order[] = [], each?: (s: SimState, events: readonly SimEvent[]) => void): SimState {
  let s = state;
  for (let k = 0; k < seconds * STEPS_PER_SECOND; k++) {
    const r = step(s, k === 0 ? orders : []);
    s = r.state;
    each?.(s, r.events);
  }
  return s;
}

const repairTasks = (crew: Crew, job: string) => crew.tasks.filter((t) => t.act === NO_ACT && t.job === job);
const ranksOf = (hands: readonly number[]) => hands.map((i) => roster[i]!.rank).sort();

test('each repair restores what the rule says', () => {
  const [hole] = holesUnder(1 / 2, 1), shroud = rigPlan().lines.findIndex((l) => l.standing && l.kind === 'shroud');
  const part = sparParts().findIndex((p) => p.spar === 'main-mast');
  const d: Damage = { ...startDamage(), holes: [hole!], cut: [shroud], wounds: [part, part], alongside: [part * 2 + 1], steering: false };
  assert.equal(openHoles(d).length, 1, 'the hole lets the sea in');
  const plugged = mend(d, [{ job: 'plug', on: hole! }]);
  assert.deepEqual(plugged.plugged, [hole], 'a hole plugged is kept as plugged');
  assert.equal(openHoles(plugged).length, 0, 'and lets in no more sea');
  assert.deepEqual(mend(d, [{ job: 'fish', on: part }]).wounds, [part], 'a spar fished has one wound less');
  assert.deepEqual(mend(d, [{ job: 'splice', on: shroud }]).cut, [], 'a line spliced is whole again');
  assert.equal(mend(d, [{ job: 'tackle', on: 0 }]).steering, true, 'the relieving tackles give her her steering back');
  assert.deepEqual(mend(d, [{ job: 'cut', on: part * 2 + 1 }]).alongside, [], 'the wreckage cut away drags her no more');
  for (const job of ['pump', 'fight', 'fetch', 'carry'] as const) assert.equal(mend(d, [{ job, on: 0 }]), d, `${job} changes nothing of her damage`);
});

test('unasked, the carpenter and his mate plug a hole under the water, the boatswain and his mates splice a shroud, the quartermasters rig the relieving tackles', () => {
  const holes = holesUnder(1 / 2, 1), shroud = rigPlan().lines.findIndex((l) => l.standing && l.kind === 'shroud');
  let s = run(lying({ holes, cut: [shroud], steering: false }), 20);
  const crew = s.ships[0]!.crew;
  const at = (job: string) => { const t = repairTasks(crew, job); assert.equal(t.length, 1, `one ${job}`); assert.notEqual(t[0]!.began, null, `the ${job} has begun`); return ranksOf(t[0]!.hands); };
  assert.deepEqual(at('plug'), ['carpenter', "carpenter's mate"]);
  assert.deepEqual(at('splice'), ['boatswain', "boatswain's mate", "boatswain's mate"]);
  assert.deepEqual(at('tackle'), ['quartermaster', 'quartermaster', 'quartermaster', 'quartermaster']);
  assert.ok(s.ships[0]!.damage.flooded[1] > 0, 'the sea comes in meanwhile');
  // Their work nearly done: in a moment the hole is plugged, the shroud whole, her steering back.
  s = { ...s, ships: s.ships.map((sh) => ({ ...sh, crew: { ...sh.crew, tasks: sh.crew.tasks.map((t) => (t.act === NO_ACT ? { ...t, toDo: 1 } : t)) } })) };
  s = run(s, 2);
  const d = s.ships[0]!.damage;
  assert.deepEqual(d.plugged, holes);
  assert.deepEqual(d.cut, []);
  assert.equal(d.steering, true);
  assert.deepEqual(s.ships[0]!.crew.tasks, [], 'nothing more to do: the men go back to their posts');
});

test('the killed and badly wounded leave the quarter bill: the killed lie where they fell, the badly wounded are carried below by two waisters, at most four at once', () => {
  // Six gun-crew men badly wounded and one killed, all at their guns.
  const atGuns = roster.flatMap((m, i) => (m.gun !== null && m.part !== 'waist' ? [i] : []));
  const badly = atGuns.slice(0, 6), killed = atGuns[6]!;
  let s = lying({ hurt: [...badly.map((m) => hurtCode(m, BADLY)), hurtCode(killed, KILLED)].sort((p, q) => p - q) });
  const out = outOf(s.ships[0]!.damage);
  assert.deepEqual([...out].sort((p, q) => p - q), [...badly, killed].sort((p, q) => p - q), 'out of the quarter bill');
  const full = handsAtGuns(s.ships[0]!.crew).reduce((a, b) => a + b, 0);
  assert.equal(handsAtGuns(s.ships[0]!.crew, roster, out).reduce((a, b) => a + b, 0), full - out.size, 'not counted at their guns');
  let most = 0, below = 0;
  s = run(s, 40, [], (st) => {
    const crew = st.ships[0]!.crew, parties = crew.tasks.filter((t) => t.job === 'fetch' || t.job === 'carry');
    most = Math.max(most, parties.length);
    for (const t of parties) for (const i of t.hands) assert.equal(roster[i]!.part, 'waist', 'the bearers are waisters');
    assert.deepEqual(crew.men[killed], { stands: null, going: null, blocked: null }, 'the killed man lies where he fell');
    // While four parties are out, the others wait where they lie.
    if (parties.length === CARRY_PARTIES) for (const m of badly.filter((b) => !parties.some((t) => t.on === b))) assert.equal(crew.men[m]!.going, null);
    below = badly.filter((m) => { const h = st.ships[0]!.crew.men[m]!; return !h.going && h.stands !== null && sameSpot(h.stands, placeSpot(SURGEON)); }).length;
  });
  assert.equal(most, CARRY_PARTIES, 'four parties carry at most');
  assert.ok(below >= CARRY_PARTIES, `${below} carried below to the surgeon in 40 s`);
  const crew = s.ships[0]!.crew;
  assert.ok(crew.tasks.every((t) => t.hands.every((i) => !out.has(i))), 'no man out of the quarter bill has a task');
});

test('the first lieutenant\'s parties take men from the guns by the quarter bill, and frees the carpenter\'s crew to plug', () => {
  const messdeck = shipPlan().spaces.findIndex((sp) => sp.id === 'messdeck');
  const part = sparParts().findIndex((p) => p.spar === 'fore-mast');
  const orders: Order[] = ['hands to the pumps', 'fire party', 'clear the wreckage'].map((w) => parseOrder(w, 0) as Order);
  const start = lying({ holes: holesUnder(1 / 2, PLUG_PARTIES.all), flooded: [10, 10], fires: [{ space: messdeck, size: 0.2 }], alongside: [part * 2 + 1] });
  // Before the orders come down to the men, the carpenter and his mate plug alone.
  let s = run(start, 1, orders);
  assert.equal(repairTasks(s.ships[0]!.crew, 'plug').length, PLUG_PARTIES.unasked);
  assert.equal(repairTasks(s.ships[0]!.crew, 'pump').length, 0, 'the order has not come down yet');
  s = run(s, 2);
  const crew = s.ships[0]!.crew, bill = billOrder(roster);
  const [pump] = repairTasks(crew, 'pump'), [fight] = repairTasks(crew, 'fight'), [cut] = repairTasks(crew, 'cut');
  assert.deepEqual(pump!.hands, bill.slice(0, REPAIRS.pump.men), 'the pumps take the first eight of the bill');
  assert.deepEqual(fight!.hands, bill.slice(REPAIRS.pump.men, REPAIRS.pump.men + REPAIRS.fight.men), 'the fire party the next eight');
  assert.ok(pump!.hands.every((i) => roster[i]!.part === 'waist'), 'the waisters first');
  assert.equal(cut!.hands.length, REPAIRS.cut.men);
  assert.ok(cut!.hands.every((i) => roster[i]!.part === 'forecastle'), 'forecastle men cut the wreckage away');
  assert.equal(repairTasks(crew, 'plug').length, PLUG_PARTIES.all, 'the pump hands free the whole carpenter\'s crew to plug');
  const taken = [...pump!.hands, ...fight!.hands, ...cut!.hands];
  // They leave their guns.
  s = run(s, 10);
  const men = s.ships[0]!.crew.men, guns = (st: SimState) => handsAtGuns(st.ships[0]!.crew).reduce((p, q) => p + q, 0);
  assert.ok(taken.every((i) => men[i]!.going !== null || men[i]!.stands !== null), 'the men taken are no longer at their guns');
  const without = handsAtGuns(start.ships[0]!.crew, roster, new Set(taken)).reduce((p, q) => p + q, 0);
  assert.ok(without < guns(start) && guns(s) <= without, `the guns are short by them: ${guns(s)} of ${guns(start)}`);
  // The fire party puts the fire out.
  let out = false, fought = 0;
  s = run(s, 40, [], (st, events) => {
    fought = Math.max(fought, atWork(st.ships[0]!.crew, 'fight', messdeck));
    out ||= events.some((e) => e.kind === 'aftermath' && e.what === 'out' && e.id === messdeck);
  });
  assert.equal(fought, REPAIRS.fight.men, 'the whole fire party at the fire');
  assert.ok(out, 'and it is out');
  assert.ok(!s.ships[0]!.damage.fires.some((f) => f.space === messdeck));
});

test('the orders for her life stand once given; given again they are refused', () => {
  let s = lying({});
  const refused: string[] = [];
  const give = (words: string) => { const r = step(s, [parseOrder(words, 0) as Order]); s = r.state; for (const e of r.events) if (e.kind === 'refused') refused.push(e.code); };
  for (const w of ['hands to the pumps', 'fire party', 'clear the wreckage', 'plug the shot holes']) give(w);
  assert.deepEqual(refused, []);
  const told = s.ships[0]!.told;
  assert.ok(told.pumps !== null && told.fires !== null && told.wreckage !== null && told.carpenter === 'plug');
  for (const w of ['hands to the pumps', 'fire party', 'clear the wreckage', 'plug the shot holes']) give(w);
  assert.deepEqual(refused, ['sent already', 'sent already', 'sent already', 'first already']);
  give('man the pumps');
  assert.equal(s.ships[0]!.told.carpenter, 'pump', 'the carpenter told to pump first instead');
  assert.deepEqual(s.ships[0]!.crew.tasks, [], 'nothing to do on a sound ship');
});
