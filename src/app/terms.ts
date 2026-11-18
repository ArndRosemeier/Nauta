/**
 * The match's terms as the menu sets them (implementation plan N7.2, docs/design/menu.md "Match setup"): the navy, the
 * other captain's skill when alone, the wind, the hour, how the ships meet, the length and the seed, each with a
 * default so one tap starts a match; what each means for the match and for the sky. Pure: the menu (menu/setup.ts)
 * shows and changes them, `TermsStore` keeps the last ones chosen on the device.
 */
import { deriveSeed, hash32, Rng } from '@futuremagic/core';
import { SKILLS, type Offered } from '../sim/rules/captain';
import { MATCH_MINUTES } from '../sim/rules/end';
import { MEETINGS, WIND_CHOICE_NAMES, type Meeting, type StartTerms, type WindChoice } from '../sim/start';
import { HOURS_PER_DAY, MINUTES_PER_HOUR } from '../sim/units';
import { isRecord, oneOf } from './kept';

/** The navies (nauta-plan.md, "Which navies?": British against French around 1800, the same hull in two coats). */
export const NAVIES = ['british', 'french'] as const;
export type Navy = (typeof NAVIES)[number];
/** The hours a match may start at: as the seed draws it, or named. */
export const HOURS = ['drawn', 'dawn', 'day', 'dusk', 'moon'] as const;
export type HourChoice = (typeof HOURS)[number];
/**
 * Each named hour, as the sky's clock reads (the sea shots' times, tools/shot/sea.mjs): just after sunrise, late
 * morning, before sunset, a night with the moon high.
 */
export const HOUR_AT: Readonly<Record<Exclude<HourChoice, 'drawn'>, number>> = { dawn: 6.3, day: 11, dusk: 17.7, moon: 22 };
/** "As it comes" draws among the named hours with these weights: mostly by day, so a first match is seen well. */
const HOUR_WEIGHTS: Readonly<Record<Exclude<HourChoice, 'drawn'>, number>> = { dawn: 2, day: 5, dusk: 2, moon: 1 };
/** The lengths offered, minutes; `NO_LIMIT` stands for none. */
export const NO_LIMIT = 0;
export const LENGTHS: readonly number[] = [20, MATCH_MINUTES, 60, NO_LIMIT];
/** A match without a limit is drawn after this long all the same, minutes: a day of play, never reached. */
const LONGEST_MINUTES = HOURS_PER_DAY * MINUTES_PER_HOUR;
/** How much faster the sky's clock runs than the match's (menu.md: twenty minutes of fighting are an hour of light). */
export const SKY_PACE = 3;
/** Real minutes a whole day of the sky takes in a match, at `SKY_PACE`. */
export const MATCH_DAY_MINUTES = (HOURS_PER_DAY * MINUTES_PER_HOUR) / SKY_PACE;
/** The largest seed: a whole 32-bit number. */
const SEED_MOST = 2 ** 32 - 1;

export interface MatchTerms {
  readonly navy: Navy;
  /** The other captain's skill, a match played alone. */
  readonly foe: Offered;
  /** The two computer captains' skills in a battle watched (plan N7.8): the British ship's and the French ship's. */
  readonly skillBritish: Offered;
  readonly skillFrench: Offered;
  readonly wind: WindChoice;
  readonly hour: HourChoice;
  readonly meet: Meeting;
  /** Minutes, or `NO_LIMIT`. */
  readonly minutes: number;
  /** The seed typed in to play a match again; null: a new one each match. */
  readonly seed: number | null;
}

export const DEFAULT_TERMS: MatchTerms = { navy: 'british', foe: 'seasoned', skillBritish: 'seasoned', skillFrench: 'seasoned', wind: 'drawn', hour: 'drawn', meet: 'even', minutes: MATCH_MINUTES, seed: null };


/** Terms from whatever was kept: each field missing or wrong takes its default. */
export function readTerms(kept: unknown): MatchTerms {
  const k = isRecord(kept) ? kept : {}, d = DEFAULT_TERMS;
  return {
    navy: oneOf(k.navy, NAVIES, d.navy),
    foe: oneOf(k.foe, SKILLS, d.foe),
    skillBritish: oneOf(k.skillBritish, SKILLS, d.skillBritish),
    skillFrench: oneOf(k.skillFrench, SKILLS, d.skillFrench),
    wind: oneOf(k.wind, WIND_CHOICE_NAMES, d.wind),
    hour: oneOf(k.hour, HOURS, d.hour),
    meet: oneOf(k.meet, MEETINGS, d.meet),
    minutes: typeof k.minutes === 'number' && LENGTHS.includes(k.minutes) ? k.minutes : d.minutes,
    seed: readSeed(k.seed),
  };
}

/** A seed as typed (a whole number up to 2³²−1), or null. */
export function readSeed(v: unknown): number | null {
  const n = typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v)) : typeof v === 'number' ? v : NaN;
  return Number.isInteger(n) && n >= 0 && n <= SEED_MOST ? n : null;
}

/** A new match's seed from a moment (ms on any clock) and a count, when none is typed: shown, so it can be typed again. */
export const newSeed = (ms: number, n: number): number => deriveSeed(hash32(Math.floor(ms)), 'match', n) >>> 0;

/** What the simulation's start takes of the terms. */
export const startTerms = (t: MatchTerms): StartTerms => ({ wind: t.wind, meet: t.meet });

/** The match's length for the simulation, minutes (no limit: a day). */
export const matchMinutes = (t: MatchTerms): number => (t.minutes === NO_LIMIT ? LONGEST_MINUTES : t.minutes);

/** The hour the sky starts at for these terms and seed: the one named, or drawn from the seed by the weights. */
export function hourOf(choice: HourChoice, seed: number): number {
  if (choice !== 'drawn') return HOUR_AT[choice];
  const named = Object.keys(HOUR_WEIGHTS) as Exclude<HourChoice, 'drawn'>[];
  let pick = new Rng(deriveSeed(seed, 'hour')).range(0, named.reduce((sum, h) => sum + HOUR_WEIGHTS[h], 0));
  for (const h of named) { pick -= HOUR_WEIGHTS[h]; if (pick < 0) return HOUR_AT[h]; }
  return HOUR_AT.day;
}

/** The other navy (the guest's in a room). */
export const otherNavy = (n: Navy): Navy => (n === 'british' ? 'french' : 'british');
