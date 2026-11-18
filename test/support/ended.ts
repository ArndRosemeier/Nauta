/** Two brigs lying still in a calm, built for the tests of how a fight ends (end.test.ts, endPlayed.test.ts). */
import { startDamage, type Damage } from '../../src/sim/damage.ts';
import type { Order } from '../../src/sim/orders.ts';
import { startMatch, type SimState } from '../../src/sim/state.ts';
import { step } from '../../src/sim/step.ts';
import { musterCrew } from './muster.ts';

/** Two ships lying still in a calm 300 m apart, the first with the damage `damage`. */
export function pair(damage: Partial<Damage> = {}, minutes?: number): SimState {
  const s = startMatch({ seed: 9, windForce: 0, windFrom: 0, minutes, ships: [{ x: 0, z: 0, heading: Math.PI / 2, canvas: 'bare' }, { x: 0, z: 300, heading: Math.PI / 2, canvas: 'bare' }] });
  return { ...s, ships: s.ships.map((sh, i) => (i === 0 ? { ...sh, crew: musterCrew(), damage: { ...startDamage(), ...damage } } : { ...sh, crew: musterCrew() })) };
}

/** One step with `orders`: the state after and its events. */
export const once = (s: SimState, orders: readonly Order[] = []) => step(s, orders);
