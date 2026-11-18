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
import { CLIMB_METRES, FEWEST, PASSED, REPAIRS, SENT_PER_STEP, SURGEON, type RepairName } from '../rules/crew';
import { VOCABULARY, type ShipOrders } from '../orders';
import { bareSpot, type Spot } from '../ship/plan';
import { sailShare, type SailSetting } from '../ship/sails';
import type { SailWork } from '../ship/sailing';
import { STEP_SECONDS, STEPS_PER_SECOND } from '../units';
import type { Closures } from './closures';
import { goingAt, goingRoute, startGoing, stepGoings, type Going } from './going';
import { heightAt, lineLength, routeNetwork } from './network';
import { drill, isRepair, jobLeft, jobWork, shareAt, type Job, type JobWork } from './drill';
import { billOrder, brigRoster, placeSpot, type Man } from './roster';
import { rigPlan } from '../ship/rig';

/** One man's state, by his place in the roster. */
export interface Hand {
  /** Where he stands when he is not on his way: null at his post (and while on his way, which says where he set out from). */
  readonly stands: Spot | null;
  /** On his way (going.ts), or null. */
  readonly going: Going | null;
  /** The closures' serial under which no way was open to where he must go (he waits until it changes), or null. */
  readonly blocked: number | null;
}

/** A job being done for an act of an order, or a repair (what it takes: `jobWork(task.job, task.on)`). */
export interface Task extends Job {
  readonly id: number;
  /** The act it is for and that act's order (their ids in `ShipOrders`); `NO_ACT` for a repair (crew/repairs.ts). */
  readonly act: number;
  readonly of: number;
  /** A repair's spot, where all its men go (the hole, the fire, the wounded man, the surgeon); left out for a job done at its places (kept out of the state). */
  readonly at?: Spot;
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
  /** The men out of the quarter bill (badly hurt or killed: damage.ts `outOf`), and the repairs wanted now (crew/repairs.ts), in the order they are manned. */
  readonly out?: ReadonlySet<number>;
  readonly repairs?: readonly Repair[];
}

/** A repair wanted (crew/repairs.ts): the job, what it is done on (a hole, a line, a spar part, a space, a man) and where (used when its task is made). */
export interface Repair {
  readonly job: RepairName;
  readonly on: number;
  readonly at: Spot;
}
/** A repair finished in a step, for damage.ts to mend. */
export interface Mended {
  readonly job: RepairName;
  readonly on: number;
}
/** The act and order of a repair's task (it is for none). */
export const NO_ACT = -1;
const NOBODY: ReadonlySet<number> = new Set();

/** One step of the crew: the crew after it, the acts finished in it (their ids) and what happened. */
export interface Crewed {
  readonly crew: Crew;
  readonly done: readonly number[];
  readonly events: readonly CrewEvent[];
  /** The sails the men are working, how far each is set now (for sailing.ts `setShares`). */
  readonly sails: readonly SailWork[];
  /** The repairs finished (damage.ts mends them). */
  readonly mended: readonly Mended[];
}

/** A crew at the start: every man at his post, nothing to do. */
export function startCrew(roster: readonly Man[] = brigRoster()): Crew {
  return { men: roster.map(() => ({ stands: null, going: null, blocked: null })), tasks: [], tasked: 0 };
}

/** Whether two spots are the same. */
export const sameSpot = (a: Spot, b: Spot): boolean => a.space === b.space && a.along === b.along && a.across === b.across;

/** Where a man stands (his post when `stands` is null), or set out from when on his way. */
const standing = (h: Hand, m: Man): Spot => h.going?.path.from ?? h.stands ?? placeSpot(m.post);

let posts: Map<string, number> | null = null;
/** A crew place's spot by id and the height of its floor or surface, m above her base (kept: places do not move). */
export function placeAt(id: string): { spot: Spot; height: number } {
  posts ??= new Map();
  const spot = placeSpot(id);
  let h = posts.get(id);
  if (h === undefined) { h = heightAt(routeNetwork(), spot); posts.set(id, h); }
  return { spot, height: h };
}

/** Where a man is now (on his way, standing where he got to, or at his post `post`) and the height he stands at, m above her base. */
export function manAt(hand: Hand, post: string): { spot: Spot; height: number } {
  if (hand.going) { const w = goingAt(hand.going); return { spot: w, height: w.height }; }
  return hand.stands ? { spot: hand.stands, height: heightAt(routeNetwork(), hand.stands) } : placeAt(post);
}

/** Where a man must be: the place of his task, or his post. */
function target(i: number, roster: readonly Man[], byMan: ReadonlyMap<number, Task>): Spot {
  const t = byMan.get(i);
  if (!t) return placeSpot(roster[i]!.post);
  if (t.at) return t.at;
  const places = jobWork(t.job, t.on).places;
  return placeSpot(places[t.hands.indexOf(i) % places.length]!);
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
  let tasks = crew.tasks.filter((t) => t.act === NO_ACT || acts.has(t.act));
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
    tasks = [...tasks, ...jobs.map((j, k) => ({ ...j, after: j.after === null ? null : first + j.after, id: first + k, act: a.id, of: a.of, piped, hands: [], toDo: jobWork(j.job, j.on).work * (j.after === null && a.kind === 'sail' ? jobLeft(j.job, sailShare(deck.canvas[a.sail]!)) : 1), began: null }))];
    tasked += jobs.length;
  }
  return tasks === crew.tasks ? crew : { ...crew, tasks, tasked };
}

/** A wounded man's lifting and carrying are one repair (`fetch` becomes `carry` once he is lifted). */
const repairKey = (job: RepairName, on: number): string => `${job === 'carry' ? 'fetch' : job}:${on}`;

/** The repair tasks brought up to the repairs wanted: those no longer wanted dropped, new ones added (manned from now), in the order wanted. */
function syncRepairs(crew: Crew, repairs: readonly Repair[], tick: number): Crew {
  const wanted = new Set(repairs.map((r) => repairKey(r.job, r.on)));
  const kept = crew.tasks.filter((t) => t.act !== NO_ACT || wanted.has(repairKey(t.job as RepairName, t.on)));
  const have = new Set(kept.flatMap((t) => (t.act === NO_ACT ? [repairKey(t.job as RepairName, t.on)] : [])));
  const added = repairs.filter((r) => !have.has(repairKey(r.job, r.on)))
    .map((r, k): Task => ({ job: r.job, on: r.on, after: null, id: crew.tasked + k, act: NO_ACT, of: NO_ACT, at: r.at, piped: tick, hands: [], toDo: REPAIRS[r.job].work, began: null }));
  if (added.length === 0 && kept.length === crew.tasks.length) return crew;
  return { ...crew, tasks: [...kept, ...added], tasked: crew.tasked + added.length };
}

/** What a man counts for in a job: his skill at the ropes, or one man for a repair (manned by count). */
const strength = (w: JobWork, m: Man): number => (w.repair ? 1 : m.skill);

/** Strength of the hands of a task standing at their places. */
function present(t: Task, men: readonly Hand[], roster: readonly Man[], byMan: ReadonlyMap<number, Task>): number {
  const w = jobWork(t.job, t.on);
  return t.hands.reduce((sum, i) => sum + (there(men[i]!, i, roster, byMan) ? strength(w, roster[i]!) : 0), 0);
}

/** Where a man who has fallen on his way lies: where he is on a floor; on a way (a ladder, the shrouds), at its foot. */
function fallenAt(g: Going): Spot {
  const leg = goingRoute(g).legs[g.leg];
  if (leg && leg.way !== null) return { space: leg.space, along: leg.line[0]!, across: leg.line[1]! };
  return bareSpot(goingAt({ ...g, aside: 0 }));
}

/**
 * The men out of the quarter bill (badly hurt or killed) taken out of every task, and stopped where they fell (the killed
 * lie there; the badly wounded until they are carried below); a wounded man whose bearers are all struck lies where he
 * is again, to be lifted afresh.
 */
function strikeOut(crew: Crew, out: ReadonlySet<number>, roster: readonly Man[]): Crew {
  if (out.size === 0) return crew;
  let tasks = crew.tasks.map((t) => (t.hands.some((i) => out.has(i)) ? { ...t, hands: t.hands.filter((i) => !out.has(i)) } : t));
  const borne = new Set(tasks.flatMap((t) => (t.job === 'carry' && t.hands.length > 0 ? [t.on] : [])));
  const men = crew.men.map((h, i) => (out.has(i) && h.going && !borne.has(i) ? { stands: fallenAt(h.going), going: null, blocked: null } : h));
  tasks = tasks.map((t) => (t.job === 'carry' && t.hands.length === 0 ? { ...t, job: 'fetch', at: standing(men[t.on]!, roster[t.on]!), began: null, toDo: REPAIRS.fetch.work } : t));
  const changed = tasks.some((t, k) => t !== crew.tasks[k]) || men.some((h, i) => h !== crew.men[i]);
  return changed ? { ...crew, tasks, men } : crew;
}

/**
 * The tasks short of hands given free men, in the order the tasks were made: for each place in turn the nearest free
 * man of the parts the job is for (ties to the earlier in the roster), until their skill makes up its hands.
 */
function manTasks(tasks: readonly Task[], men: readonly Hand[], roster: readonly Man[], tick: number, out: ReadonlySet<number>): Task[] {
  const busy = new Set(tasks.flatMap((t) => t.hands));
  return tasks.map((t) => {
    if (tick < t.piped) return t;
    const w = jobWork(t.job, t.on);
    let skill = t.hands.reduce((sum, i) => sum + strength(w, roster[i]!), 0);
    if (skill >= w.need) return t;
    const hands = [...t.hands];
    const take = (i: number) => { hands.push(i); busy.add(i); skill += strength(w, roster[i]!); };
    if (w.repair?.bill) {
      // Taken from the guns by the quarter bill, in its order, wherever they are.
      for (const i of billOrder(roster)) { if (skill >= w.need) break; if (!busy.has(i) && !out.has(i)) take(i); }
      return hands.length === t.hands.length ? t : { ...t, hands };
    }
    const ranks = w.repair?.ranks ? new Set(w.repair.ranks) : null, parts = new Set(w.parts);
    let free = roster.flatMap((m, i) => ((ranks ? ranks.has(m.rank) : parts.has(m.part)) && !busy.has(i) && !out.has(i) ? [{ i, at: footing(standing(men[i]!, m)) }] : []));
    while (skill < w.need && free.length > 0) {
      const place = footing(t.at ?? placeSpot(w.places[hands.length % w.places.length]!));
      let best = 0, bestFar = Infinity;
      free.forEach((f, k) => { const far = farness(f.at, place); if (far < bestFar) { best = k; bestFar = far; } });
      const { i } = free[best]!;
      free = free.filter((_, k) => k !== best);
      take(i);
    }
    return hands.length === t.hands.length ? t : { ...t, hands };
  });
}

/**
 * The men sent on their way: each man not where he must be and not on his way (or on his way elsewhere, on a floor)
 * is sent, the men of tasks first, then the men going back to their posts, at most `SENT_PER_STEP` a step.
 */
function sendMen(men: readonly Hand[], roster: readonly Man[], byMan: ReadonlyMap<number, Task>, deck: Deck, struck: ReadonlySet<number>): Hand[] {
  const out = [...men], order = [...men.keys()].sort((a, b) => Number(byMan.has(b)) - Number(byMan.has(a)) || a - b);
  let sent = 0;
  for (const i of order) {
    if (sent >= SENT_PER_STEP) break;
    if (struck.has(i)) continue;
    const h = men[i]!, to = target(i, roster, byMan);
    if (h.blocked === deck.closures.waysSerial) continue;
    let from: Spot;
    if (h.going) {
      if (sameSpot(h.going.path.to, to)) continue;
      // Sent elsewhere on his way: from where he is on a floor; on a way (a ladder, the shrouds) he goes on to its end first.
      if (goingRoute(h.going).legs[h.going.leg]?.way != null) continue;
      from = bareSpot(goingAt({ ...h.going, aside: 0 }));
    } else {
      from = standing(h, roster[i]!);
      if (sameSpot(from, to)) continue;
    }
    const going = startGoing(from, to, byMan.has(i) ? 'smart' : 'walk', deck.heel, deck.closures);
    sent++;
    out[i] = going ? { stands: null, going, blocked: null } : { ...h, blocked: deck.closures.waysSerial };
  }
  return out;
}

/** Each task's work one step on: begun when the job before it is done and every man told off is there with at least `FEWEST` of its hands; done when no work is left. */
function work(tasks: readonly Task[], men: readonly Hand[], roster: readonly Man[], byMan: ReadonlyMap<number, Task>, tick: number, events: CrewEvent[]): Task[] {
  const live = new Set(tasks.map((t) => t.id));
  return tasks.map((t) => {
    if (t.after !== null && live.has(t.after)) return t;
    const skill = present(t, men, roster, byMan), need = jobWork(t.job, t.on).need;
    if (skill < FEWEST * need) return t;
    let began = t.began;
    if (began === null) {
      if (!t.hands.every((i) => there(men[i]!, i, roster, byMan))) return t;
      began = tick;
      if (skill < need && t.act !== NO_ACT) events.push({ kind: 'short-handed', of: t.of, job: t.job });
    }
    return { ...t, began, toDo: t.toDo - STEP_SECONDS * Math.min(1, skill / need) };
  });
}

/**
 * One step of the crew for a ship that has been told `told`: the tasks brought up to its acts and manned, the men sent
 * and moved on, the work done; the acts whose last job finished come back in `done`, for orders.ts to carry out.
 */
export function stepCrew(crew: Crew, told: ShipOrders, deck: Deck, roster: readonly Man[] = brigRoster()): Crewed {
  const out = deck.out ?? NOBODY;
  let c = strikeOut(syncRepairs(syncTasks(crew, told, deck), deck.repairs ?? [], deck.tick), out, roster);
  // An act with nothing left to do (its sail already stands as told) is done at once.
  const idle = told.acts.filter((a) => !c.tasks.some((t) => t.act === a.id)).map((a) => a.id);
  if (c.tasks.length === 0 && c.men.every((h) => h.going === null && h.stands === null)) return { crew: c, done: idle, events: [], sails: [], mended: [] };
  const events: CrewEvent[] = [];
  let tasks = manTasks(c.tasks, c.men, roster, deck.tick, out);
  const byMan = new Map(tasks.flatMap((t) => t.hands.map((i) => [i, t] as const)));
  let men = sendMen(c.men, roster, byMan, deck, out);
  // Every man on his way moves on at once (a wounded man carried goes with his bearer); those who got there stand at their route's end.
  const standingNow = men.flatMap((h, i) => (h.going ? [] : [standing(h, roster[i]!)]));
  const moved = stepGoings(men.map((h, i) => (out.has(i) ? null : h.going)), { heel: deck.heel, closures: deck.closures, captain: deck.captain, standing: standingNow });
  men = men.map((h, i) => {
    if (!h.going || out.has(i)) return h;
    const going = moved.goings[i] ?? null;
    if (going) return { ...h, going };
    const end = h.going.path.to;
    return { stands: sameSpot(end, placeSpot(roster[i]!.post)) ? null : end, going: null, blocked: null };
  });
  men = carried(tasks, men, roster);
  tasks = work(tasks, men, roster, byMan, deck.tick, events);
  // Jobs with no work left are done, and their men free; an act is done with its last job. A wounded man lifted is carried below next.
  const finished = tasks.filter((t) => t.toDo <= 0 && t.job !== 'fetch');
  tasks = tasks.flatMap((t) => (t.toDo > 0 ? [t] : t.job === 'fetch' ? [{ ...t, job: 'carry' as const, at: placeSpot(SURGEON), began: null, toDo: REPAIRS.carry.work }] : []));
  const mended: Mended[] = [];
  for (const t of finished) {
    if (t.act !== NO_ACT || !isRepair(t.job)) continue;
    mended.push({ job: t.job, on: t.on });
    if (t.job === 'carry') men = men.map((h, i) => (i === t.on ? { stands: placeSpot(SURGEON), going: null, blocked: null } : h));
  }
  const done = [...idle, ...new Set(finished.flatMap((t) => (t.act === NO_ACT ? [] : [t.act])))].filter((a) => !tasks.some((t) => t.act === a));
  c = { ...c, men, tasks };
  return { crew: c, done, events, sails: sailsWorked([...finished, ...tasks], told, deck.canvas), mended };
}

/** Each wounded man being carried below goes where his first bearer goes. */
function carried(tasks: readonly Task[], men: readonly Hand[], roster: readonly Man[]): Hand[] {
  const out = [...men];
  for (const t of tasks) {
    if (t.job !== 'carry' || t.hands.length === 0) continue;
    const b = men[t.hands[0]!]!;
    out[t.on] = b.going ? { stands: null, going: b.going, blocked: null } : { stands: standing(b, roster[t.hands[0]!]!), going: null, blocked: null };
  }
  return out;
}

/** How many of the men of a repair (its job and what it is done on) are at its spot now: a fire party at its fire, the pump hands at the pumps. */
export function atWork(crew: Crew, job: RepairName, on: number): number {
  let n = 0;
  for (const t of crew.tasks) {
    if (t.job !== job || t.on !== on || !t.at) continue;
    for (const i of t.hands) { const h = crew.men[i]!; if (!h.going && h.stands && sameSpot(h.stands, t.at)) n++; }
  }
  return n;
}

/** How far each sail its men are working is set: by the work done on its job so far, with the reefs it is set with. */
function sailsWorked(tasks: readonly Task[], told: ShipOrders, canvas: readonly SailSetting[]): SailWork[] {
  const out: SailWork[] = [];
  for (const t of tasks) {
    const act = told.acts.find((a) => a.id === t.act);
    if (t.began === null || !act || act.kind !== 'sail') continue;
    const share = shareAt(t.job, Math.max(0, t.toDo), jobWork(t.job, t.on).work);
    if (share === null) continue;
    const now = canvas[act.sail]!;
    // Sheeted home or hoisted with the reefs told; let fall from furled with them; reefed once the reef is done.
    const asTold = t.job === 'sheet' || t.job === 'hoist' || (t.job === 'loose' && !now.set) || (t.job === 'reef' && t.toDo <= 0);
    out.push({ sail: act.sail, share, reefs: asTold ? act.reefs : now.reefs });
  }
  return out;
}

/** The task a man has, or null (for drawing and reports: what he is doing). */
export function taskOf(crew: Crew, man: number): Task | null {
  return crew.tasks.find((t) => t.hands.includes(man)) ?? null;
}
