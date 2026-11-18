/**
 * The bench (`?bench`, plan N1.9): a fixed flight over the sea, the frame times measured on the way, and the result
 * as lines a person can read off the tablet's screen. Pure: the flight is a function of time, the numbers are
 * measured by benchRun.ts.
 */
import type { Look } from './look';
import { LATE_FRAME_MS, TARGET_FPS } from './quality';
import { MS_PER_SECOND } from '../sim/units';

/** How long the bench waits on the start of its path before it measures, s: the page settles after its first frames. */
export const BENCH_SETTLE_SECONDS = 2;
/** How fast the bench flies over the sea, m/s: twice a brig's best speed, so the sea's tiles change as often as they will. */
const FLIGHT_SPEED = 8;
/** The eye's lowest and highest on the flight, m: a brig's waist to her masthead. */
const EYE_LOW = 3;
const EYE_HIGH = 30;
/** Whole turns the eye makes on the flight: it looks into the sun, across and away from it more than once. */
const TURNS = 2;
/** The eye's tilt: level less a little, nodding this far up and down, rad; and how many nods on the flight. */
const PITCH_MID = -0.1;
const PITCH_SWING = 0.18;
const NODS = 3;
/** The frame's budget at the frame rate the game must hold (implementation plan, Budgets), ms. */
export const FRAME_BUDGET_MS = MS_PER_SECOND / TARGET_FPS;
/** A frame longer than this is a hitch the budget allows none of, ms (implementation plan, Budgets: none over 33 ms). */
const HITCH_MS = 33;
/** Share of frames that must be on time (implementation plan, Budgets: 95 of 100). */
const ON_TIME_SHARE = 0.95;
/** The percentiles shown. */
const P95 = 0.95;
const P99 = 0.99;
const PERCENT = 100;
/** Digits after the point for milliseconds on the screen. */
const MS_DIGITS = 1;

/** Where the eye is on the flight at a moment. */
export interface BenchPose {
  /** Over the calm sea, m (x east, z south: the flight goes north along -z). */
  x: number;
  y: number;
  z: number;
  look: Look;
}

/**
 * The eye `t` seconds into a flight of `seconds`: north at a steady speed, up from a brig's waist to her masthead and
 * down again, turning round twice and nodding, so every look at the sea is met on the way. Before 0 it waits at the start.
 */
export function benchPose(t: number, seconds: number, out: BenchPose = { x: 0, y: 0, z: 0, look: { yaw: 0, pitch: 0 } }): BenchPose {
  const s = Math.min(1, Math.max(0, t / seconds)), turn = 2 * Math.PI * s;
  out.x = 0;
  out.z = -FLIGHT_SPEED * s * seconds;
  out.y = EYE_LOW + ((EYE_HIGH - EYE_LOW) * (1 - Math.cos(turn))) / 2;
  out.look.yaw = TURNS * turn;
  out.look.pitch = PITCH_MID + PITCH_SWING * Math.sin(NODS * turn);
  return out;
}

/** What a bench run measured. */
export interface BenchSamples {
  /** Time from one frame to the next, ms. */
  readonly frames: readonly number[];
  /** Time the page's own work took each frame (the CPU side: simulation, choosing tiles, handing the GPU its work), ms. */
  readonly work: readonly number[];
}

/** The frame times summed up as the budget reads them. */
export interface FrameStats {
  readonly count: number;
  readonly median: number;
  readonly p95: number;
  readonly p99: number;
  readonly worst: number;
  /** Share of frames that did not miss the display's refresh (quality.ts's LATE_FRAME_MS: the times between frames jitter round 16.7 ms), 0..1. */
  readonly onTime: number;
  /** Frames over 33 ms. */
  readonly hitches: number;
  readonly workMedian: number;
  readonly workP95: number;
  /** Whether the budget holds: 95 of 100 frames on time, none over 33 ms. */
  readonly withinBudget: boolean;
}

/** The value below which a share `p` (0..1) of the sorted values lie (nearest rank); NaN for none. */
export function percentile(sorted: readonly number[], p: number): number {
  if (!sorted.length) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;
}

const ascending = (v: readonly number[]) => [...v].sort((a, b) => a - b);

/** The run's numbers as the budget reads them. */
export function frameStats(samples: BenchSamples): FrameStats {
  const f = ascending(samples.frames), w = ascending(samples.work);
  const onTime = f.length ? f.filter((ms) => ms <= LATE_FRAME_MS).length / f.length : 0;
  const hitches = f.filter((ms) => ms > HITCH_MS).length;
  return {
    count: f.length, median: percentile(f, 1 / 2), p95: percentile(f, P95), p99: percentile(f, P99), worst: f.length ? f[f.length - 1]! : NaN,
    onTime, hitches, workMedian: percentile(w, 1 / 2), workP95: percentile(w, P95),
    withinBudget: f.length > 0 && onTime >= ON_TIME_SHARE && hitches === 0,
  };
}

/** Milliseconds for the screen (`12.3 ms`; `–` for none). */
export const msText = (v: number) => (Number.isFinite(v) ? `${v.toFixed(MS_DIGITS)} ms` : '–');
const ms = msText;

/** The result as lines for the screen: frame times first, then the page's own work. */
export function statsLines(s: FrameStats): string[] {
  return [
    `frames ${s.count} · median ${ms(s.median)} · 95% ${ms(s.p95)} · 99% ${ms(s.p99)} · worst ${ms(s.worst)}`,
    `on time ${Math.round(s.onTime * PERCENT)}% (budget 95%) · over 33 ms: ${s.hitches} (budget 0) · ${s.withinBudget ? 'within budget' : 'OVER BUDGET'}`,
    `page work per frame · median ${ms(s.workMedian)} · 95% ${ms(s.workP95)}`,
  ];
}
