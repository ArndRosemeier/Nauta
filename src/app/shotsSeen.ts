/**
 * What is seen of gunfire (plan N5.4a), from the step's events and the shots in flight in the state: each gun's
 * flash, first puff and burning wad at her muzzle the instant she fires, every ball along its path while it flies, a splash where a
 * ball touches the sea (each skip and the last plunge), and a flash of splinters where shot strikes a ship. The
 * drawing (render/gunfire.ts, render/spray.ts, the sea's wake maps) shows what this hands it; a shot's whole flight is
 * in its event (N5.2), so nothing but what is still to be seen is kept. Pure.
 *
 * Times are the match's clock as drawn (the page's `match.frame().time`): a gun fired in the step of tick `k` fires at
 * `k / 30` s and her ball is `t - k / 30` s along its path. Events come when a step is worked out, up to a step before
 * it is drawn, or long before after a jump (the browser checks' `onward`): each sight is handed over once its time
 * has come, with that time, and dropped once it would be over (`STALE`).
 *
 * A ball damage stopped in a ship (N6.1: lodged, or spent in her timber) is no longer in flight in the state; from the
 * first state that says so it is not drawn and its later touches throw no splash.
 */
import { pathAt, type GunFired, type Shot, type Vec } from '../sim/guns/shot';
import { GONE, type Hit } from '../sim/damage';
import type { SimState } from '../sim/state';
import type { SimEvent } from '../sim/step';
import { STEP_SECONDS } from '../sim/units';
import { PATH_STEP, SHOT } from '../sim/rules/guns';
import { battery } from '../sim/guns/guns';

/** A sight older than this is not handed over, s: everything it draws is over by then (a puff, a splash's drops). */
export const STALE = 3;
/** A ball is drawn as the stretch of its path over this much time behind it, s (what the eye smears into a streak). */
export const STREAK = 1 / 60;
/** What strikes a ship throws splinters: her timber, a gun, a spar, the steering; a man, a line or a sail does not. */
const SPLINTERING: ReadonlySet<Hit['what']> = new Set(['hole', 'lodged', 'splinters', 'gun', 'spar', 'steering']);

/** A gun fired: when, her ship and gun, her muzzle (the world) and which way the shot left (a unit direction), and the shot's kind. */
export interface Flash {
  readonly t: number;
  readonly ship: number;
  readonly gun: number;
  readonly at: Vec;
  readonly dir: Vec;
  /** How fast the shot leaves the muzzle, m/s. */
  readonly speed: number;
  readonly shot: Shot['shot'];
}

/** A ball touching the sea: when, where (the world), how fast it came in (m/s) and its diameter (m); `skip`: it flies on. */
export interface Splash {
  readonly t: number;
  readonly at: Vec;
  readonly speed: number;
  readonly size: number;
  readonly skip: boolean;
}

/** Shot striking a ship: when, the ship, where in her (along, across, height above her base, m), and what it struck. */
export interface Strike {
  readonly t: number;
  readonly ship: number;
  readonly at: readonly [number, number, number];
  readonly what: Hit['what'];
}

/** A ball as drawn now: its streak's ends (the world) and its diameter, m. */
export interface BallSeen {
  readonly from: Vec;
  readonly to: Vec;
  readonly size: number;
}

/** A shot on its way: fired at `t`, and when each ball was stopped in a ship (Infinity: not). */
interface OnWay {
  readonly t: number;
  readonly fired: GunFired;
  /** Her balls' diameter, m. */
  readonly size: number;
  readonly stopped: number[];
  /** How many of each ball's touches have been handed over. */
  readonly touched: number[];
}

const key = (ship: number, gun: number, tick: number): string => `${ship}|${gun}|${tick}`;

/** One frame's sights. */
export interface GunfireSeen {
  readonly flashes: Flash[];
  readonly splashes: Splash[];
  readonly strikes: Strike[];
  readonly balls: BallSeen[];
}

export class ShotsSeen {
  private readonly onWay = new Map<string, OnWay>();
  private readonly flashes: Flash[] = [];
  private readonly strikes: Strike[] = [];
  /** When each ship's gun last fired (`ship|gun`), s. */
  private readonly lastFired = new Map<string, number>();
  private readonly out: GunfireSeen = { flashes: [], splashes: [], strikes: [], balls: [] };

  /** A step's events: guns fired and shot striking. */
  take(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind === 'fired') this.keepShot(e);
      else if (e.kind === 'hit' && SPLINTERING.has(e.what)) this.strikes.push({ t: e.tick * STEP_SECONDS, ship: e.ship, at: e.at, what: e.what });
    }
  }

  private keepShot(e: GunFired): void {
    const t = e.tick * STEP_SECONDS, ball = e.fired.balls[0];
    this.lastFired.set(`${e.ship}|${e.gun}`, t);
    if (!ball || ball.path.length < 2) return;
    const [a, b] = [ball.path[0]!, ball.path[1]!], d = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) || 1;
    this.flashes.push({ t, ship: e.ship, gun: e.gun, at: a, dir: [(b[0] - a[0]) / d, (b[1] - a[1]) / d, (b[2] - a[2]) / d], speed: d / PATH_STEP, shot: e.fired.shot });
    this.onWay.set(key(e.ship, e.gun, e.tick), {
      t, fired: e, size: SHOT[e.fired.shot].diameter[battery()[e.gun]!.gun], stopped: e.fired.balls.map(() => Infinity), touched: e.fired.balls.map(() => 0),
    });
  }

  /** Seconds since `ship`'s gun `gun` fired at `t`, NaN when it has not been seen to. */
  firedFor(ship: number, gun: number, t: number): number {
    const at = this.lastFired.get(`${ship}|${gun}`);
    return at === undefined ? Number.NaN : t - at;
  }

  /** What the state says of the shots in flight: a ball no longer flying before its path's end was stopped in a ship. */
  watch(state: SimState): void {
    const now = state.tick * STEP_SECONDS;
    for (const [k, w] of this.onWay) {
      const f = state.flying.find((x) => key(x.by, x.gun, x.tick) === k);
      w.fired.fired.balls.forEach((ball, b) => {
        const gone = !f || f.spent[b] === GONE;
        // Gone before its path's end (less a step): stopped in her; gone at its end: plunged into the sea.
        if (gone && w.stopped[b] === Infinity && now - w.t < ball.ends - STEP_SECONDS && now > w.t) w.stopped[b] = now;
      });
    }
  }

  /** The sights of a frame drawn at `t` (reused each frame: read before the next call). */
  sightsAt(t: number): GunfireSeen {
    const out = this.out;
    out.flashes.length = out.splashes.length = out.strikes.length = out.balls.length = 0;
    handOver(this.flashes, t, out.flashes);
    handOver(this.strikes, t, out.strikes);
    for (const [k, w] of this.onWay) {
      const along = t - w.t, size = w.size;
      let left = false;
      w.fired.fired.balls.forEach((ball, b) => {
        const end = Math.min(ball.ends, w.stopped[b]! - w.t);
        // Its touches as their time comes (a skip flies on; the last is the plunge), none after it was stopped.
        while (w.touched[b]! < ball.splashes.length && ball.splashes[w.touched[b]!]! <= Math.min(along, end)) {
          const i = w.touched[b]!++, at = ball.splashes[i]!, when = w.t + at;
          if (t - when < STALE) out.splashes.push({ t: when, at: ball.touches[i]!, speed: speedAt(ball.path, ball.ends, at), size, skip: i < ball.splashes.length - 1 });
        }
        if (along < end) left = true;
        if (along < 0 || along >= end) return;
        out.balls.push({ from: pathAt(ball.path, ball.ends, Math.max(0, along - STREAK)), to: pathAt(ball.path, ball.ends, along), size });
      });
      if (!left && along > 0) this.onWay.delete(k);
    }
    return out;
  }
}

/** Sights whose time has come moved from `queue` to `out` (the stale ones dropped). */
function handOver<T extends { readonly t: number }>(queue: T[], t: number, out: T[]): void {
  let kept = 0;
  for (const s of queue) {
    if (s.t > t) queue[kept++] = s;
    else if (t - s.t < STALE) out.push(s);
  }
  queue.length = kept;
}

/** A ball's speed `at` s along its path, m/s. */
function speedAt(path: readonly Vec[], ends: number, at: number): number {
  const a = pathAt(path, ends, Math.max(0, at - STEP_SECONDS)), b = pathAt(path, ends, at);
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / STEP_SECONDS;
}
