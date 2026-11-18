/**
 * One step of the match (implementation plan N3.1): the state and the orders given for this step in, the next state
 * and what happened out. Fixed length (`STEP_SECONDS`, 30 a second), pure: the same state and orders give the same
 * next state, bit for bit, on every machine. So the host of a match steps it and the others send their orders as
 * intents (N3.7); a guest that steps the same inputs ends at the same hash.
 *
 * Within a step, in this order: the orders are given in the order listed (the host's list is the truth, so two
 * orders in one step never race; orders.ts answers each: taken, taken with words (`answered`) or refused with its reason), the sea follows the
 * wind's mean at the step's start, and every ship has the acts of her orders falling due now carried out (orders.ts),
 * sails one step in the true wind at her place (sailing.ts), works and fires her guns at the other ship as she has
 * been told (guns/gunnery.ts; her gun crews stand to the side that bears, `engagedSide`) and floats one step on that sea as her sailing says (motion.ts).
 * Before she sails, what her damage leads to is worked out (damage.ts `stepAftermath`: water, falling spars, fire), and
 * what is left of her sails, her steering and the water's weight go to her sailing and floating.
 * Last, ships that have run into each other are pushed apart (ship/touch.ts: struck, fouled), and the fight is
 * judged (end.ts): a ship beaten, a ship lost, the end of the fight or of the light. After the end every order is
 * refused, and the simulation goes on (she is seen going down). Before the ships move,
 * every shot in flight is traced through them for the part of its flight this step covers (damage.ts), and what each
 * ball hits is done and reported (`hit`); after, the shots fired in the step are put in flight.
 */
import { stepCrew } from './crew/crew';
import { repairsDue } from './crew/repairs';
import { killedOf, launch, outOf, stepAftermath, stepHits, type Aftermath, type Hit } from './damage';
import { carryOut, giveOrder, heard, masterSteers, wordSpent, type AnswerCode, type Order, type OrderMoment, type RefusalCode, type SailingOrder } from './orders';
import { stepFight, waterIn, type FightEvent } from './end';
import { masterOrder } from './captain/helm';
import { engagedSide, stepGunnery } from './guns/gunnery';
import { leeOf, smokeAfter } from './guns/smoke';
import type { GunFired } from './guns/shot';
import { followWind } from './sea/sea';
import { stepMotion } from './ship/motion';
import { setShares, stepSailing, type SailingEvent } from './ship/sailing';
import { touch, type TouchEvent } from './ship/touch';
import { simTime, type SimShip, type SimState } from './state';
import { meanWind, windAt } from './wind';
import { apartOnWater } from './units';
import { dayElapsed, dayMinutesAt, watchAt } from './day';
import type { Watch } from './rules/day';

/** Something that happened in a step, for the drawing, the sound and the interface; plain data like the state. */
export type SimEvent = OrderRefused | OrderTaken | OrderAnswered | OrderDone | Sailed | ShortHanded | WatchChanged | GunFired | TouchEvent | Hit | Aftermath | FightEvent;

/** The sandbox's watches changed: the new watch (a row of rules/day.ts `WATCHES`) has the deck, the watch `onDeck` (0 larboard, 1 starboard). The hands are piped. */
export interface WatchChanged {
  readonly kind: 'watch';
  readonly tick: number;
  readonly ship: number;
  readonly index: number;
  readonly onDeck: Watch;
}

/** An order the ship could not take: why, as a code (the phrase book, N4.5, words it) and in English for now. */
export interface OrderRefused {
  readonly kind: 'refused';
  /** The tick of the step it was given in. */
  readonly tick: number;
  readonly order: Order;
  readonly code: RefusalCode;
  readonly reason: string;
}

/** An order taken as it was given, without words to say of it: the man addressed answers "Aye aye, sir" (the phrase book, N4.5). */
export interface OrderTaken {
  readonly kind: 'taken';
  readonly tick: number;
  readonly ship: number;
  readonly order: Order;
}

/**
 * An order taken with words the captain must hear (docs/design/orders.md): a course she will not lie, steered full and
 * by instead, or one she reaches only by wearing. The code is what is said (the phrase book, N4.5, words it); the reason
 * is the words in English for now.
 */
export interface OrderAnswered {
  readonly kind: 'answered';
  readonly tick: number;
  readonly ship: number;
  readonly order: Order;
  readonly code: AnswerCode;
  readonly reason: string;
  /** What he answers with, where the answer is a measure (the water in her, t, for "Sound the well"). */
  readonly amount?: number;
}

/** An order carried out: its last act done by the men (the helm put over, the last sail set, the yards swung). */
export interface OrderDone {
  readonly kind: 'done';
  readonly tick: number;
  readonly ship: number;
  readonly order: SailingOrder;
}

/** A ship came through the wind (tacked), round before it (wore), or missed stays and fell back (sailing.ts). */
export interface Sailed {
  readonly kind: SailingEvent;
  readonly tick: number;
  readonly ship: number;
}

/** A job of an order begun with fewer hands than it needs (crew/crew.ts): the first lieutenant says so (N4.5), and it goes slower. */
export interface ShortHanded {
  readonly kind: 'short-handed';
  readonly tick: number;
  readonly ship: number;
  readonly order: SailingOrder;
  /** The job (rules/crew.ts `JOBS`). */
  readonly job: string;
}

/** What a step gives back. */
export interface StepResult {
  readonly state: SimState;
  readonly events: readonly SimEvent[];
}

/** What an order to `ship` is given against in `state`: the tick, the mean wind, the force, the range to the enemy (a duel's other ship) and the water in her. */
export function orderMoment(state: SimState, ship: number): OrderMoment {
  const own = state.ships[ship], other = state.ships.length === 2 ? state.ships[1 - ship] : undefined;
  return {
    tick: state.tick, wind: meanWind(state.wind, simTime(state)), force: state.wind.windForce,
    enemy: own && other ? apartOnWater(own.motion.pose, other.motion.pose) : null, water: own ? waterIn(own.damage) : 0,
  };
}

/** The match one step on, after the `orders` given for this step. */
export function step(state: SimState, orders: readonly Order[] = []): StepResult {
  const events: SimEvent[] = [];
  const t = simTime(state), tick = state.tick;
  const wind = meanWind(state.wind, t);
  let ships = state.ships;
  for (const order of orders) {
    const ship: SimShip | undefined = Number.isInteger(order.ship) ? ships[order.ship] : undefined;
    if (!ship) {
      events.push({ kind: 'refused', tick, order, code: 'no ship', reason: `there is no ship ${order.ship}` });
      continue;
    }
    if (state.fight.end) {
      events.push({ kind: 'refused', tick, order, code: 'fight over', reason: 'the fight is over' });
      continue;
    }
    const answer = giveOrder(ship.told, ship.sailing, order, orderMoment(state, order.ship));
    if (answer.refused) events.push({ kind: 'refused', tick, order, code: answer.code, reason: answer.reason });
    else if (answer.code) events.push({ kind: 'answered', tick, ship: order.ship, order, code: answer.code, reason: answer.reason, ...(answer.amount === undefined ? {} : { amount: answer.amount }) });
    else events.push({ kind: 'taken', tick, ship: order.ship, order });
    if (answer.told !== ship.told) ships = ships.map((s, i) => (i === order.ship ? { ...s, told: answer.told } : s));
  }
  // The master steering by a standing order (steer for her, her on the beam): his own helm orders, said to no one.
  for (let i = 0; i < ships.length; i++) {
    const own = { ...state, ships }, order = masterOrder(own, i), ship = ships[i]!;
    if (!order) continue;
    const answer = masterSteers(ship.told, ship.sailing, order, orderMoment(own, i));
    if (!answer.refused && answer.told !== ship.told) ships = ships.map((s, k) => (k === i ? { ...s, told: answer.told } : s));
  }
  // The shots in flight, each ball's piece of this step traced through the ships as they lie now (damage.ts).
  const hits = stepHits({ seed: state.matchSeed, tick, flying: state.flying, ships: ships.map((s) => ({ pose: s.motion.pose, crew: s.crew, canvas: s.sailing.canvas, guns: s.guns, damage: s.damage, quarters: s.told.quarters })) });
  events.push(...hits.events);
  ships = ships.map((s, i) => (hits.damage[i] === s.damage && hits.guns[i] === s.guns ? s : { ...s, damage: hits.damage[i]!, guns: hits.guns[i]! }));
  // The sandbox's day: the watch that has the deck (watches change at their bells; sim/day.ts), or none in a fight.
  const elapsed = dayElapsed(state.dayStart, tick), watch = elapsed === null ? null : watchAt(elapsed);
  const before = tick > 0 ? dayElapsed(state.dayStart, tick - 1) : null;
  if (watch && before !== null && watchAt(before).index !== watch.index) for (let i = 0; i < ships.length; i++) events.push({ kind: 'watch', tick, ship: i, index: watch.index, onDeck: watch.onDeck });
  const sea = followWind(state.sea, { speed: wind.speed, toward: wind.toward }, t);
  const next = ships.map((s, i) => {
    const pose = s.motion.pose;
    // The men out of the quarter bill (badly hurt, killed), and what the crew does for her life now (crew/repairs.ts).
    const out = outOf(s.damage), repairs = repairsDue(s.damage, s.told, s.crew, tick);
    // At quarters, the side her guns bear on the enemy: her gun crews stand to it (gunnery.ts, crew.ts).
    const enemies = ships.flatMap((o, k) => (k === i ? [] : [o.motion.pose]));
    const quarters = s.told.quarters ? engagedSide(pose, enemies, s.told.aim) : undefined;
    const crewed = stepCrew(s.crew, s.told, { tick, heel: pose.roll, closures: s.closures, captain: null, canvas: s.sailing.canvas, out, killed: killedOf(s.damage), repairs, quarters, ...(watch === null ? {} : { watch: watch.onDeck, minute: dayMinutesAt(state.dayStart, tick)! }) });
    for (const e of crewed.events) {
      const given = s.told.given.find((g) => g.id === e.of);
      if (given) events.push({ kind: 'short-handed', tick, ship: i, order: given.order, job: e.job });
    }
    const carried = carryOut(s.told, setShares(s.sailing, crewed.sails), crewed.done, wind);
    for (const order of carried.done) events.push({ kind: 'done', tick, ship: i, order });
    const here = windAt(state.wind, pose.x, pose.z, t);
    // What her damage leads to this step: the sea in at her holes, spars falling, fire (damage.ts).
    const after = stepAftermath(s.damage, { seed: state.matchSeed, tick, t, ship: i, pose, sea, crew: crewed.crew, sailing: carried.sailing, wind: here, mended: crewed.mended });
    events.push(...after.events);
    const sailed = stepSailing(carried.sailing, pose, here, after.sailing, state.wind.windForce);
    for (const kind of sailed.events) events.push({ kind, tick, ship: i });
    // The duel's one enemy is the other ship (design decisions for N5: she is the target).
    const enemy = ships.length === 2 ? ships[1 - i]!.motion.pose : null;
    const gunnery = stepGunnery({ seed: state.matchSeed, ship: i, tick, t, guns: s.guns, told: s.told, crew: crewed.crew, out, sailing: s.sailing, pose, heel: s.motion.heel, drill: s.drill, smoke: s.smoke, enemy, sea });
    events.push(...gunnery.fired);
    const told = heard(carried.told, sailed.events, sailed.sailing);
    return {
      ...s, motion: stepMotion(s.motion, sea, t, sailed.way, after.load), sailing: sailed.sailing, told: gunnery.spent ? wordSpent(told) : told,
      crew: crewed.crew, guns: gunnery.guns, damage: after.damage,
    };
  });
  // Every shot fired in this step is put in flight (damage.ts); it is first traced in the next step.
  let flying = hits.flying, guns = 0;
  for (const e of events) if (e.kind === 'fired') { flying = launch(flying, e); guns++; }
  // The powder smoke the wind lays on the ship to leeward, and clears (guns/smoke.ts).
  const smoked = next.map((s, i) => {
    const me = ships[i]!.motion.pose, other = ships.length === 2 ? ships[1 - i]!.motion.pose : null;
    const smoke = smokeAfter(s.smoke, guns, other ? leeOf(me.x, me.z, other.x, other.z, wind.x, wind.z) : 0, wind.speed);
    return smoke === s.smoke ? s : { ...s, smoke };
  });
  const touched = touch(state.ships, smoked, tick);
  events.push(...touched.events);
  // Whether a ship is beaten or lost now, and the fight's end (end.ts).
  const fought = stepFight(state.fight, state.ships, touched.ships, tick);
  events.push(...fought.events);
  return { state: { ...state, tick: tick + 1, sea, flying, ships: touched.ships, fight: fought.fight }, events };
}
