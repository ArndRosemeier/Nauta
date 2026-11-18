/**
 * What the page's address asks for (`?gl&hud&hour=17`, `?eye=30&wind=6`, `?sea=gale`, `?yaw=70&pitch=-10`,
 * `?look=90,-5`, `?bench`, `?probe`, `?rig`, `?slice=below`, `?quality=low`). Pure: it takes the query string.
 */
import { DEGREE, HOURS_PER_DAY } from '../sim/units';
import { PITCH_LIMIT, type Look } from './look';
import { WIND_PRESETS } from '../sim/rules/wind';

/** The hour a game starts at when the address names none: a clear morning. */
const START_HOUR = 10;
/** Real minutes a game day takes when the address names none. */
const DAY_MINUTES = 24;
/** The longest day the address may ask for, real minutes. */
const DAY_MINUTES_MAX = 100000;
/** The captain's eye above the calm sea when the address names none, m (a brig's quarterdeck; the ship comes with N2). */
const EYE_HEIGHT = 4.5;
/** The lowest and highest eye the address may ask for, m: a diver's depth (the view from under the water) to high above a masthead. */
const EYE_LOWEST = -40;
const EYE_HIGHEST = 200;
/** Half a turn, degrees: the yaw the address may ask for runs from minus this to this. */
const HALF_TURN_DEGREES = 180;
/** The wind's force on the Beaufort scale when the address names none: a moderate breeze, a duel's weather. */
const WIND_FORCE = 4;
/** The force of a gale on the Beaufort scale: the roughest sea a ship is shown in (plan N1). */
const GALE_FORCE = 8;
/** The seas `?sea=` names, as the wind's force that raises them (`?wind=` wins when both are given). */
export const NAMED_SEAS: Readonly<Record<string, number>> = { calm: 0, breeze: WIND_FORCE, gale: GALE_FORCE };
/** How long `?bench` flies when it names no time, s (plan N1.9). */
export const BENCH_SECONDS = 60;
/** The shortest and longest flight `?bench=` may ask for, s. */
const BENCH_SHORTEST = 5;
const BENCH_LONGEST = 600;

/** Where `?look=` turns the eye: off the sun's (the moon's) bearing, clockwise, and up from level, both rad. */
export interface LookAtLight {
  readonly off: number;
  readonly up: number;
}

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
  /** The eye's height over the calm sea, m (`?eye=30`). */
  readonly eye: number;
  /** The wind's force on the Beaufort scale, a whole number (`?wind=7`). */
  readonly wind: number;
  /** Show the light rig's test bodies ahead of the captain (`?rig`, plan N1.5). */
  readonly rig: boolean;
  /** Where the captain looks at the start (`?yaw=70&pitch=-10`, degrees: yaw to the left of north, pitch up); null for the game's own start. */
  readonly look: Look | null;
  /** Stand on the slice of her waist (`?slice`, plan N2.0), at the standpoint named (`?slice=below`; empty: the first). */
  readonly slice: string | null;
  /** The quality level asked for (`?quality=low`, src/app/quality.ts); null: chosen from measured frame time. */
  readonly quality: string | null;
  /** Look toward the sun or moon, turned and tilted (`?look=90,-5`, degrees; `?look` alone: straight at its bearing, level); it wins over `?yaw`. */
  readonly toLight: LookAtLight | null;
  /** Fly the bench's path and show the frame times and memory, for this many seconds (`?bench`, `?bench=30`); 0: no bench. */
  readonly bench: number;
}

export function readParams(query: string): Params {
  const q = new URLSearchParams(query);
  const num = (name: string, fallback: number, min: number, max: number) => {
    const v = q.get(name), n = v === null || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  };
  const named = NAMED_SEAS[q.get('sea') ?? ''], force = q.has('wind') || named === undefined ? num('wind', WIND_FORCE, 0, WIND_PRESETS.length - 1) : named;
  return {
    forceWebGL: q.has('gl'), hud: q.has('hud'), hour: num('hour', START_HOUR, 0, HOURS_PER_DAY) % HOURS_PER_DAY,
    dayMinutes: num('day', DAY_MINUTES, 0, DAY_MINUTES_MAX), probe: q.has('probe'), rig: q.has('rig'),
    slice: q.get('slice'), quality: q.get('quality'), eye: num('eye', EYE_HEIGHT, EYE_LOWEST, EYE_HIGHEST), wind: Math.round(force),
    look: q.has('yaw') || q.has('pitch')
      ? { yaw: num('yaw', 0, -HALF_TURN_DEGREES, HALF_TURN_DEGREES) * DEGREE, pitch: num('pitch', 0, -PITCH_LIMIT / DEGREE, PITCH_LIMIT / DEGREE) * DEGREE }
      : null,
    toLight: q.has('look') ? readLook(q.get('look') ?? '') : null,
    bench: q.has('bench') ? num('bench', BENCH_SECONDS, BENCH_SHORTEST, BENCH_LONGEST) : 0,
  };
}

/** `90,-5` as degrees off the light's bearing and up; a part missing or not a number is 0. */
function readLook(v: string): LookAtLight {
  const [off, up] = v.split(',').map((x) => (x.trim() === '' ? 0 : Number(x))).map((x) => (Number.isFinite(x) ? x : 0));
  return { off: (off ?? 0) * DEGREE, up: (up ?? 0) * DEGREE };
}
