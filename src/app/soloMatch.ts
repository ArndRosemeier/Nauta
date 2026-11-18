/**
 * A match stepped on this machine alone (`?sail`, implementation plan N3.5): one brig in the match's wind and sea,
 * commanded from the order panel. A stand-in until the two-player session (N3.7) runs every match, offline too; it
 * has that session's shape (`OrderSession`), so the panel does not change when it goes. Pure: no DOM, no three.js.
 *
 * The page's clock drives it: `advance(t)` steps the match at the fixed rate up to `t`, an order given waiting for the
 * next step (one order a step, as a captain gives them), and `pose(t)` is her pose drawn between her last two steps.
 */
import type { Order } from '../sim/orders';
import { poseBetween, type ShipPose } from '../sim/ship/motion';
import { rigPlan } from '../sim/ship/rig';
import { sailsStanding } from '../sim/ship/sailing';
import { windAt } from '../sim/wind';
import { simTime, startMatch, type SimState } from '../sim/state';
import { step, type SimEvent } from '../sim/step';
import { KNOT, STEP_SECONDS } from '../sim/units';
import type { OrderSession } from './orderReport';

/** Her way at the start, m/s: under way, so the first tack can be ordered at once. */
const START_SPEED = 5 * KNOT;
/** The most steps one call catches up (a tab that slept does not run the match on for minutes in one frame). */
const MOST_STEPS = 10;

/** What sailing alone starts from: the match's seed, the wind's force and bearing, and where she lies (x, z, m; heading, rad). */
export interface SoloStart {
  readonly seed: number;
  readonly windForce: number;
  readonly windFrom: number;
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

export class SoloMatch implements OrderSession {
  readonly ship = 0;
  state: SimState;
  /** Her state one step before `state`, to draw her between the two. */
  private previous: SimState;
  private readonly waiting: Order[] = [];
  private readonly listeners: ((events: readonly SimEvent[]) => void)[] = [];

  constructor(start: SoloStart) {
    this.state = startMatch({
      seed: start.seed, windForce: start.windForce, windFrom: start.windFrom,
      ships: [{ x: start.x, z: start.z, heading: start.heading, speed: START_SPEED }],
    });
    this.previous = this.state;
  }

  give(order: Order): void {
    this.waiting.push({ ...order, ship: this.ship });
  }

  on(_kind: 'events', fn: (events: readonly SimEvent[]) => void): void {
    this.listeners.push(fn);
  }

  /** The match stepped up to the clock's `t`, s (at most `MOST_STEPS` at once; behind, it catches up over the next calls). */
  advance(t: number): void {
    let steps = 0;
    while (simTime(this.state) + STEP_SECONDS <= t && steps < MOST_STEPS) {
      const order = this.waiting.shift();
      const result = step(this.state, order ? [order] : []);
      this.previous = this.state;
      this.state = result.state;
      steps++;
      if (result.events.length > 0) for (const fn of this.listeners) fn(result.events);
    }
  }

  /** Her pose at the clock's `t`: between her last two steps, drawn one step behind the match. */
  pose(t: number): ShipPose {
    const f = Math.min(1, Math.max(0, (t - simTime(this.state)) / STEP_SECONDS));
    return poseBetween(this.previous.ships[this.ship]!.motion.pose, this.state.ships[this.ship]!.motion.pose, f);
  }
}

/**
 * How her turning spars lie in a state, for the drawing (ShipView `setBrace`): each square sail's yard braced as the
 * sailing model trims it, the boom and gaff swung with the boom sail. Pairs of a spar's id and its angle, rad (+ the
 * starboard yardarm aft, the boom's end to starboard); spars no sail turns (the stays a headsail is set on) are left out
 * by the drawing, which knows only its own.
 */
export function sparAngles(state: SimState, ship: number): [id: string, angle: number][] {
  const s = state.ships[ship];
  if (!s) return [];
  const pose = s.motion.pose, sails = rigPlan().sails;
  return sailsStanding(s.sailing, windAt(state.wind, pose.x, pose.z, simTime(state))).flatMap((st, i) => sails[i]!.on.map((id): [string, number] => [id, st.angle]));
}
