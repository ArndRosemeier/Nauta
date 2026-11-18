/**
 * One step of the match (implementation plan N3.1): the state and the orders given for this step in, the next state
 * and what happened out. Fixed length (`STEP_SECONDS`, 30 a second), pure: the same state and orders give the same
 * next state, bit for bit, on every machine. So the host of a match steps it and the others send their orders as
 * intents (N3.7); a guest that steps the same inputs ends at the same hash.
 *
 * Within a step, in this order: the orders are given in the order listed (the host's list is the truth, so two
 * orders in one step never race; orders.ts answers each, taken or refused with its reason), the sea follows the
 * wind's mean at the step's start, and every ship has the acts of her orders falling due now carried out (orders.ts),
 * sails one step in the true wind at her place (sailing.ts) and floats one step on that sea as her sailing says
 * (motion.ts).
 */
import { carryOut, giveOrder, heard, type Order } from './orders';
import { followWind } from './sea/sea';
import { stepMotion } from './ship/motion';
import { stepSailing, type SailingEvent } from './ship/sailing';
import { simTime, type SimShip, type SimState } from './state';
import { meanWind, windAt } from './wind';

/** Something that happened in a step, for the drawing, the sound and the interface; plain data like the state. */
export type SimEvent = OrderRefused | OrderDone | Sailed;

/** An order the ship could not take, with the reason in words. */
export interface OrderRefused {
  readonly kind: 'refused';
  /** The tick of the step it was given in. */
  readonly tick: number;
  readonly order: Order;
  readonly reason: string;
}

/** An order carried out: its last act done (the helm put over, the last sail set, the yards swung), by the time table until the crew exists (orders.ts). */
export interface OrderDone {
  readonly kind: 'done';
  readonly tick: number;
  readonly ship: number;
  readonly order: Order;
}

/** A ship came through the wind (tacked), round before it (wore), or missed stays and fell back (sailing.ts). */
export interface Sailed {
  readonly kind: SailingEvent;
  readonly tick: number;
  readonly ship: number;
}

/** What a step gives back. */
export interface StepResult {
  readonly state: SimState;
  readonly events: readonly SimEvent[];
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
      events.push({ kind: 'refused', tick, order, reason: `there is no ship ${order.ship}` });
      continue;
    }
    const answer = giveOrder(ship.told, ship.sailing, order, { tick, wind, force: state.wind.windForce });
    if (answer.reason) events.push({ kind: 'refused', tick, order, reason: answer.reason });
    if (answer.told !== ship.told) ships = ships.map((s, i) => (i === order.ship ? { ...s, told: answer.told } : s));
  }
  const sea = followWind(state.sea, { speed: wind.speed, toward: wind.toward }, t);
  return {
    state: {
      ...state,
      tick: tick + 1,
      sea,
      ships: ships.map((s, i) => {
        const carried = carryOut(s.told, s.sailing, tick, wind);
        for (const order of carried.done) events.push({ kind: 'done', tick, ship: i, order });
        const pose = s.motion.pose;
        const sailed = stepSailing(carried.sailing, pose, windAt(state.wind, pose.x, pose.z, t));
        for (const kind of sailed.events) events.push({ kind, tick, ship: i });
        return { motion: stepMotion(s.motion, sea, t, sailed.way), sailing: sailed.sailing, told: heard(carried.told, sailed.events, sailed.sailing) };
      }),
    },
    events,
  };
}
