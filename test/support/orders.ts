/**
 * Orders given to one brig in a whole match (sea and wind), shared by the order tests (test/orders.test.ts, the
 * vocabulary, refusals and manoeuvres; test/ordersCrew.test.ts, the crew carrying them out).
 */
import type { Order, OrderKind } from '../../src/sim/orders.ts';
import { simTime, startMatch, type SimState } from '../../src/sim/state.ts';
import { meanWind } from '../../src/sim/wind.ts';
import { step, type SimEvent } from '../../src/sim/step.ts';
import { DEGREE, STEPS_PER_SECOND } from '../../src/sim/units.ts';

export const SEED = 1805;
/** The wind blows from the north: a heading is then the wind's angle off her bow, to starboard of it on the larboard tack. */
export const FROM = 0;
export const FRESH = 5;
export const MODERATE = 4;

/** One brig in a match, `angle` degrees off the wind (to the east: the wind on her larboard side), sailed on for `settle` s. */
export function underWay(force: number, angle: number, settle = 20, canvas: 'battle' | 'plain' | 'bare' = 'battle', speed = 3): SimState {
  let s = startMatch({ seed: SEED, windForce: force, windFrom: FROM, ships: [{ x: 0, z: 0, heading: angle * DEGREE, canvas, speed }] });
  for (let i = 0; i < settle * STEPS_PER_SECOND; i++) s = step(s).state;
  return s;
}

/** Stepped on for `seconds`, the `orders` given in the first step; every event with the time it came, s from the start. */
export function run(s: SimState, seconds: number, orders: readonly Order[] = [], each?: (s: SimState, t: number) => void): { state: SimState; events: { t: number; e: SimEvent }[] } {
  const events: { t: number; e: SimEvent }[] = [];
  for (let i = 0; i < seconds * STEPS_PER_SECOND; i++) {
    const r = step(s, i === 0 ? orders : []);
    s = r.state;
    for (const e of r.events) events.push({ t: i / STEPS_PER_SECOND, e });
    each?.(s, i / STEPS_PER_SECOND);
  }
  return { state: s, events };
}

/** The mean wind's bearing in a state (what the master judges by). */
export const windFrom = (s: SimState): number => meanWind(s.wind, simTime(s)).from;
export const kinds = (events: { e: SimEvent }[]) => events.map(({ e }) => e.kind);
export const reasons = (events: { e: SimEvent }[]) => events.flatMap(({ e }) => (e.kind === 'refused' ? [e.reason] : []));
/** The master's answers to orders taken with words, code and words. */
export const answers = (events: { e: SimEvent }[]) => events.flatMap(({ e }) => (e.kind === 'answered' ? [`${e.code}: ${e.reason}`] : []));

/** One order of each kind of the vocabulary, for ship 0. */
export const EACH: Readonly<Record<OrderKind, Order>> = {
  steer: { kind: 'steer', ship: 0, heading: 120 * DEGREE },
  up: { kind: 'up', ship: 0 }, away: { kind: 'away', ship: 0 }, by: { kind: 'by', ship: 0 },
  tack: { kind: 'tack', ship: 0 }, wear: { kind: 'wear', ship: 0 }, heave: { kind: 'heave', ship: 0 },
  sail: { kind: 'sail', ship: 0, canvas: 'plain' }, shorten: { kind: 'shorten', ship: 0 },
  back: { kind: 'back', ship: 0, mast: 'main' }, fill: { kind: 'fill', ship: 0 },
  quarters: { kind: 'quarters', ship: 0 }, stand: { kind: 'stand', ship: 0 },
  shot: { kind: 'shot', ship: 0, shot: 'chain' }, aim: { kind: 'aim', ship: 0, at: 'rigging' },
  bear: { kind: 'bear', ship: 0 }, hold: { kind: 'hold', ship: 0 }, fire: { kind: 'fire', ship: 0 }, cease: { kind: 'cease', ship: 0 },
  pumps: { kind: 'pumps', ship: 0 }, fires: { kind: 'fires', ship: 0 }, wreckage: { kind: 'wreckage', ship: 0 },
  plug: { kind: 'plug', ship: 0 }, pumping: { kind: 'pumping', ship: 0 }, strike: { kind: 'strike', ship: 0 },
};
