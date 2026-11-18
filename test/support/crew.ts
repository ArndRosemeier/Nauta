/**
 * A crew driven alone (orders.ts and crew/crew.ts, her sailing standing still in a steady wind), which is far cheaper
 * than whole matches: shared by the crew's tests (test/crew.test.ts) and the full-crew runs of the orders' slow check
 * (tools/sim/orders.ts).
 */
import assert from 'node:assert/strict';
import { openShip } from '../../src/sim/crew/closures.ts';
import { startCrew, stepCrew, type Crew, type CrewEvent, type Task } from '../../src/sim/crew/crew.ts';
import { jobWork } from '../../src/sim/crew/drill.ts';
import { brigRoster, type Man } from '../../src/sim/crew/roster.ts';
import { carryOut, giveOrder, startOrders, type Order, type ShipOrders } from '../../src/sim/orders.ts';
import type { Part } from '../../src/sim/rules/crew.ts';
import { sailShare } from '../../src/sim/ship/sails.ts';
import { setShares, startSailing, type Sailing } from '../../src/sim/ship/sailing.ts';
import { DEGREE, STEP_SECONDS, STEPS_PER_SECOND } from '../../src/sim/units.ts';
import { steadyWind } from './sail.ts';

export const FORCE = 4;
export const WIND = steadyWind(FORCE, 0);
/** A beam reach under battle sail, with way on (so a tack is taken). */
export const HEADING = 100 * DEGREE;
/** The longest an order here takes, s. */
export const MOST_SECONDS = 90;

/** What a run gives back: the end, every task as it began and ended (ticks), the events, and the tick each order was done. */
export interface Run {
  readonly told: ShipOrders;
  readonly sailing: Sailing;
  readonly crew: Crew;
  readonly tasks: Map<number, { task: Task; began: number | null; ended: number | null }>;
  readonly events: CrewEvent[];
  readonly doneAt: Map<string, number>;
  /** How far each sail was set at every tick (rigPlan().sails order). */
  readonly shares: number[][];
}

/** Her orders and sailing at the start: a beam reach under battle sail, way on. */
export const startTold = () => startOrders(HEADING, 'battle');
export const startSail = () => startSailing({ heading: HEADING, speed: 3 }, WIND, FORCE);

/** `told` given `order` at `tick` (it must be taken). */
export function give(told: ShipOrders, sailing: Sailing, order: Order, tick = 0): ShipOrders {
  const answer = giveOrder(told, sailing, order, { tick, wind: WIND, force: FORCE });
  assert.equal(answer.reason, '', `${order.kind} is taken`);
  return answer.told;
}

/** A ship given `orders` at tick 0 (and `later` at their ticks) and her crew stepped on until every order is done or `seconds` pass; every step checks that no man has two tasks. */
export function drive(orders: readonly Order[], roster: readonly Man[] = brigRoster(), seconds = MOST_SECONDS, later: readonly { tick: number; order: Order }[] = []): Run {
  let sailing = startSail(), told = startTold(), crew = startCrew(roster);
  const tasks: Run['tasks'] = new Map(), events: CrewEvent[] = [], doneAt = new Map<string, number>(), shares: number[][] = [];
  for (const o of orders) told = give(told, sailing, o);
  for (let tick = 0; tick < seconds * STEPS_PER_SECOND; tick++) {
    for (const l of later) if (l.tick === tick) told = give(told, sailing, l.order, tick);
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
    const c = carryOut(told, setShares(sailing, r.sails), r.done, WIND);
    for (const o of c.done) doneAt.set(o.kind, tick);
    told = c.told; sailing = c.sailing; crew = r.crew;
    shares.push(sailing.canvas.map(sailShare));
    if (told.given.length === 0 && crew.tasks.length === 0 && tick > 0 && later.every((l) => l.tick < tick)) break;
  }
  return { told, sailing, crew, tasks, events, doneAt, shares };
}

/** The roster with the men of `parts` beyond the first who make up `skill` turned to idlers (as if the rest were elsewhere). */
export function short(parts: readonly Part[], skill: number): Man[] {
  let kept = 0;
  return brigRoster().map((m) => {
    if (!parts.includes(m.part)) return m;
    if (kept < skill) { kept += m.skill; return m; }
    return { ...m, part: 'idlers' };
  });
}

/** The skill of a task's hands. */
export const skillOf = (t: Task, roster: readonly Man[]) => t.hands.reduce((s, i) => s + roster[i]!.skill, 0);

/** One order of each kind the crew works for, for ship 0. */
export const CREW_ORDERS: readonly Order[] = [
  { kind: 'steer', ship: 0, heading: 120 * DEGREE },
  { kind: 'tack', ship: 0 },
  { kind: 'wear', ship: 0 },
  { kind: 'heave', ship: 0 },
  { kind: 'sail', ship: 0, canvas: 'plain' },
  { kind: 'sail', ship: 0, canvas: 'all' },
  { kind: 'shorten', ship: 0 },
  { kind: 'back', ship: 0, mast: 'main' },
];

/**
 * `order` done by a full crew: it is done, no job is short-handed, every job has all its hands and works the time in
 * the table (rules/crew.ts JOBS) from when they are there. Throws (an assertion) when not; gives the tick it was done.
 */
export function fullCrewOrder(order: Order): number {
  const r = drive([order]);
  assert.ok(r.doneAt.has(order.kind), `${order.kind} is done`);
  assert.deepEqual(r.events, [], `${order.kind}: no job short-handed`);
  for (const { task, began, ended } of r.tasks.values()) {
    assert.ok(began !== null && ended !== null, `${order.kind}: ${task.job} began and ended`);
    const w = jobWork(task.job, task.on);
    assert.ok(skillOf(task, brigRoster()) >= w.need, `${order.kind}: ${task.job} has all its hands`);
    const seconds = (ended - began) * STEP_SECONDS;
    assert.ok(Math.abs(seconds - w.work) <= STEP_SECONDS + TINY, `${order.kind}: ${task.job} worked ${seconds.toFixed(2)} s, the table says ${w.work} s`);
  }
  return r.doneAt.get(order.kind)!;
}

/** Slack for sums of step lengths, s. */
const TINY = 1e-9;
