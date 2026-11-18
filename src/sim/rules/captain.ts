/**
 * The computer captain's rules (implementation plan N7.1; docs/ARCHITECTURE.md: rules as data): how each of his three
 * levels of skill judges, sails and fights, and the few judgements of tactics they share. Read by src/sim/captain/.
 *
 * **First proposals** of the N7.1 thread, tuned with the rest in N7.5 (pace and balance). The levels differ in how
 * often he looks and decides, how well he judges a range, where he wants to fight, whether he works for the weather
 * position and the rake, when he opens fire and fires on the roll, and how soon he sees to the water and the fire. Pure.
 */
import { DEGREE, KNOT } from '../units';
import type { AimName } from './guns';

/** The three levels of skill a captain can be chosen at (N7.1). */
export type Offered = 'green' | 'seasoned' | 'master';
/** Those and the first match's own captain, a step below green and never offered (N7.4, design thread 2026-11-18). */
export type Skill = 'raw' | Offered;
/** The levels offered, weakest first. */
export const SKILLS: readonly Offered[] = ['green', 'seasoned', 'master'];

/** One level of skill. */
export interface SkillRow {
  /** Seconds between his looks round: each look he judges anew and gives what orders it calls for. */
  readonly look: number;
  /** His error judging a range, one standard deviation as a share of it, and a bearing, rad. */
  readonly judgeRange: number;
  readonly judgeBearing: number;
  /** The range he wants to fight at, m: inside it his carronades strike most (design decisions for N5). */
  readonly range: number;
  /** How far to windward of her he steers while closing, m (0: straight at her): working for the weather position. */
  readonly gauge: number;
  /** How far astern of her he steers while closing, as a share of his range (0: never): working for her stern to rake her. */
  readonly rake: number;
  /** How far ahead he reckons where she will be while closing, as a share of the time to close (0: steers at where she is). */
  readonly lead: number;
  /** He beats to quarters inside this range, m. */
  readonly quarters: number;
  /** He opens fire inside this range, m, and ceases (so the guns stand loaded) beyond a fifth more. */
  readonly open: number;
  /** He loads grape inside this range, m (0: never), round shot beyond a fifth more. */
  readonly grape: number;
  /** Where he lays his round shot: her hull (to sink or beat her), or her rigging (the first match's captain: he cripples slowly and seldom sinks anyone). */
  readonly roundAt: AimName;
  /** He loads chain at her rigging when she holds the weather position at fighting range, to cripple her (design N5: chain is for her rigging). */
  readonly chain: boolean;
  /** He holds the side for his word and gives it as her roll passes level (design N5: "the roll is the skill"); otherwise they fire as they bear. */
  readonly word: boolean;
  /** Laying his broadside on her and still closing, he turns toward her only as far as his guns still bear, loaded or not (N7.5a); else as steeply as `MOST_CLOSING` while they reload. */
  readonly keepBearing: boolean;
  /** He sets plain sail to close beyond this range, m (0: never), and goes back to battle sail inside it. */
  readonly plainBeyond: number;
  /** He sends the hands to the pumps once this much water is in her, t. */
  readonly pumpsAt: number;
  /** He sends a fire party once a fire holds this share of its space (0: at once), each fire noticed a little sooner or later (`FIRE_NOTICE`). */
  readonly fireAt: number;
  /** He has the carpenter's crew plug first once this many holes let the sea in (0: never). */
  readonly plugAt: number;
  /**
   * A spar in danger (its stays shot away, its mast aback; the master cries it), he fills or bears away this many
   * seconds after the cry, at his next look (design thread 2026-11-18: the master at once, the green one late or not at
   * all; it falls after about 20 s still aback, rules/damage.ts `ABACK_FALLS`).
   */
  readonly saveMast: number;
  /** Beaten by the rule, he fights on this many seconds before he asks to strike, while it may still serve him (N7.5a: green at once; never once she is going down). */
  readonly strikeAfter: number;
  /**
   * How well his gun crews are drilled: their pace at the guns (1: a player's crew, always). Only a little either way
   * (design thread, 2026-11-18): flavour when playing alone; his decisions are what must win or lose the fight.
   */
  readonly drill: number;
}

/**
 * The levels. A green captain looks round every 8 s, misjudges a range by a quarter, steers straight at her, fights
 * at 180 m, opens fire at 800 m and sees to the water late. A seasoned one looks every 4 s, works a little for the wind
 * and her stern, fights at 110 m and closes to grape. A master looks every 2 s, judges within 5 %, works hard for the
 * weather position and the rake, fights at 90 m with grape inside 60 m, cripples a ship to windward with chain, fires
 * his broadsides on the roll and sees to every leak and fire at once. Beaten, the green one strikes at once, the seasoned
 * one fights on ten seconds and the master twenty, in case it turns (not when she is going down under him).
 */
export const SKILL: Readonly<Record<Skill, SkillRow>> = {
  /**
   * The first match's captain (N7.4, design thread 2026-11-18): weaker than green by his decisions only, never by his
   * crew's drill. He looks round only every 40 s, steers straight at her, never works for the weather position or her
   * stern, fires as they bear with round shot only, laid at her rigging (design thread, 2026-11-18), and is late to his
   * pumps and his fires.
   */
  raw: {
    look: 40, judgeRange: 0.25, judgeBearing: 4 * DEGREE, range: 180, gauge: 0, rake: 0, lead: 0, quarters: 1000, open: 800,
    grape: 0, roundAt: 'rigging', chain: false, word: false, keepBearing: false, plainBeyond: 0, pumpsAt: 80, fireAt: 0.3, plugAt: 0, saveMast: Infinity, strikeAfter: 0, drill: 1,
  },
  green: {
    look: 8, judgeRange: 0.25, judgeBearing: 4 * DEGREE, range: 180, gauge: 0, rake: 0, lead: 0, quarters: 1000, open: 800,
    grape: 0, roundAt: 'hull', chain: false, word: false, keepBearing: false, plainBeyond: 0, pumpsAt: 40, fireAt: 0.14, plugAt: 0, saveMast: 20, strikeAfter: 0, drill: 0.95,
  },
  seasoned: {
    look: 4, judgeRange: 0.12, judgeBearing: 2 * DEGREE, range: 110, gauge: 150, rake: 0.5, lead: 0.5, quarters: 1500, open: 500,
    grape: 50, roundAt: 'hull', chain: false, word: false, keepBearing: true, plainBeyond: 1200, pumpsAt: 10, fireAt: 0, plugAt: 0, saveMast: 5, strikeAfter: 10, drill: 1,
  },
  master: {
    look: 2, judgeRange: 0.05, judgeBearing: 1 * DEGREE, range: 90, gauge: 250, rake: 1, lead: 1, quarters: Infinity, open: 400,
    grape: 60, roundAt: 'hull', chain: true, word: true, keepBearing: true, plainBeyond: 1000, pumpsAt: 3, fireAt: 0, plugAt: 2, saveMast: 0, strikeAfter: 20, drill: 1.05,
  },
};

/**
 * A fire is noticed sooner or later than his `fireAt` by up to this share of it, seeded for each fire (N7.5a): eight
 * men beat down a fire up to about a fifth of its space, so now and then a green captain hears of one too late and she
 * burns.
 */
export const FIRE_NOTICE = 0.5;

// ---- Tactics every level shares ----

/** He closes (steers for her) beyond his fighting range and this much more, m; inside it he lays his broadside on her. */
export const ENGAGE_BEYOND = 300;
/** Inside this range, m, he turns away whatever else he wants: ships that touch foul each other (N3.12) and fight no better. */
export const CLOSEST = 45;
/**
 * Laying his broadside on her, he turns toward her by this much for each fighting range he is beyond it (and away as
 * much inside it), rad, at most `MOST_CLOSING`: so he closes on a slant and holds his range.
 */
export const CLOSING_PER_RANGE = 45 * DEGREE;
export const MOST_CLOSING = 60 * DEGREE;
/** Saving a mast in danger, he bears away no farther than this off the wind, rad: her sails fill long before. */
export const BEAR_AWAY_MOST = 135 * DEGREE;
/** A course changed by less than this is not worth an order, rad: the helmsman's yaw in a seaway is about as much. */
export const TURN_AT = 6 * DEGREE;
/** Steering for a course, he keeps this far off close-hauled, rad, so the sails stay full. */
export const OFF_CLOSE = 3 * DEGREE;
/** He goes about onto the other tack only when it heads him this much nearer what he wants than this tack does, rad. */
export const TACK_GAIN = 25 * DEGREE;
/**
 * Wanting a course before the wind, the other tack is only a small turn through the wind astern: he wears onto it for
 * this much gain, rad (N7.5a: with `TACK_GAIN` he stayed on a dead run, his broadside not bearing, while she pounded him).
 */
export const WEAR_GAIN = 6 * DEGREE;
/** He tacks only with this much way on her; slower, she would miss stays (N3.3), so he wears. */
export const TACK_WAY = 2 * KNOT;
/** Fewer than this many seconds to close is no reason to reckon ahead; more than `LEAD_MOST` is guesswork. */
export const LEAD_MOST = 120;
/** A broadside bears on her when she lies within this of square to his side, rad (a carronade trains 30° either way, rules/guns.ts). */
export const BEARS_WITHIN = 30 * DEGREE;
/**
 * Choosing the side to fight, each degree she would lie off where that side bears (the broadside he wants is closer to the
 * wind than she will lie) counts this many degrees of turning: a broadside that cannot bear is worth nothing however
 * near it lies, so he would rather wear round to the other side.
 */
export const OFF_BEARING = 3;
/** Closing while a side stands ready, he keeps her this far inside where its guns bear, rad, so they can fire as he closes. */
export const LAYING_SPARE = 8 * DEGREE;
/** Choosing the side to fight, a side whose guns stand ready counts this much nearer, rad; the side he fights already as much again. */
export const READY_SIDE = 30 * DEGREE;
export const SAME_SIDE = 20 * DEGREE;
/**
 * Choosing the side to fight with the water past his mark (`pumpsAt`), each hole the sea washes in at in a side counts
 * this much against it, rad, at most `WOUNDED_MOST` (N7.5a, "flooding is a contest": turned away, the holes lift clear).
 */
export const WOUNDED_SIDE = 30 * DEGREE;
export const WOUNDED_MOST = 180 * DEGREE;
/** She lies in his rake when he is within this of her bow or stern line, rad: her broadside cannot bear on him there. */
export const RAKE_WITHIN = 55 * DEGREE;
/** A raking side counts this much nearer when he chooses which side to fight, rad, by his `rake`. */
export const RAKE_SIDE = 60 * DEGREE;
/** Fired on his word: he gives it once this share of the side's mounted guns that bear stand ready, */
export const WORD_READY = 0.4;
/** as her roll passes her steady heel (N7.5a), or, her roll slower than `WORD_STILL_RATE` rad/s, lying within `WORD_STILL` rad of it. */
export const WORD_STILL_RATE = 0.5 * DEGREE;
export const WORD_STILL = 0.2 * DEGREE;
/** Loading chain at her rigging: inside this range, m (chain reaches about 250 m, design N5), and beyond his grape. */
export const CHAIN_INSIDE = 250;
/** She holds the weather position when she is this far to windward of him, m. */
export const WINDWARD_OF = 50;
/** A fifth more: the band beyond a range before he undoes what he did inside it (open fire, grape, plain sail). */
export const HYSTERESIS = 1.2;
/**
 * Keeping station on her: laying his broadside, with her this far abaft his beam, rad, he lays his main topsail aback to
 * let her come up (he is drawing ahead); with her back within `FILL_ABAFT` of his beam he fills again. Only within
 * `STATION_RANGES` of his fighting range: farther off he closes instead.
 */
export const BACK_ABAFT = 25 * DEGREE;
export const FILL_ABAFT = 5 * DEGREE;
/** With her farther abaft his beam than this, rad, backing would not bring her up in time: he fills and turns to her. */
export const BACK_MOST = 60 * DEGREE;
export const STATION_RANGES = 2;
/** Beaten, he asks to strike; his first lieutenant asks back, and he gives it again after this many seconds (within rules/end.ts `ASK_AGAIN`). */
export const STRIKE_AGAIN = 1;
/** Plain sail is set to close only up to this force: above it battle sail drives her hard enough. */
export const PLAIN_UP_TO = 5;
