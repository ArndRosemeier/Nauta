/**
 * The crew at work (pure, N4.1): every man's task and where he is, the one owner of both (rules.json `owners`:
 * `men`, `tasks`, `tasked`). Orders (orders.ts) leave acts to be done; here each act becomes its jobs (drill.ts),
 * the jobs are given men by the quarter bill (roster.ts: the nearest free men of the parts each job is for), the men
 * go to their places by the ways through the ship (going.ts), and the work goes on when they are there, at the share
 * of the hands present (rules/crew.ts `FEWEST`, the short-handed rule). When an act's last job is done it is reported
 * back, and orders.ts does it to her sailing. So the time an order takes comes from the men: how it travels down to
 * them, how far they go, how many are free.
 *
 * No man has two tasks: a man is in at most one task's `hands`. Orders compete for men: the jobs are manned in the
 * order they were given, a job short of hands takes the next man freed, and a job dropped (its act replaced by a later
 * order) frees its men at once. A man with no task goes back to his post at a walk. Plain data; every step decides
 * from the state alone, in the roster's order, so every machine steps the same crew.
 */
import { CLIMB_METRES, FEWEST, PASSED, SENT_PER_STEP } from '../rules/crew';
import { VOCABULARY, type ShipOrders } from '../orders';
import { bareSpot, type Spot } from '../ship/plan';
import type { SailSetting } from '../ship/sails';
import { STEP_SECONDS, STEPS_PER_SECOND } from '../units';
import type { Closures } from './closures';
import { goingAt, startGoing, stepGoings, type Going } from './going';
import { heightAt, lineLength, routeNetwork } from './network';
import { drill, type Job } from './drill';
import { brigRoster, placeSpot, type Man } from './roster';
import { rigPlan } from '../ship/rig';

/** One man's state, by his place in the roster. */
export interface Hand {
  /** Where he stands when he is not on his way: null at his post. */
  readonly stands: Spot | null;
  /** On his way (going.ts), or null. */
  readonly going: Going | null;
  /** The closures' serial under which no way was open to where he must go (he waits until it changes), or null. */
  readonly blocked: number | null;
}

/** A job being done for an act of an order. */
export interface Task extends Job {
  readonly id: number;
  /** The act it is for and that act's order (their ids in `ShipOrders`). */
  readonly act: number;
  readonly of: number;
  /** The tick the men are told off for it: the order has come down to them. */
  readonly piped: number;
  /** The men told off for it (places in the roster), in the order they were; the n-th stands at the n-th place in turn. */
  readonly hands: readonly number[];
  /** Seconds of full-handed work still to do. */
  readonly toDo: number;
  /** The tick its work began, or null while the men are on their way (or it waits for the job before it). */
  readonly began: number | null;
}

/** A ship's crew: plain data in `SimShip.crew`, changed only here. */
export interface Crew {
  readonly men: readonly Hand[];
  readonly tasks: readonly Task[];
  /** The id the next task gets. */
  readonly tasked: number;
}

/** Something the crew did in a step that others report: a job began with fewer hands than it needs (the first lieutenant says so, N4.5). */
export interface CrewEvent {
  readonly kind: 'short-handed';
  /** The order's id in `ShipOrders`, and the job. */
  readonly of: number;
  readonly job: string;
}

/** What the crew goes through in a step: its tick, her heel now (rad, + starboard down), what is shut, where the captain is (null: nowhere a man meets him), and how her sails stand. */
export interface Deck {
  readonly tick: number;
  readonly heel: number;
  readonly closures: Closures;
  readonly captain: Spot | null;
  readonly canvas: readonly SailSetting[];
}

/** One step of the crew: the crew after it, the acts finished in it (their ids) and what happened. */
export interface Crewed {
  readonly crew: Crew;
  readonly done: readonly number[];
  readonly events: readonly CrewEvent[];
}

/** A crew at the start: every man at his post, nothing to do. */
export function startCrew(roster: readonly Man[] = brigRoster()): Crew {
  return { men: roster.map(() => ({ stands: null, going: null, blocked: null })), tasks: [], tasked: 0 };
}

const sameSpot = (a: Spot, b: Spot): boolean => a.space === b.space && a.along === b.along && a.across === b.across;

/** Where a man stands (his post when `stands` is null). */
const standing = (h: Hand, m: Man): Spot => h.stands ?? placeSpot(m.post);

/** Where a man must be: the place of his task, or his post. */
function target(i: number, roster: readonly Man[], byMan: ReadonlyMap<number, Task>): Spot {
  const t = byMan.get(i);
  return placeSpot(t ? t.places[t.hands.indexOf(i) % t.places.length]! : roster[i]!.post);
}

/** Whether a man is where he must be, standing. */
const there = (h: Hand, i: number, roster: readonly Man[], byMan: ReadonlyMap<number, Task>): boolean =>
  h.going === null && sameSpot(standing(h, roster[i]!), target(i, roster, byMan));

let below: ReadonlyMap<string, Spot> | null = null;

/** The way up to each surface aloft starts at a spot below it (the deck by the shrouds, a top, the crosstrees): the spot, by the surface. */
function wayUp(space: string): Spot | undefined {
  below ??= new Map(rigPlan().ways.map((w) => [w.to.space, w.from]));
  return below.get(space);
}

/** The surfaces a spot's space is reached through from the deck, itself first (one, on a deck). */
function climb(space: string): string[] {
  const out = [space];
  for (let up = wayUp(space); up; up = wayUp(up.space)) out.push(up.space);
  return out;
}

/** A spot with what choosing the nearest man asks of it: its height and the surfaces it is reached through. */
interface Footing {
  readonly spot: Spot;
  readonly height: number;
  readonly chain: readonly string[];
}
const footing = (spot: Spot): Footing => ({ spot, height: heightAt(routeNetwork(), spot), chain: climb(spot.space) });

/**
 * How far a man is from a place, for choosing the nearest: metres in plan, and each metre climbed down and up again
 * as `CLIMB_METRES` metres of deck, by the way the rig is climbed (from a top to a course yard is down to the deck by
 * the shrouds and up again; from the top to the topsail yard straight up).
 */
function farness(from: Footing, to: Footing): number {
  const a = from.height, b = to.height, common = from.chain.find((sp) => to.chain.includes(sp));
  // Down to where their ways part (the surface both are reached through, or the deck), then up.
  let parting = Math.min(a, b);
  if (common !== from.spot.space && common !== to.spot.space) {
    const branch = (chain: readonly string[]) => wayUp(chain[Math.max(0, (common === undefined ? chain.length : chain.indexOf(common)) - 1)]!);
    const pa = branch(from.chain), pb = branch(to.chain), net = routeNetwork();
    parting = Math.min(pa ? heightAt(net, pa) : a, pb ? heightAt(net, pb) : b);
  }
  return lineLength([from.spot, to.spot]) + CLIMB_METRES * (a + b - 2 * parting);
}

/** The tasks brought up to the acts still to be done: those of acts done or replaced dropped, new acts' jobs added (manned from the tick the order reaches the men). */
function syncTasks(crew: Crew, told: ShipOrders, deck: Deck): Crew {
  const acts = new Map(told.acts.map((a) => [a.id, a]));
  let tasks = crew.tasks.filter((t) => acts.has(t.act));
  let tasked = crew.tasked;
  const known = new Set(tasks.map((t) => t.act));
  for (const a of told.acts) {
    if (known.has(a.id)) continue;
    const given = told.given.find((g) => g.id === a.of);
    const kind = given?.order.kind ?? 'steer';
    const to = VOCABULARY.find((w) => w.kind === kind)?.to ?? 'master';
    const piped = (given?.tick ?? deck.tick) + Math.round(PASSED[to] * STEPS_PER_SECOND);
    const jobs = drill(a, kind, deck.canvas);
    const first = tasked;
    tasks = [...tasks, ...jobs.map((j, k) => ({ ...j, after: j.after === null ? null : first + j.after, id: first + k, act: a.id, of: a.of, piped, hands: [], toDo: j.work, began: null }))];
    tasked += jobs.length;
  }
  return tasks === crew.tasks ? crew : { ...crew, tasks, tasked };
}

/** Skill of the hands of a task standing at their places. */
function present(t: Task, men: readonly Hand[], roster: readonly Man[], byMan: ReadonlyMap<number, Task>): number {
  return t.hands.reduce((sum, i) => sum + (there(men[i]!, i, roster, byMan) ? roster[i]!.skill : 0), 0);
}

/**
 * The tasks short of hands given free men, in the order the tasks were made: for each place in turn the nearest free
 * man of the parts the job is for (ties to the earlier in the roster), until their skill makes up its hands.
 */
function manTasks(tasks: readonly Task[], men: readonly Hand[], roster: readonly Man[], tick: number): Task[] {
  const busy = new Set(tasks.flatMap((t) => t.hands));
  return tasks.map((t) => {
    if (tick < t.piped) return t;
    let skill = t.hands.reduce((sum, i) => sum + roster[i]!.skill, 0);
    if (skill >= t.need) return t;
    const parts = new Set(t.parts), hands = [...t.hands];
    let free = roster.flatMap((m, i) => (parts.has(m.part) && !busy.has(i) ? [{ i, at: footing(standing(men[i]!, m)) }] : []));
    while (skill < t.need && free.length > 0) {
      const place = footing(placeSpot(t.places[hands.length % t.places.length]!));
      let best = 0, bestFar = Infinity;
      free.forEach((f, k) => { const far = farness(f.at, place); if (far < bestFar) { best = k; bestFar = far; } });
      const { i } = free[best]!;
      free = free.filter((_, k) => k !== best);
      hands.push(i);
      busy.add(i);
      skill += roster[i]!.skill;
    }
    return hands.length === t.hands.length ? t : { ...t, hands };
  });
}

/**
 * The men sent on their way: each man not where he must be and not on his way (or on his way elsewhere, on a floor)
 * is sent, the men of tasks first, then the men going back to their posts, at most `SENT_PER_STEP` a step.
 */
function sendMen(men: readonly Hand[], roster: readonly Man[], byMan: ReadonlyMap<number, Task>, deck: Deck): Hand[] {
  const out = [...men], order = [...men.keys()].sort((a, b) => Number(byMan.has(b)) - Number(byMan.has(a)) || a - b);
  let sent = 0;
  for (const i of order) {
    if (sent >= SENT_PER_STEP) break;
    const h = men[i]!, to = target(i, roster, byMan);
    if (h.blocked === deck.closures.waysSerial) continue;
    let from: Spot;
    if (h.going) {
      if (sameSpot(h.going.route.to, to)) continue;
      // Sent elsewhere on his way: from where he is on a floor; on a way (a ladder, the shrouds) he goes on to its end first.
      if (h.going.route.legs[h.going.leg]?.way != null) continue;
      from = bareSpot(goingAt({ ...h.going, aside: 0 }));
    } else {
      from = standing(h, roster[i]!);
      if (sameSpot(from, to)) continue;
    }
    const going = startGoing(from, to, byMan.has(i) ? 'smart' : 'walk', deck.heel, deck.closures);
    sent++;
    out[i] = going ? { stands: from, going, blocked: null } : { ...h, blocked: deck.closures.waysSerial };
  }
  return out;
}

/** Each task's work one step on: begun when the job before it is done and every man told off is there with at least `FEWEST` of its hands; done when no work is left. */
function work(tasks: readonly Task[], men: readonly Hand[], roster: readonly Man[], byMan: ReadonlyMap<number, Task>, tick: number, events: CrewEvent[]): Task[] {
  const live = new Set(tasks.map((t) => t.id));
  return tasks.map((t) => {
    if (t.after !== null && live.has(t.after)) return t;
    const skill = present(t, men, roster, byMan);
    if (skill < FEWEST * t.need) return t;
    let began = t.began;
    if (began === null) {
      if (!t.hands.every((i) => there(men[i]!, i, roster, byMan))) return t;
      began = tick;
      if (skill < t.need) events.push({ kind: 'short-handed', of: t.of, job: t.job });
    }
    return { ...t, began, toDo: t.toDo - STEP_SECONDS * Math.min(1, skill / t.need) };
  });
}

/**
 * One step of the crew for a ship that has been told `told`: the tasks brought up to its acts and manned, the men sent
 * and moved on, the work done; the acts whose last job finished come back in `done`, for orders.ts to carry out.
 */
export function stepCrew(crew: Crew, told: ShipOrders, deck: Deck, roster: readonly Man[] = brigRoster()): Crewed {
  let c = syncTasks(crew, told, deck);
  if (c.tasks.length === 0 && c.men.every((h) => h.going === null && h.stands === null)) return { crew: c, done: [], events: [] };
  const events: CrewEvent[] = [];
  let tasks = manTasks(c.tasks, c.men, roster, deck.tick);
  const byMan = new Map(tasks.flatMap((t) => t.hands.map((i) => [i, t] as const)));
  let men = sendMen(c.men, roster, byMan, deck);
  // Every man on his way moves on at once; those who got there stand at their route's end.
  const standingNow = men.flatMap((h, i) => (h.going ? [] : [standing(h, roster[i]!)]));
  const moved = stepGoings(men.map((h) => h.going), { heel: deck.heel, closures: deck.closures, captain: deck.captain, standing: standingNow });
  men = men.map((h, i) => {
    if (!h.going) return h;
    const going = moved.goings[i] ?? null;
    if (going) return { ...h, going };
    const end = h.going.route.to;
    return { stands: sameSpot(end, placeSpot(roster[i]!.post)) ? null : end, going: null, blocked: null };
  });
  tasks = work(tasks, men, roster, byMan, deck.tick, events);
  // Jobs with no work left are done, and their men free; an act is done with its last job.
  const finished = tasks.filter((t) => t.toDo <= 0);
  tasks = tasks.filter((t) => t.toDo > 0);
  const done = [...new Set(finished.map((t) => t.act))].filter((a) => !tasks.some((t) => t.act === a));
  c = { ...c, men, tasks };
  return { crew: c, done, events };
}

/** The task a man has, or null (for drawing and reports: what he is doing). */
export function taskOf(crew: Crew, man: number): Task | null {
  return crew.tasks.find((t) => t.hands.includes(man)) ?? null;
}
