/**
 * One step of the match (implementation plan N3.1): the state and the orders given for this step in, the next state
 * and what happened out. Fixed length (`STEP_SECONDS`, 30 a second), pure: the same state and orders give the same
 * next state, bit for bit, on every machine. So the host of a match steps it and the others send their orders as
 * intents (N3.7); a guest that steps the same inputs ends at the same hash.
 *
 * Within a step, in this order: the orders are applied in the order given (the host's list is the truth, so two
 * orders in one step never race), the sea follows the wind's mean at the step's start, and every ship floats one step
 * on that sea under her course.
 */
import { TOP_SPEED } from './rules/ships';
import { followWind } from './sea/sea';
import { stepMotion } from './ship/motion';
import { simTime, type SimShip, type SimState } from './state';
import { wrapBearing } from './units';
import { meanWind } from './wind';

/**
 * An order for one ship, named by her place in `SimState.ships`. For now there is one kind: hold a heading (compass
 * bearing, rad) at a speed (m/s), taken at once. The sailing model (N3.3) and the order vocabulary (N3.4) replace it.
 */
export interface CourseOrder {
  readonly kind: 'course';
  readonly ship: number;
  readonly heading: number;
  readonly speed: number;
}
export type Order = CourseOrder;

/** Something that happened in a step, for the drawing, the sound and the interface; plain data like the state. */
export type SimEvent = OrderRefused;

/** An order the ship could not take, with the reason in words. */
export interface OrderRefused {
  readonly kind: 'refused';
  /** The tick of the step it was given in. */
  readonly tick: number;
  readonly order: Order;
  readonly reason: string;
}

/** What a step gives back. */
export interface StepResult {
  readonly state: SimState;
  readonly events: readonly SimEvent[];
}

/** The match one step on, after the `orders` given for this step. */
export function step(state: SimState, orders: readonly Order[] = []): StepResult {
  const events: SimEvent[] = [];
  let ships = state.ships;
  for (const order of orders) {
    const reason = refusal(ships, order);
    if (reason) {
      events.push({ kind: 'refused', tick: state.tick, order, reason });
      continue;
    }
    ships = ships.map((s, i) => (i === order.ship ? withCourse(s, order) : s));
  }
  const t = simTime(state);
  const { speed, toward } = meanWind(state.wind, t);
  const sea = followWind(state.sea, { speed, toward }, t);
  return {
    state: {
      ...state,
      tick: state.tick + 1,
      sea,
      ships: ships.map((s) => ({ ...s, motion: stepMotion(s.motion, sea, t, s.course) })),
    },
    events,
  };
}

/** Why an order cannot be taken, or '' when it can. */
function refusal(ships: readonly SimShip[], order: Order): string {
  if (!Number.isInteger(order.ship) || !ships[order.ship]) return `there is no ship ${order.ship}`;
  if (!Number.isFinite(order.heading)) return 'the heading is not a number';
  if (!Number.isFinite(order.speed) || order.speed < 0 || order.speed > TOP_SPEED) {
    return `the speed must be between 0 and ${TOP_SPEED.toFixed(1)} m/s`;
  }
  return '';
}

/** The ship holding the course an order gives. */
function withCourse(ship: SimShip, order: CourseOrder): SimShip {
  return { ...ship, course: { heading: wrapBearing(order.heading), speed: order.speed } };
}
