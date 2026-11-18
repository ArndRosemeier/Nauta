/**
 * The crew and its tasks (implementation plan N4.1): the roster and quarter bill add up; an order done by a full crew
 * takes the time in the table (rules/crew.ts JOBS, from when its men are there); with half the hands it takes longer
 * by the short-handed rule; two orders at once share the men; no man ever has two tasks; work stopped frees the men,
 * who go back to their posts; the crew is plain data, and two crews at their busiest fit the network's 16 KB a state.
 * The crew is driven alone here (test/support/crew.ts), which is cheaper than whole matches; every order by a full
 * crew, and the orders sailed through whole matches, are in the slow check tools/sim/orders.ts.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../src/sim/codec.ts';
import { openShip } from '../src/sim/crew/closures.ts';
import { startCrew, stepCrew, taskOf, type Crew } from '../src/sim/crew/crew.ts';
import { jobWork } from '../src/sim/crew/drill.ts';
import { brigRoster, crewPlaces } from '../src/sim/crew/roster.ts';
import type { Order } from '../src/sim/orders.ts';
import { COMPLEMENT, FEWEST, GANGS, JOBS, ROSTER } from '../src/sim/rules/crew.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { decodeState, encodeState, startMatch } from '../src/sim/state.ts';
import { STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { drive, fullCrewOrder, give, MOST_SECONDS, short, skillOf, startSail, startTold } from './support/crew.ts';
import { duelSetup } from './support/match.ts';

/** The network's most a state may take, bytes. */
const STATE_BYTES = 16 * 1024;
/** Long enough for the men sent first for plain sail to reach their places (the most are on their way about 3 s in), s. */
const BUSY_SECONDS = 8;
/** Long enough for the men of a job to be at their places, s. */
const WAIT_SECONDS = 10;

test('the roster is the brig\'s 121, every man posted at a crew place of the plan, the guns\' men each at a place of his own', () => {
  const roster = brigRoster(), places = crewPlaces();
  assert.equal(roster.length, COMPLEMENT);
  assert.equal(ROSTER.reduce((n, r) => n + r.count, 0), COMPLEMENT);
  for (const m of roster) assert.ok(places.has(m.post), `${m.rank} at ${m.post}`);
  const atGuns = roster.filter((m) => m.gun);
  assert.equal(new Set(atGuns.map((m) => m.post)).size, atGuns.length, 'one man to a gun place');
  for (const m of atGuns) assert.ok(m.post.startsWith(`gun-${m.gun}-`), `${m.rank} at ${m.post} serves ${m.gun}`);
  // Every pair of guns has a crew, of mixed parts; every gang of the quarter bill has its men.
  const pairs = new Set(shipPlan().guns.map((g) => g.id.slice(0, -1)));
  for (const pair of pairs) assert.ok(atGuns.filter((m) => m.gun!.slice(0, -1) === pair).length >= 2, `pair ${pair} manned`);
  for (const gang of Object.values(GANGS)) for (const part of [gang.aloft, ...gang.deck]) if (part) assert.ok(roster.some((m) => m.part === part), part);
});

test('an order done by a full crew takes the time in the table once its men are there, and none is short-handed', () => {
  // The helm, and one mast's braces; every order is held to it in tools/sim/orders.ts.
  for (const order of [{ kind: 'steer', ship: 0, heading: 2 } as Order, { kind: 'back', ship: 0, mast: 'main' } as Order]) fullCrewOrder(order);
});

test('with half the hands a job takes longer by the rule, and with too few it does not start', () => {
  const back: Order = { kind: 'back', ship: 0, mast: 'main' };
  const brace = JOBS.brace.hands as number, work = JOBS.brace.work as number;
  const full = [...drive([back]).tasks.values()][0]!;
  const roster = short(GANGS.main.deck, brace / 2);
  const half = drive([back], roster);
  const { task, began, ended } = [...half.tasks.values()][0]!;
  const skill = skillOf(task, roster), seconds = (ended! - began!) * STEP_SECONDS;
  assert.ok(skill >= brace / 2 && skill < brace * (2 / 3), `half the hands: ${skill.toFixed(2)} of ${brace}`);
  assert.ok(Math.abs(seconds - (work * brace) / skill) <= 2 * STEP_SECONDS, `${seconds.toFixed(2)} s, by the rule ${((work * brace) / skill).toFixed(2)} s`);
  assert.ok(seconds > 1.5 * ((full.ended! - full.began!) * STEP_SECONDS), 'it takes clearly longer');
  assert.deepEqual(half.events.map((e) => [e.kind, e.job]), [['short-handed', 'brace']], 'the first lieutenant hears it is short-handed');
  // Below the fewest hands that can move it, the men wait and it is never done.
  const none = drive([back], short(GANGS.main.deck, FEWEST * brace * (2 / 3)), WAIT_SECONDS), waiting = none.crew.tasks[0]!;
  assert.ok(!none.doneAt.has('back') && none.crew.tasks.length === 1 && waiting.began === null, 'not begun');
  assert.ok(waiting.hands.length > 0 && waiting.hands.every((i) => !none.crew.men[i]!.going), 'though its men are there');
});

test('two orders at once share the men: the later job waits for hands or starts short, and both are done', () => {
  // Only the waisters haul (both masts' braces call on them), too few for both masts at once.
  const roster = brigRoster().map((m) => (m.part === 'waist' || !GANGS.fore.deck.concat(GANGS.main.deck).includes(m.part) ? m : { ...m, part: 'idlers' as const }));
  const fore: Order = { kind: 'back', ship: 0, mast: 'fore' }, main: Order = { kind: 'back', ship: 0, mast: 'main' };
  const alone = drive([main], roster).doneAt.get('back')!;
  const both = drive([fore, main], roster);
  assert.ok(both.told.backed.every(Boolean) && both.sailing.backed.every(Boolean), 'both masts aback');
  const tasks = [...both.tasks.values()].sort((a, b) => a.task.id - b.task.id);
  assert.equal(tasks.length, 2);
  assert.ok(skillOf(tasks[0]!.task, roster) >= jobWork(tasks[0]!.task.job, tasks[0]!.task.on).need, 'the first order given is manned in full');
  assert.ok(both.events.some((e) => e.kind === 'short-handed'), 'the second starts short-handed');
  assert.ok(tasks[1]!.ended! > alone, `the main yards are round later than alone: ${(tasks[1]!.ended! * STEP_SECONDS).toFixed(1)} s against ${(alone * STEP_SECONDS).toFixed(1)} s`);
  // Freed by the first, men join the second while it works.
  assert.ok(tasks[1]!.task.hands.some((i) => tasks[0]!.task.hands.includes(i)), 'a man of the fore braces went on to the main');
});

test('work stopped by a later order frees its men, who go back to their posts; the crew stays plain data', () => {
  const plain: Order = { kind: 'sail', ship: 0, canvas: 'plain' }, battle: Order = { kind: 'sail', ship: 0, canvas: 'battle' };
  const r = drive([plain], brigRoster(), MOST_SECONDS, [{ tick: 3 * STEPS_PER_SECOND, order: battle }]);
  assert.deepEqual([r.told.given, r.told.acts, r.crew.tasks], [[], [], []]);
  assert.ok(r.crew.men.some((h) => h.going || h.stands), 'men are on their way back');
  // Busy: the tack and a sail order at once, every man's task found and the crew plain data the codec takes.
  let told = startTold();
  const sailing = startSail();
  for (const o of [{ kind: 'tack', ship: 0 }, plain] as Order[]) told = give(told, sailing, o);
  let crew = startCrew();
  for (let tick = 0; tick < BUSY_SECONDS * STEPS_PER_SECOND; tick++) crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas }).crew;
  assert.ok(crew.men.filter((h) => h.going).length > 0, 'men on their way');
  for (const t of crew.tasks) for (const i of t.hands) assert.equal(taskOf(crew, i), t);
  assert.ok(encode(crew).length > 0);
});

test('two crews at their busiest, making plain sail, fit the network\'s 16 KB a state, and step on the same from its bytes', () => {
  // The crew at its busiest while its men go to their places for plain sail (the busiest the state gets until she beats to quarters).
  const sailing = startSail(), told = give(startTold(), sailing, { kind: 'sail', ship: 0, canvas: 'plain' });
  let crew = startCrew(), busiest: Crew = crew, most = 0;
  for (let tick = 0; tick < BUSY_SECONDS * STEPS_PER_SECOND; tick++) {
    crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas }).crew;
    const bytes = encode(crew).length;
    if (bytes > most) { most = bytes; busiest = crew; }
  }
  assert.ok(busiest.men.filter((h) => h.going).length >= COMPLEMENT / (2 * 2), 'a good part of the crew on its way');
  // Both ships of a duel so, at once.
  const match = startMatch(duelSetup(1805, 4));
  const busy = { ...match, ships: match.ships.map((s) => ({ ...s, crew: busiest, told })) };
  const bytes = encodeState(busy);
  assert.ok(bytes.length < STATE_BYTES, `${bytes.length} bytes`);
  // The guest's copy is the host's, and its crew steps on to the same.
  const back = decodeState(bytes);
  assert.deepEqual(back, busy);
  let host = busy.ships[0]!.crew, guest = back.ships[0]!.crew;
  const tick0 = BUSY_SECONDS * STEPS_PER_SECOND;
  for (let tick = tick0; tick < tick0 + STEPS_PER_SECOND; tick++) {
    const deck = { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas };
    host = stepCrew(host, told, deck).crew; guest = stepCrew(guest, back.ships[0]!.told, deck).crew;
  }
  assert.deepEqual(encode(guest), encode(host));
});
