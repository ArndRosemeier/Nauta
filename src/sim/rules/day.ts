/**
 * The day clock's rules (design ruling 2026-11-18; read by src/sim/day.ts): the sandbox's game minutes to a real minute
 * and the length of a day. Pure data.
 */
import { HOURS_PER_DAY, MINUTES_PER_HOUR } from '../units';

/** Game minutes that pass in a real minute of the sandbox: a four-hour watch takes eight minutes, a half-hour bell one. */
export const DAY_PACE = 30;
/** Minutes in a day. */
export const DAY_MINUTES = HOURS_PER_DAY * MINUTES_PER_HOUR;
/** Real minutes a whole day takes at that pace (the sky's pace in the sandbox). */
export const DAY_REAL_MINUTES = DAY_MINUTES / DAY_PACE;

/** The two watches of a ship's company: the one that keeps the deck from midnight is the larboard's. */
export type Watch = 0 | 1;
export const WATCH_NAMES: readonly string[] = ['larboard', 'starboard'];

/**
 * The day's watches, from their first hour to their last (the middle, the morning, the forenoon, the afternoon, the
 * dog watches that make seven of them so the two watches turn about each day, and the first): the hours each begins
 * at, a watch lasting to the next one's start. Their order is the watch on deck's: it alternates down the list.
 */
export const WATCHES: readonly { readonly name: string; readonly from: number }[] = [
  { name: 'middle', from: 0 }, { name: 'morning', from: 4 }, { name: 'forenoon', from: 8 }, { name: 'afternoon', from: 12 },
  { name: 'first dog', from: 16 }, { name: 'last dog', from: 18 }, { name: 'first', from: 20 },
];
/** The bell is struck every half hour: one more each time, the last of a watch eight. */
export const BELL_MINUTES = 30;
/** The first dog watch ends on four bells (its second hour begins the count again); every other watch ends on eight. */
export const BELLS_AT_WATCH_END = 8;
export const FIRST_DOG_END_BELLS = 4;
