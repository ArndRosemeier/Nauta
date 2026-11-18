/**
 * What is heard of the crew at work (plan N4.6), decided from the simulation alone: the boatswain's call for each
 * order the moment it is taken (orders.ts `told.given`), Haul Away as she comes round, the Still when she misses
 * stays, Carry On when the hands' work is done; bare feet where the men run (crew.ts, `goingAt`), the nearest one foot
 * at a time and the rest as a crowd; the rhythm of each gang hauling at its pin while its work goes on (`tasks`); the
 * ship's bell every five minutes of the match; the drum while she beats to quarters. Nothing speaks: the men's words are
 * bubbles (N4.5). The crew is not drawn yet (N4.3), so every sound stands where the simulation has the man.
 *
 * Pure and seeded: the same states, events and clock give the same sounds. `CrewSound` (crewSound.ts) plays them.
 */
import { clamp, hash3i, hashToFloat, lerp } from '@futuremagic/core';
import { goingAt } from '../sim/crew/going';
import { heightAt, lineLength, routeNetwork } from '../sim/crew/network';
import { jobWork } from '../sim/crew/drill';
import type { Hand, Task } from '../sim/crew/crew';
import { brigRoster, placeSpot } from '../sim/crew/roster';
import type { Order } from '../sim/orders';
import { toWorld, type ShipPose } from '../sim/ship/motion';
import { shipPlan, spacesById, type Spot } from '../sim/ship/plan';
import { MASTS } from '../sim/ship/sailing';
import { shipY } from '../sim/ship/section';
import type { SimShip } from '../sim/state';
import type { SimEvent } from '../sim/step';
import { STEP_SECONDS } from '../sim/units';
import { takeAngle } from './ambience';
import {
  BELL, BELL_ABAFT_FOREMAST, BELL_EVERY, BELL_GAP, BELL_HEIGHT, BELL_PAIR_GAP, BELLS_A_WATCH, CALL_GAP, CALL_STALE, CARRY_ON,
  CROWD_BEDS, CROWD_FULL, CROWD_GAIN, CROWD_GLIDE, CROWD_REACH, CROWD_REF, DRUM, DRUM_GLIDE, DRUM_HEIGHT, FEET_HEIGHT,
  HAULING, HAUL_HEIGHT, HAUL_LEAST, HAUL_PERIOD, HAUL_PULL, HAUL_SPREAD,
  NEAR_FEET, NEAR_REACH, ORDER_CALLS, PIPED_DONE, PIPE_HEIGHT, RUN_STEP, RUN_STRIDE, SAILED_CALLS, SHORT_HANDED_AGAIN,
  SHORT_HANDED_GAIN, STRIKES_A_PAIR, SWING_PERIOD, SWING_PULLS, THROUGH_DECK, WALK_GAIN, WALK_STRIDE, type PipeCall,
} from './crewTuning';
import type { SlapKind } from './tuning';

type Vec3 = readonly [number, number, number];

/** A sound to start: its id, where in the world, how loud, its bus (the ear's side of a deck or the other) and delay, s. */
export interface CrewShot {
  readonly id: string;
  readonly at: Vec3;
  readonly ref: number;
  readonly gain: number;
  readonly bus: 'body' | 'world';
  readonly delay: number;
}

/** A bed to hold this frame (the crowd of feet, the drum): set each frame it is heard, as the engine's beds are. */
export interface CrewBed {
  readonly id: string;
  readonly key: string;
  readonly level: number;
  readonly at: Vec3;
  readonly ref: number;
  readonly glide: number;
  readonly bus: 'body' | 'world';
}

/** One frame of the crew heard. */
export interface CrewScene {
  /** Her state now (the simulation's last step). */
  readonly ship: SimShip;
  /** The simulation's clock, s (`simTime`). */
  readonly t: number;
  /** Her pose as drawn, to place the sounds in the world. */
  readonly pose: ShipPose;
  /** The ear in ship space (+x starboard, +y up from the load waterline, -z forward), and 1 when it is below deck. */
  readonly ear: Vec3;
  readonly below: number;
  /** She beats to quarters (N5.3): the drum. */
  readonly drum: boolean;
}

/** Where and when a sound is heard: the clock, her pose, the ear's side of her decks. */
export type Hearing = Pick<CrewScene, 't' | 'pose' | 'below'>;

/** What a frame gives: the sounds to start (in `shots`) and the beds to hold (in `beds`), both cleared first. */
export interface CrewHeard {
  readonly shots: CrewShot[];
  readonly beds: CrewBed[];
}

/** The seeded draws, each its own stream. */
const DRAW = { haul: 0 } as const;

/** A spot's place in ship space at a height over its floor. */
function shipSpace(spot: Spot, height: number, over: number): Vec3 {
  return [spot.across, shipY(height) + over, -spot.along];
}

let posts: Map<string, number> | null = null;
/** A crew place's spot and floor height, kept (places do not move). */
function placeAt(id: string): { spot: Spot; height: number } {
  posts ??= new Map();
  const spot = placeSpot(id);
  let h = posts.get(id);
  if (h === undefined) { h = heightAt(routeNetwork(), spot); posts.set(id, h); }
  return { spot, height: h };
}

/** Where a man is: on his way, standing where he got to, or at his post; and his floor's height. */
function manAt(hand: Hand, post: string): { spot: Spot; height: number } {
  if (hand.going) { const w = goingAt(hand.going); return { spot: w, height: w.height }; }
  return hand.stands ? { spot: hand.stands, height: heightAt(routeNetwork(), hand.stands) } : placeAt(post);
}

let decks: ReadonlyMap<string, boolean> | null = null;
/** Whether a spot is below deck: a space of the plan under a deck (the weather deck and everything aloft are open air). */
export function belowDeck(space: string): boolean {
  decks ??= new Map([...spacesById(shipPlan())].map(([id, s]) => [id, s.level !== 'weather']));
  return decks.get(space) ?? false;
}

/**
 * The ship's bell for the match's clock moved from `before` to `now`, s: the strikes' delays from now, s, when it
 * passed a time the bell is struck (every BELL_EVERY, one bell more each time up to eight, then from one again, in
 * pairs), else an empty list.
 */
export function bellStrikes(before: number, now: number): number[] {
  const n = Math.floor(now / BELL_EVERY);
  if (n < 1 || n === Math.floor(before / BELL_EVERY) || now < before) return [];
  const strikes = ((n - 1) % BELLS_A_WATCH) + 1;
  const out: number[] = [];
  for (let k = 0, at = 0; k < strikes; k++) {
    out.push(at);
    at += k % STRIKES_A_PAIR === 0 ? BELL_PAIR_GAP : BELL_GAP;
  }
  return out;
}

/** A gang's pull loudness by the share of its hands told off (skill over need). */
export function pullLoudness(share: number): number {
  return HAUL_PULL.gain * lerp(HAUL_LEAST, 1, Math.sqrt(clamp(share, 0, 1)));
}

/** A call waiting its turn. */
interface Waiting {
  readonly call: PipeCall;
  readonly gain: number;
  readonly wanted: number;
}

/** A man on his way followed: where he was in plan, how far he has gone since his last footfall. */
interface Feet {
  at: Spot;
  went: number;
}

export class CrewWatch {
  private readonly roster = brigRoster();
  private readonly boatswain = this.roster.findIndex((m) => m.rank === 'boatswain');
  private readonly drummer = this.roster.findIndex((m) => m.rank === 'drummer');
  private readonly events: SimEvent[] = [];
  private readonly calls: Waiting[] = [];
  /** No call before this, s: the one before it is still sounding. */
  private callFree = -Infinity;
  /** The highest order id already piped (null: not looked yet: what was given before sound began is not piped). */
  private piped: number | null = null;
  /** When each kind of order was last piped again for more hands, s. */
  private readonly again = new Map<string, number>();
  private readonly feet = new Map<number, Feet>();
  private readonly pulls = new Map<number, { next: number; n: number }>();
  /** Pulls of the braces still to come as she comes round, s. */
  private bracePulls: number[] = [];
  private clock: number | null = null;

  constructor(private readonly seed: number, private readonly shipIndex = 0) {}

  /** Events of a step (`step`'s, or a session's listener): kept until the next frame; other ships' are left out. */
  note(events: readonly SimEvent[]): void {
    for (const e of events) if ((e.kind === 'refused' ? e.order.ship : e.ship) === this.shipIndex) this.events.push(e);
  }

  /** One frame: what of the crew is heard now. */
  listen(s: CrewScene, out: CrewHeard): CrewHeard {
    out.shots.length = 0;
    out.beds.length = 0;
    this.takeOrders(s);
    this.takeEvents(s);
    this.pipe(s, out);
    this.footfalls(s, out);
    this.hauling(s, out);
    this.bell(s, out);
    if (s.drum) {
      const d = manAt(s.ship.crew.men[this.drummer]!, this.roster[this.drummer]!.post);
      out.beds.push(this.bed(s, DRUM, DRUM.id, DRUM.gain, d.spot, d.height, DRUM_HEIGHT, DRUM_GLIDE));
    }
    return out;
  }

  /** One frame with no match running (her decks without a crew in the simulation): only the bell, by the page's clock. */
  bellAlone(h: Hearing, out: CrewHeard): CrewHeard {
    out.shots.length = 0;
    out.beds.length = 0;
    this.bell(h, out);
    return out;
  }

  /** Every order taken since the last look waits for its call, in the order given. */
  private takeOrders(s: CrewScene): void {
    const given = s.ship.told.given;
    const top = given.reduce((m, g) => Math.max(m, g.id), -1);
    if (this.piped === null) { this.piped = top; return; }
    for (const g of given) if (g.id > this.piped) this.wait(ORDER_CALLS[g.order.kind], ORDER_CALLS[g.order.kind].gain, g.tick * STEP_SECONDS);
    this.piped = Math.max(this.piped, top);
  }

  private takeEvents(s: CrewScene): void {
    for (const e of this.events) {
      if (e.kind === 'done') { if (PIPED_DONE.has(e.order.kind)) this.wait(CARRY_ON, CARRY_ON.gain, s.t); }
      else if (e.kind === 'short-handed') this.pipeAgain(e.order, s.t);
      else if (e.kind !== 'refused') {
        for (const c of SAILED_CALLS[e.kind]) this.wait(c, c.gain, s.t);
        if (e.kind !== 'missed stays') this.bracePulls = Array.from({ length: SWING_PULLS }, (_, k) => s.t + k * SWING_PERIOD);
      }
    }
    this.events.length = 0;
  }

  /** Too few hands: the order's call once more, a little quieter, at most once in a while for each kind. */
  private pipeAgain(order: Order, t: number): void {
    const last = this.again.get(order.kind);
    if (last !== undefined && t - last < SHORT_HANDED_AGAIN) return;
    this.again.set(order.kind, t);
    this.wait(ORDER_CALLS[order.kind], ORDER_CALLS[order.kind].gain * SHORT_HANDED_GAIN, t);
  }

  private wait(call: PipeCall, gain: number, t: number): void {
    this.calls.push({ call, gain, wanted: t });
  }

  /** The next call when the last has ended, from the boatswain where he is; one too long waiting is dropped. */
  private pipe(s: CrewScene, out: CrewHeard): void {
    while (this.calls.length > 0 && s.t >= this.callFree) {
      const w = this.calls.shift()!;
      if (s.t - w.wanted > CALL_STALE) continue;
      const b = manAt(s.ship.crew.men[this.boatswain]!, this.roster[this.boatswain]!.post);
      out.shots.push(this.shot(s, w.call, w.gain, b.spot, b.height, PIPE_HEIGHT, 0));
      this.callFree = s.t + w.call.seconds + CALL_GAP;
    }
  }

  /**
   * Bare feet: each man on his way on a floor comes down a foot each stride; the nearest few are heard one by one,
   * the other runners in reach as the crowd's bed amid them, as loud as the root of their number allows.
   */
  private footfalls(s: CrewScene, out: CrewHeard): void {
    const men = s.ship.crew.men, near: { d: number; i: number; spot: Spot; height: number; run: boolean }[] = [];
    let crowd = 0, ca = 0, cx = 0, ch = 0, cBelow = 0, belowSpace = 'deck';
    men.forEach((h, i) => {
      if (!h.going) { this.feet.delete(i); return; }
      const w = goingAt(h.going);
      const f = this.feet.get(i);
      if (w.way !== null || !f) { this.feet.set(i, { at: w, went: 0 }); return; }
      const run = h.going.haste === 'smart';
      f.went += lineLength([f.at, w]);
      f.at = w;
      const p = shipSpace(w, w.height, FEET_HEIGHT), d = Math.hypot(p[0] - s.ear[0], p[1] - s.ear[1], p[2] - s.ear[2]);
      const stride = run ? RUN_STRIDE : WALK_STRIDE;
      const down = f.went >= stride;
      if (down) f.went -= stride * Math.floor(f.went / stride);
      if (down && d <= NEAR_REACH) near.push({ d, i, spot: w, height: w.height, run });
      if (run && d <= CROWD_REACH && d > NEAR_REACH) { crowd++; ca += w.along; cx += w.across; ch += w.height; if (belowDeck(w.space)) { cBelow++; belowSpace = w.space; } }
    });
    near.sort((a, b) => a.d - b.d || a.i - b.i);
    for (const n of near.slice(0, NEAR_FEET)) out.shots.push(this.shot(s, RUN_STEP, RUN_STEP.gain * (n.run ? 1 : WALK_GAIN), n.spot, n.height, FEET_HEIGHT, 0));
    if (crowd === 0) return;
    const mid: Spot = { space: cBelow * 2 > crowd ? belowSpace : 'deck', along: ca / crowd, across: cx / crowd };
    const level = CROWD_GAIN * Math.sqrt(Math.min(1, crowd / CROWD_FULL));
    CROWD_BEDS.forEach((id, k) => {
      const angle = takeAngle(this.seed, id, s.t), share = k === 0 ? Math.cos(angle) : Math.sin(angle);
      out.beds.push(this.bed(s, { id, gain: level, ref: CROWD_REF }, id, level * share, mid, ch / crowd, FEET_HEIGHT, CROWD_GLIDE));
    });
  }

  /** Each gang at work hauling at its pin: a pull each of its periods, from the pin, by the share of its hands. */
  private hauling(s: CrewScene, out: CrewHeard): void {
    const live = new Set<number>();
    for (const task of s.ship.crew.tasks) {
      if (task.began === null || !HAULING.has(task.job)) continue;
      const work = jobWork(task.job, task.on);
      if (work.places.length === 0) continue;
      live.add(task.id);
      let p = this.pulls.get(task.id);
      if (!p) { p = { next: s.t, n: 0 }; this.pulls.set(task.id, p); }
      if (s.t < p.next) continue;
      const at = placeAt(work.places[0]!);
      out.shots.push(this.shot(s, HAUL_PULL, pullLoudness(this.share(task, work.need)), at.spot, at.height, HAUL_HEIGHT, 0));
      p.n++;
      p.next = s.t + HAUL_PERIOD * (1 + HAUL_SPREAD * (2 * hashToFloat(hash3i(this.seed, task.id, p.n, DRAW.haul)) - 1));
    }
    for (const id of this.pulls.keys()) if (!live.has(id)) this.pulls.delete(id);
    // As she comes round, the main braces are swung: a few quick pulls there.
    while (this.bracePulls.length > 0 && s.t >= this.bracePulls[0]!) {
      this.bracePulls.shift();
      const at = placeAt(mainBracePin());
      out.shots.push(this.shot(s, HAUL_PULL, HAUL_PULL.gain, at.spot, at.height, HAUL_HEIGHT, 0));
    }
  }

  private share(task: Task, need: number): number {
    return task.hands.reduce((sum, i) => sum + this.roster[i]!.skill, 0) / need;
  }

  /** The bell, struck where it hangs as the match's clock passes each of its times. */
  private bell(s: Hearing, out: CrewHeard): void {
    const was = this.clock;
    this.clock = s.t;
    if (was === null) return;
    const strikes = bellStrikes(was, s.t);
    if (strikes.length === 0) return;
    const fore = shipPlan().masts.find((m) => m.mast === 'fore')!;
    const spot: Spot = { space: 'deck', along: fore.along - BELL_ABAFT_FOREMAST, across: 0 };
    const height = heightAt(routeNetwork(), spot);
    for (const delay of strikes) out.shots.push(this.shot(s, BELL, BELL.gain, spot, height, BELL_HEIGHT, delay));
  }

  /** A sound at a spot: in the world by her pose; on the ear's side of her decks close and clear (the ship's own bus), across one muffled and quieter (the world's). */
  private shot(s: Hearing, kind: SlapKind, gain: number, spot: Spot, height: number, over: number, delay: number): CrewShot {
    const at = toWorld(s.pose, ...shipSpace(spot, height, over)), near = belowDeck(spot.space) === s.below > 0;
    return { id: kind.id, at, ref: kind.ref, gain: near ? gain : gain * THROUGH_DECK, bus: near ? 'body' : 'world', delay };
  }

  /** A bed at a spot, placed and heard as a sound there is. */
  private bed(s: Hearing, kind: SlapKind, key: string, level: number, spot: Spot, height: number, over: number, glide: number): CrewBed {
    const p = this.shot(s, kind, level, spot, height, over, 0);
    return { id: p.id, key, level: p.gain, at: p.at, ref: p.ref, glide, bus: p.bus };
  }
}

let brace: string | null = null;
/** The pin of the main braces the men swing the yards at (the first place of the main yards' brace job, drill.ts). */
function mainBracePin(): string {
  brace ??= jobWork('brace', MASTS.indexOf('main')).places[0]!;
  return brace;
}
