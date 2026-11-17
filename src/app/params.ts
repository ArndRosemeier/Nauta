/** What the page's address asks for (`?gl&hud&hour=17`, `?probe`, `?rig`). Pure: it takes the query string. */
import { HOURS_PER_DAY } from '../sim/units';

/** The hour a game starts at when the address names none: a clear morning. */
const START_HOUR = 10;
/** Real minutes a game day takes when the address names none. */
const DAY_MINUTES = 24;
/** The longest day the address may ask for, real minutes. */
const DAY_MINUTES_MAX = 100000;

export interface Params {
  /** Draw with WebGL 2 even where WebGPU exists (headless checks in the cloud). */
  readonly forceWebGL: boolean;
  /** Show the line of numbers in the corner. */
  readonly hud: boolean;
  /** The hour the day starts at, 0..24. */
  readonly hour: number;
  /** Real minutes a game day takes; 0 stops the clock. */
  readonly dayMinutes: number;
  /** Show what the browser and device offer instead of the game (`?probe`, plan N0.5). */
  readonly probe: boolean;
  /** Show the light rig's test bodies ahead of the captain (`?rig`, plan N1.5). */
  readonly rig: boolean;
}

export function readParams(query: string): Params {
  const q = new URLSearchParams(query);
  const num = (name: string, fallback: number, min: number, max: number) => {
    const v = q.get(name), n = v === null || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  return { forceWebGL: q.has('gl'), hud: q.has('hud'), hour: num('hour', START_HOUR, 0, HOURS_PER_DAY) % HOURS_PER_DAY, dayMinutes: num('day', DAY_MINUTES, 0, DAY_MINUTES_MAX), probe: q.has('probe'), rig: q.has('rig') };
}
