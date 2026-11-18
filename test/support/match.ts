/**
 * A duel to test the simulation frame with (N3.1): two brigs a few cables apart in a seeded sea, and a seeded script
 * of orders for both from the whole vocabulary (orders.ts). Shared by the frame's tests and its ten-minute slow check (tools/sim/replay.ts).
 */
import { Rng } from '@futuremagic/core';
import type { LoggedOrders } from '../../src/sim/replay.ts';
import type { Order } from '../../src/sim/orders.ts';
import { WIND_PRESETS } from '../../src/sim/rules/wind.ts';
import { startMatch, type MatchSetup } from '../../src/sim/state.ts';
import { STEPS_PER_SECOND } from '../../src/sim/units.ts';

/** The strongest wind the game sails in. */
export const STRONGEST = WIND_PRESETS.length - 1;

/** Two brigs about 500 m apart, on crossing headings. */
export function duelSetup(seed: number, windForce = STRONGEST): MatchSetup {
  return { seed, windForce, windFrom: 0.7, ships: [{ x: 0, z: 0, heading: 0.3 }, { x: 420, z: -260, heading: 3.6 }] };
}

export const duel = (seed: number, windForce = STRONGEST) => startMatch(duelSetup(seed, windForce));

/** About how often an order is given in the script, s. */
const ORDER_GAP = 7;

/** The orders the script gives, by how often (the rest are courses). */
const SCRIPT_PLAIN = ['up', 'away', 'by', 'tack', 'wear', 'heave', 'fill', 'shorten'] as const;
const SCRIPT_CANVAS = ['battle', 'plain', 'all'] as const;
const SCRIPT_MASTS = ['fore', 'main'] as const;
/** Shares of the script: a course, a canvas, a mast backed; the rest the plain orders. */
const COURSE_SHARE = 0.4;
const CANVAS_SHARE = 0.25;
const BACK_SHARE = 0.1;

/** One seeded order of the whole vocabulary for `ship`. */
function scriptOrder(rng: Rng, ship: number): Order {
  const pick = rng.range(0, 1);
  if (pick < COURSE_SHARE) return { kind: 'steer', ship, heading: rng.range(0, 2 * Math.PI) };
  if (pick < COURSE_SHARE + CANVAS_SHARE) return { kind: 'sail', ship, canvas: SCRIPT_CANVAS[rng.int(0, SCRIPT_CANVAS.length - 1)]! };
  if (pick < COURSE_SHARE + CANVAS_SHARE + BACK_SHARE) return { kind: 'back', ship, mast: SCRIPT_MASTS[rng.int(0, SCRIPT_MASTS.length - 1)]! };
  return { kind: SCRIPT_PLAIN[rng.int(0, SCRIPT_PLAIN.length - 1)]!, ship };
}

/** A seeded script of orders for both ships over `seconds`: an order every few seconds, now and then two at once, from the whole vocabulary. */
export function orderScript(seed: number, seconds: number): LoggedOrders[] {
  const rng = new Rng(seed), log: LoggedOrders[] = [];
  for (let tick = rng.int(0, ORDER_GAP * STEPS_PER_SECOND); tick < seconds * STEPS_PER_SECOND; tick += rng.int(1, 2 * ORDER_GAP * STEPS_PER_SECOND)) {
    const ships = rng.chance(0.2) ? [0, 1] : [rng.int(0, 1)];
    log.push({ tick, orders: ships.map((ship) => scriptOrder(rng, ship)) });
  }
  return log;
}
