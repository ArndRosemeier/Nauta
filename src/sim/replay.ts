/**
 * Running a match on through a log of orders (implementation plan N3.1): what a guest does with the orders the host
 * passes on (N3.7), what a saved match replays, and how the tests show that the same orders give the same state.
 * Pure.
 */
import { step, type Order, type SimEvent } from './step';
import type { SimState } from './state';

/** The orders of one step, by the tick of the step they are given in. Ticks without orders are left out. */
export interface LoggedOrders {
  readonly tick: number;
  readonly orders: readonly Order[];
}

/**
 * The match stepped from `state` until its tick reaches `until`, giving each step the orders logged for its tick
 * (`log` sorted by tick; entries before the state's tick are skipped). `each` sees every new state and its events.
 */
export function replay(
  state: SimState, log: readonly LoggedOrders[], until: number,
  each?: (state: SimState, events: readonly SimEvent[]) => void,
): SimState {
  let next = 0;
  while (next < log.length && log[next]!.tick < state.tick) next++;
  while (state.tick < until) {
    const entry = log[next];
    const orders = entry && entry.tick === state.tick ? (next++, entry.orders) : [];
    const result = step(state, orders);
    state = result.state;
    each?.(state, result.events);
  }
  return state;
}
