/**
 * The crew and its tasks (implementation plan N4.1): the roster and quarter bill add up; each order done by a full crew
 * takes the time in the table (rules/crew.ts JOBS, from when its men are there); with half the hands it takes longer
 * by the short-handed rule; two orders at once share the men; no man ever has two tasks; work stopped frees the men,
 * who go back to their posts; the crew is plain data. The crew is driven alone here (orders.ts and crew.ts, her sailing
 * standing still), which is cheaper than whole matches; tests/orders.test.ts sails her through them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from '../src/sim/codec.ts';
import { openShip } from '../src/sim/crew/closures.ts';
import { startCrew, stepCrew, taskOf, type Crew, type CrewEvent, type Task } from '../src/sim/crew/crew.ts';
import { brigRoster, crewPlaces, type Man } from '../src/sim/crew/roster.ts';
import { carryOut, giveOrder, startOrders, type Order, type ShipOrders } from '../src/sim/orders.ts';
import { COMPLEMENT, FEWEST, GANGS, JOBS, ROSTER, type Part } from '../src/sim/rules/crew.ts';
import { startSailing, type Sailing } from '../src/sim/ship/sailing.ts';
import { shipPlan } from '../src/sim/ship/plan.ts';
import { DEGREE, STEP_SECONDS, STEPS_PER_SECOND } from '../src/sim/units.ts';
import { steadyWind } from './support/sail.ts';

const FORCE = 4;
const WIND = steadyWind(FORCE, 0);
/** A beam reach under battle sail, with way on (so a tack is taken). */
const HEADING = 100 * DEGREE;
/** The longest an order here takes, s. */
const MOST_SECONDS = 90;

/** What a run gives back: the end, every task as it began and ended (ticks), the events, and the tick each order was done. */
interface Run {
  readonly told: ShipOrders;
  readonly sailing: Sailing;
  readonly crew: Crew;
  readonly tasks: Map<number, { task: Task; began: number | null; ended: number | null }>;
  readonly events: CrewEvent[];
  readonly doneAt: Map<string, number>;
}

/** A ship given `orders` at tick 0 (and `later` at their ticks) and her crew stepped on until every order is done or `seconds` pass; every step checks that no man has two tasks. */
function drive(orders: readonly Order[], roster: readonly Man[] = brigRoster(), seconds = MOST_SECONDS, later: readonly { tick: number; order: Order }[] = []): Run {
  let sailing = startSailing({ heading: HEADING, speed: 3 }, WIND, FORCE);
  let told = startOrders(HEADING, 'battle'), crew = startCrew(roster);
  const tasks: Run['tasks'] = new Map(), events: CrewEvent[] = [], doneAt = new Map<string, number>();
  const give = (o: Order, tick: number) => {
    const answer = giveOrder(told, sailing, o, { tick, wind: WIND, force: FORCE });
    assert.equal(answer.reason, '', `${o.kind} is taken`);
    told = answer.told;
  };
  for (const o of orders) give(o, 0);
  for (let tick = 0; tick < seconds * STEPS_PER_SECOND; tick++) {
    for (const l of later) if (l.tick === tick) give(l.order, tick);
    const r = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas }, roster);
    events.push(...r.events);
    const seen = new Set<number>();
    for (const t of r.crew.tasks) {
      for (const i of t.hands) { assert.ok(!seen.has(i), `man ${i} has two tasks at tick ${tick}`); seen.add(i); }
      const k = tasks.get(t.id);
      tasks.set(t.id, { task: t, began: t.began, ended: null });
      if (k && k.began !== null) assert.equal(t.began, k.began);
    }
    for (const [id, k] of tasks) if (k.ended === null && !r.crew.tasks.some((t) => t.id === id)) tasks.set(id, { ...k, ended: tick });
    const c = carryOut(told, sailing, r.done, WIND);
    for (const o of c.done) doneAt.set(o.kind, tick);
    told = c.told; sailing = c.sailing; crew = r.crew;
    if (told.given.length === 0 && crew.tasks.length === 0 && tick > 0 && later.every((l) => l.tick < tick)) break;
  }
  return { told, sailing, crew, tasks, events, doneAt };
}

/** The roster with the men of `parts` beyond the first who make up `skill` turned to idlers (as if the rest were elsewhere). */
function short(parts: readonly Part[], skill: number): Man[] {
  let kept = 0;
  return brigRoster().map((m) => {
    if (!parts.includes(m.part)) return m;
    if (kept < skill) { kept += m.skill; return m; }
    return { ...m, part: 'idlers' };
  });
}

/** The skill of a task's hands. */
const skillOf = (t: Task, roster: readonly Man[]) => t.hands.reduce((s, i) => s + roster[i]!.skill, 0);

const ORDERS: readonly Order[] = [
  { kind: 'steer', ship: 0, heading: 120 * DEGREE },
  { kind: 'tack', ship: 0 },
  { kind: 'wear', ship: 0 },
  { kind: 'heave', ship: 0 },
  { kind: 'sail', ship: 0, canvas: 'plain' },
  { kind: 'sail', ship: 0, canvas: 'all' },
  { kind: 'shorten', ship: 0 },
  { kind: 'back', ship: 0, mast: 'main' },
];

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

test('each order done by a full crew takes the time in the table once its men are there, and none is short-handed', () => {
  for (const order of ORDERS) {
    const r = drive([order]);
    assert.ok(r.doneAt.has(order.kind), `${order.kind} is done`);
    assert.deepEqual(r.events, [], `${order.kind}: no job short-handed`);
    for (const { task, began, ended } of r.tasks.values()) {
      assert.ok(began !== null && ended !== null, `${order.kind}: ${task.job} began and ended`);
      assert.ok(skillOf(task, brigRoster()) >= task.need, `${order.kind}: ${task.job} has all its hands`);
      const seconds = (ended - began) * STEP_SECONDS;
      assert.ok(Math.abs(seconds - task.work) <= STEP_SECONDS + 1e-9, `${order.kind}: ${task.job} worked ${seconds.toFixed(2)} s, the table says ${task.work} s`);
    }
  }
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
  const none = drive([back], short(GANGS.main.deck, FEWEST * brace * (2 / 3)), 30);
  assert.ok(!none.doneAt.has('back') && none.crew.tasks.length === 1 && none.crew.tasks[0]!.began === null);
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
  assert.ok(skillOf(tasks[0]!.task, roster) >= tasks[0]!.task.need, 'the first order given is manned in full');
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
  // Busy: the tack and a sail order at once, every man's task found and the state plain data the codec takes.
  let told = startOrders(HEADING, 'battle');
  const sailing = startSailing({ heading: HEADING, speed: 3 }, WIND, FORCE);
  for (const o of [{ kind: 'tack', ship: 0 }, plain] as Order[]) told = giveOrder(told, sailing, o, { tick: 0, wind: WIND, force: FORCE }).told;
  let crew = startCrew();
  for (let tick = 0; tick < 10 * STEPS_PER_SECOND; tick++) crew = stepCrew(crew, told, { tick, heel: 0, closures: openShip(), captain: null, canvas: sailing.canvas }).crew;
  assert.ok(crew.men.filter((h) => h.going).length > 0, 'men on their way');
  for (const t of crew.tasks) for (const i of t.hands) assert.equal(taskOf(crew, i), t);
  assert.ok(encode(crew).length > 0);
});
