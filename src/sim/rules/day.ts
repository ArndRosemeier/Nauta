/**
 * The day clock's rules (design ruling 2026-11-18; read by src/sim/day.ts): the sandbox's game minutes to a real minute
 * and the length of a day. Pure data.
 */
import { HOURS_PER_DAY, MINUTES_PER_HOUR } from '../units';
import type { Part } from './crew';

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

/**
 * The watch on deck at its jobs (design ruling 2026-11-18: the watch on deck is at its jobs, the watch below asleep; people
 * of no use right now stay below): the places a watch's hands stand at while it has the deck, each taken by the first
 * hand of that part in the watch who has none, so each watch has the same few on deck at the same places: a lookout in
 * each top and on the forecastle, and men coiling down at the pin rails. Every other hand of the watch stays in his
 * hammock until called. Only the sandbox keeps watches (`SimState.dayStart`).
 */
export const DECK_WATCH: readonly { readonly part: Part; readonly place: string }[] = [
  { part: 'foretop', place: 'top-fore-p' },
  { part: 'maintop', place: 'top-main-p' },
  { part: 'forecastle', place: 'station-forecastle' },
  { part: 'forecastle', place: 'pin-fore-pins-s1' },
  { part: 'forecastle', place: 'pin-fore-pins-p1' },
  { part: 'afterguard', place: 'pin-quarter-pins-s1' },
  { part: 'afterguard', place: 'pin-quarter-pins-p1' },
  { part: 'waist', place: 'pin-waist-pins-s6' },
  { part: 'waist', place: 'pin-waist-pins-p6' },
];

/**
 * The few jobs of the day (design ruling 2026-11-18: galley before meals, grog at noon; from one seeded table in the
 * roster data, nothing reads a real clock): while the game hour is in `from` up to `to`, the hands of the watch on deck
 * who stand a post of `who` (a part, or every part) go to the job's places (a hand's slot among the posts of
 * `DECK_WATCH`, round the places) and are at the job until it ends, then back to their posts. Each job has its clip in
 * app/standBy.ts `WATCH_JOB_CLIPS`.
 */
export interface DayJob {
  readonly what: 'wash down' | 'grog';
  readonly from: number;
  readonly to: number;
  readonly who: readonly Part[] | null;
  readonly places: readonly string[];
}
export const DAY_JOBS: readonly DayJob[] = [
  // The morning watch washes the deck down (the waist's two hands with their brooms), before the hands' breakfast.
  { what: 'wash down', from: 5.5, to: 7, who: ['waist'], places: ['station-wash-1', 'station-wash-2'] },
  // Up spirits at noon: the watch on deck's hands come to the scuttlebutt for their grog and go back.
  { what: 'grog', from: 11.75, to: 12.25, who: null, places: Array.from({ length: 9 }, (_, k) => `station-grog-${k + 1}`) },
];
