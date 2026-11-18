/**
 * The match the page sails (`?sail`, `?room`, `?join=`; plans N3.5 and N3.7): the one DuelSession running now, alone
 * at first and then a room's when the captain opens or joins one, behind one face, so the order panel, the ship views
 * and the sea never need to know which. It hands each step's events of the session running now to the panel
 * (`OrderSession`), pumps the session every frame and from a timer (a host whose tab is hidden keeps the match going),
 * gives the poses to draw this frame, and how her turning spars lie (`sparAngles`). No DOM, no three.js.
 */
import type { Order } from '../sim/orders';
import type { ShipPose } from '../sim/ship/motion';
import { rigPlan } from '../sim/ship/rig';
import { sailsStanding } from '../sim/ship/sailing';
import { windAt } from '../sim/wind';
import { simTime, type SimState } from '../sim/state';
import type { SimEvent } from '../sim/step';
import { MS_PER_SECOND } from '../sim/units';
import { DuelSession, type Drawn } from '../net/duel';
import type { OrderSession } from './orderReport';

/** The page's clock, s: what every session on the page runs by. */
export const pageSeconds = (): number => performance.now() / MS_PER_SECOND;

/** How often the timer pumps the match besides the frames, ms (hidden tabs run timers about once a second). */
const PUMP_MS = 100;

export class PageMatch implements OrderSession {
  private current: DuelSession;
  private drawnNow: Drawn;
  private readonly heard = new Set<(events: readonly SimEvent[]) => void>();
  private readonly changed = new Set<() => void>();

  constructor(build: string, seed: number | null, now = pageSeconds) {
    this.current = this.attach(new DuelSession({ build, now, seed: seed ?? undefined }));
    this.drawnNow = this.current.drawn();
    setInterval(() => this.current.pump(), PUMP_MS);
  }

  /** The session running now. */
  get session(): DuelSession {
    return this.current;
  }

  /** My ship (the first while I have none: a captain who could not be seated watches her). */
  get ship(): number {
    return Math.max(0, this.current.mine);
  }

  /** The other ship, or -1 when the match has only mine. */
  get other(): number {
    return this.state.ships.length > 1 ? 1 - this.ship : -1;
  }

  get state(): SimState {
    return this.current.state;
  }

  give(order: Order): void {
    this.current.give(order);
  }

  on(_kind: 'events', fn: (events: readonly SimEvent[]) => void): void {
    this.heard.add(fn);
  }

  /** Called when the session changes, or its role, players or problem do. */
  onChange(fn: () => void): void {
    this.changed.add(fn);
  }

  /** Runs `s` from now on, as soon as its match has begun. */
  use(s: DuelSession): void {
    const swap = () => {
      if (!s.started || this.current === s) return;
      this.current = this.attach(s);
      this.drawnNow = s.drawn();
      for (const fn of this.changed) fn();
    };
    if (s.started) swap(); else s.on('change', swap);
  }

  /** Once a frame: the match run up to the clock, and what to draw of it. */
  frame(): Drawn {
    this.current.pump();
    this.drawnNow = this.current.drawn();
    return this.drawnNow;
  }

  /** A ship's pose as drawn this frame; null: no such ship. */
  pose(ship: number): ShipPose | null {
    return this.current.pose(ship, this.drawnNow);
  }

  /** A line for the HUD. */
  line(): string {
    return this.current.line();
  }

  private attach(s: DuelSession): DuelSession {
    s.on('events', (events) => { if (this.current === s) for (const fn of this.heard) fn(events); });
    s.on('change', () => { if (this.current === s) for (const fn of this.changed) fn(); });
    return s;
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
