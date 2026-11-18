/**
 * One step of the match (implementation plan N3.1): the state and the orders given for this step in, the next state
 * and what happened out. Fixed length (`STEP_SECONDS`, 30 a second), pure: the same state and orders give the same
 * next state, bit for bit, on every machine. So the host of a match steps it and the others send their orders as
 * intents (N3.7); a guest that steps the same inputs ends at the same hash.
 *
 * Within a step, in this order: the orders are applied in the order given (the host's list is the truth, so two
 * orders in one step never race), the sea follows the wind's mean at the step's start, and every ship sails one step
 * in the true wind at her place (sailing.ts) and floats one step on that sea as her sailing says (motion.ts).
 */
import { CANVAS, type CanvasName } from './rules/sailing';
import type { MastName } from './rules/rig';
import { followWind } from './sea/sea';
import { stepMotion } from './ship/motion';
import { layAback, MASTS, setCanvas, stepSailing, steerTo, type SailingEvent } from './ship/sailing';
import { simTime, type SimShip, type SimState } from './state';
import { meanWind, windAt } from './wind';

/**
 * The orders for one ship, named by her place in `SimState.ships`, each taken at once: steer a heading (compass
 * bearing, rad), turning to it to starboard (+1), to larboard (-1) or the short way (0); set a canvas; lay a mast's
 * yards aback or fill them again. A stand-in vocabulary: the order vocabulary (N3.4) replaces it, with times.
 */
export interface CourseOrder {
  readonly kind: 'course';
  readonly ship: number;
  readonly heading: number;
  readonly turn: number;
}
export interface CanvasOrder {
  readonly kind: 'canvas';
  readonly ship: number;
  readonly canvas: CanvasName;
}
export interface BackOrder {
  readonly kind: 'back';
  readonly ship: number;
  readonly mast: MastName;
  readonly aback: boolean;
}
export type Order = CourseOrder | CanvasOrder | BackOrder;

/** Something that happened in a step, for the drawing, the sound and the interface; plain data like the state. */
export type SimEvent = OrderRefused | Sailed;

/** An order the ship could not take, with the reason in words. */
export interface OrderRefused {
  readonly kind: 'refused';
  /** The tick of the step it was given in. */
  readonly tick: number;
  readonly order: Order;
  readonly reason: string;
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
  let ships = state.ships;
  for (const order of orders) {
    const reason = refusal(ships, order);
    if (reason) {
      events.push({ kind: 'refused', tick: state.tick, order, reason });
      continue;
    }
    ships = ships.map((s, i) => (i === order.ship ? obey(s, order, state.wind.windForce) : s));
  }
  const t = simTime(state);
  const { speed, toward } = meanWind(state.wind, t);
  const sea = followWind(state.sea, { speed, toward }, t);
  return {
    state: {
      ...state,
      tick: state.tick + 1,
      sea,
      ships: ships.map((s, i) => {
        const pose = s.motion.pose;
        const sailed = stepSailing(s.sailing, pose, windAt(state.wind, pose.x, pose.z, t));
        for (const kind of sailed.events) events.push({ kind, tick: state.tick, ship: i });
        return { motion: stepMotion(s.motion, sea, t, sailed.way), sailing: sailed.sailing };
      }),
    },
    events,
  };
}

/** Why an order cannot be taken, or '' when it can. */
function refusal(ships: readonly SimShip[], order: Order): string {
  if (!Number.isInteger(order.ship) || !ships[order.ship]) return `there is no ship ${order.ship}`;
  switch (order.kind) {
    case 'course':
      if (!Number.isFinite(order.heading)) return 'the heading is not a number';
      if (![-1, 0, 1].includes(order.turn)) return 'turn to starboard (1), to larboard (-1) or the short way (0)';
      return '';
    case 'canvas':
      return Object.hasOwn(CANVAS, order.canvas) ? '' : `there is no canvas "${order.canvas}" (${Object.keys(CANVAS).join(', ')})`;
    case 'back':
      return MASTS.includes(order.mast) ? '' : `there is no mast "${order.mast}" (${MASTS.join(', ')})`;
    default:
      return `there is no order "${(order as { kind: string }).kind}"`;
  }
}

/** The ship after an order (each taken at once for now); canvas is set for the match's wind. */
function obey(ship: SimShip, order: Order, force: number): SimShip {
  const s = ship.sailing;
  switch (order.kind) {
    case 'course': return { ...ship, sailing: steerTo(s, order.heading, order.turn) };
    case 'canvas': return { ...ship, sailing: setCanvas(s, order.canvas, force) };
    case 'back': return { ...ship, sailing: layAback(s, order.mast, order.aback) };
  }
}
