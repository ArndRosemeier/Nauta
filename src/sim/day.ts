/**
 * The sandbox's day clock (implementation plan, design ruling 2026-11-18): the time of day as a function of the match's
 * tick, so every machine agrees on it and nothing reads the real clock. Only the sandbox has one (`SimState.dayStart`);
 * a fight or duel has none and is untouched. Pure.
 *
 * The clock runs DAY_PACE game minutes to a real minute: a four-hour watch is eight minutes and a bell comes every
 * minute.
 */
import { BELL_MINUTES, BELLS_AT_WATCH_END, DAY_MINUTES, DAY_PACE, FIRST_DOG_END_BELLS, WATCHES, type Watch } from './rules/day';
import { HOURS_PER_DAY, MINUTES_PER_HOUR, SECONDS_PER_MINUTE, STEPS_PER_SECOND } from './units';

/** Half hours (the bell's spacing) in an hour and in a day. */
const HALF_HOURS_AN_HOUR = MINUTES_PER_HOUR / BELL_MINUTES;
const HALF_HOURS_A_DAY = HOURS_PER_DAY * HALF_HOURS_AN_HOUR;
import type { SimState } from './state';

/** The game minute of the day (0 up to 1,440) at `tick` for a day that began at `dayStart`, or null: no day clock. */
export function dayMinutesAt(dayStart: number | null, tick: number): number | null {
  if (dayStart === null) return null;
  const game = dayElapsed(dayStart, tick)!;
  return ((game % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
}

/** The game minute of the day in `state`, or null in a fight. */
export const dayMinutes = (state: Pick<SimState, 'dayStart' | 'tick'>): number | null => dayMinutesAt(state.dayStart, state.tick);

/**
 * The watch (a row of `WATCHES`) that holds the game minute `minute` counted from the start of the match's first day
 * (not wrapped: the day's number matters), and the watch on deck in it (0 larboard, 1 starboard): the watches count on
 * through the days, seven a day, so the one that had the first watch has the middle next night.
 */
export function watchAt(minute: number): { readonly index: number; readonly onDeck: Watch } {
  const day = Math.floor(minute / DAY_MINUTES), hour = Math.floor((minute - day * DAY_MINUTES) / MINUTES_PER_HOUR);
  let index = WATCHES.length - 1;
  while (WATCHES[index]!.from > hour) index--;
  return { index, onDeck: ((day * WATCHES.length + index) % 2) as Watch };
}

/** The game minutes since the start of the match's first day at `tick` (not wrapped), or null: no day clock. */
export function dayElapsed(dayStart: number | null, tick: number): number | null {
  return dayStart === null ? null : dayStart + (tick / STEPS_PER_SECOND / SECONDS_PER_MINUTE) * DAY_PACE;
}

/**
 * The bells struck as the day's clock goes from game minute `before` to `now` (one step's span, or null for no day
 * clock): how many, or 0 when no half hour was passed. One more each half hour of a watch; the last of a watch eight
 * (the first dog's four): so eight bells strike at midnight, four, eight, noon, four, and the last dog's end at eight.
 */
export function bellsPassed(before: number | null, now: number | null): number {
  if (before === null || now === null) return 0;
  const was = Math.floor(before / BELL_MINUTES), is = Math.floor(now / BELL_MINUTES);
  if (was === is) return 0;
  // A boundary crossed: the one at `is` half hours (a wrap at midnight crosses 0, the end of the first watch).
  const boundary = is % HALF_HOURS_A_DAY === 0 ? HALF_HOURS_A_DAY : is % HALF_HOURS_A_DAY;
  const hour = (boundary - 1) / HALF_HOURS_AN_HOUR;
  let index = WATCHES.length - 1;
  while (WATCHES[index]!.from > hour) index--;
  const begin = WATCHES[index]!.from * HALF_HOURS_AN_HOUR, end = (WATCHES[index + 1]?.from ?? HOURS_PER_DAY) * HALF_HOURS_AN_HOUR;
  const k = boundary - begin;
  if (boundary < end) return k;
  return WATCHES[index]!.name === 'first dog' ? FIRST_DOG_END_BELLS : BELLS_AT_WATCH_END;
}
