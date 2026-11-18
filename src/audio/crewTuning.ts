/**
 * The crew at work heard, as data (plan N4.6): the boatswain's calls for each kind of order and for what follows,
 * bare feet running, the rhythm of hauling, the drum, the ship's bell. Tuning the crew's sound means editing this
 * file; the takes and their prompts are in tools/sound/sounds.json, the calls' patterns in tools/sound/pipe-calls.json.
 * Nothing here speaks words (Arnd: no voices, speech is shown in bubbles, N4.5). Pure.
 *
 * Levels are amplitudes (0..1) like tuning.ts's: every call and step peaks at −3 dBFS and every bed is levelled to
 * −24 dBFS RMS when made, so the gains here set the mix. All first proposals, judged by ear on the iPad.
 */
import type { OrderKind } from '../sim/orders';
import type { JobName } from '../sim/rules/crew';
import type { SailingEvent } from '../sim/ship/sailing';
import type { SlapKind } from './tuning';

// --- The boatswain's calls ------------------------------------------------------------------------------------------

/** A boatswain's call: its sound, how loud, how far it carries (half as loud at twice `ref`, m) and how long it is, s. */
export interface PipeCall extends SlapKind {
  /** Its length as made (tools/sound/pipe-calls.json; checked against public/sound/index.json by the tests). */
  readonly seconds: number;
}

/** The call is a shrill pipe made to carry over wind and sea: heard the length of her deck. */
const PIPE_GAIN = 0.75;
const PIPE_REF = 9;
const call = (name: string, seconds: number, gain = PIPE_GAIN): PipeCall => ({ id: `pipe/${name}`, gain, ref: PIPE_REF, seconds });

/**
 * One call for each kind of order (docs/design/orders.md), piped by the boatswain beside the first lieutenant the
 * moment the order is taken, so the ear learns what was ordered before the men move (they are told after PASSED,
 * rules/crew.ts). A course for the master is the short call that the word is passed; the four course orders share it,
 * as they are one row of the orders table and none needs hands. Tack and wear are all-hands calls (the general call
 * first), sail settings rise (Hoist), shortening falls (Lower), backing a topsail is Haul at the braces, filling Heave Round.
 */
export const ORDER_CALLS: Readonly<Record<OrderKind, PipeCall>> = {
  steer: call('helm', 0.94, PIPE_GAIN / 2),
  up: call('helm', 0.94, PIPE_GAIN / 2),
  away: call('helm', 0.94, PIPE_GAIN / 2),
  by: call('helm', 0.94, PIPE_GAIN / 2),
  tack: call('tack', 2.88),
  wear: call('wear', 3.8),
  heave: call('heave', 2.11),
  sail: call('sail', 2.62),
  shorten: call('shorten', 2.42),
  back: call('back', 1.92),
  fill: call('fill', 2.45),
};

/** When she comes through the wind or round before it the yards are swung: Haul Away. */
export const HAUL_CALL = call('haul', 1.09);
/** She missed stays: the Still, every man stops (the master's report is a bubble, N4.5). */
export const STILL_CALL = call('still', 2.6);
/** An order of the first lieutenant's or heaving to carried out, or she is round on the new tack: Carry On. Quieter, an end, not a start. */
export const CARRY_ON = call('carry-on', 0.75, PIPE_GAIN * 0.6);

/** What each sailing event of hers is piped with, in turn: come round, the yards are swung and the men carry on; missed stays, all stop. */
export const SAILED_CALLS: Readonly<Record<SailingEvent, readonly PipeCall[]>> = { tacked: [HAUL_CALL, CARRY_ON], wore: [HAUL_CALL, CARRY_ON], 'missed stays': [STILL_CALL] };

/**
 * The orders whose end is piped (Carry On): those that took the hands. A course is the helmsman's alone; a tack or a
 * wear is done when the helm is over, but she is not round until she has tacked or worn, and that is piped then.
 */
export const PIPED_DONE: ReadonlySet<OrderKind> = new Set<OrderKind>(['heave', 'sail', 'shorten', 'back', 'fill']);

/** One call after another, never over each other: this much silence between, s. */
export const CALL_GAP = 0.35;
/** A call waiting longer than this behind others is dropped, s: a stale call says nothing true. */
export const CALL_STALE = 6;
/** A job begun short-handed: the boatswain pipes the order's call again for more hands, at this share of its gain, once an order. */
export const SHORT_HANDED_GAIN = 0.7;
/** ...and not again for the same kind of order within this long, s (each short job of a big order would pipe it). */
export const SHORT_HANDED_AGAIN = 10;
/** The boatswain stands at chest height, m over his feet: where the call comes from. */
export const PIPE_HEIGHT = 1.5;

// --- Feet -----------------------------------------------------------------------------------------------------------

/** A bare foot coming down on her deck as a man runs. Walking men are heard at WALK_GAIN of it. */
export const RUN_STEP: SlapKind = { id: 'step/run', gain: 0.5, ref: 3 };
/** A man walking back to his post goes barefoot and quiet. */
export const WALK_GAIN = 0.35;
/** The length of a stride, running and walking, m: a foot comes down each time he has gone this far. */
export const RUN_STRIDE = 1.3;
export const WALK_STRIDE = 0.75;
/** The nearest men on their way are heard one foot at a time: at most this many, within this far, m. */
export const NEAR_FEET = 4;
export const NEAR_REACH = 10;
/** The others running within this far, m, are a crowd: the bed of many feet, placed amid them. */
export const CROWD_REACH = 30;
/** The crowd's bed is at full level with this many men running, and rises as the root of their number to it. */
export const CROWD_FULL = 16;
/** The crowd's bed: its two takes (blended by a slow swing, as the sea's), its level at full, how far it carries, m. */
export const CROWD_BEDS = ['bed/crew-run-a', 'bed/crew-run-b'] as const;
export const CROWD_GAIN = 0.55;
export const CROWD_REF = 6;
/** How fast the crowd's level follows the men, s. */
export const CROWD_GLIDE = 0.4;
/** Feet are heard at the planking, this far over the floor he stands on, m. */
export const FEET_HEIGHT = 0.1;

// --- Hauling --------------------------------------------------------------------------------------------------------

/** A gang hauling on a line: the rope squealing through its block, the thump of feet taking the strain together. */
export const HAUL_PULL: SlapKind = { id: 'haul/pull', gain: 0.6, ref: 5 };
/** The jobs that are hauling at a pin (rules/crew.ts JOBS): the rest are standing by, at the wheel or out on a yard. */
export const HAULING: ReadonlySet<JobName> = new Set<JobName>(['brace', 'sheet', 'clew', 'hoist', 'douse']);
/** A pull every so often, s, each gang its own seeded share off it (± HAUL_SPREAD), so two gangs do not pull as one. */
export const HAUL_PERIOD = 1.7;
export const HAUL_SPREAD = 0.12;
/** A pull's loudness rises as the root of the share of its hands told off, from HAUL_LEAST at none. */
export const HAUL_LEAST = 0.4;
/** Heard at the height of the men's hands on the fall, m. */
export const HAUL_HEIGHT = 1;
/** Swinging the yards as she comes round (tacked, wore): this many pulls at the braces, quicker than the drill's. */
export const SWING_PULLS = 3;
export const SWING_PERIOD = 1.1;

// --- The ship's bell ------------------------------------------------------------------------------------------------

/** One strike of the ship's bell. */
export const BELL: SlapKind = { id: 'bell/strike', gain: 0.7, ref: 10 };
/** The bell hangs on the deck this far abaft the foremast, m, at this height over it (until N2.6 places the belfry). */
export const BELL_ABAFT_FOREMAST = 1;
export const BELL_HEIGHT = 1.9;
/**
 * Struck every so often of the match's time, s (design thread, 2026-11-18): by the simulation's clock, so every
 * machine hears it at the same moment; one bell more each time up to eight, then from one again, in pairs.
 */
export const BELL_EVERY = 300;
/** Eight bells end a watch; the strikes come in pairs. */
export const BELLS_A_WATCH = 8;
export const STRIKES_A_PAIR = 2;
/** Between the two strikes of a pair, and between pairs, s. */
export const BELL_PAIR_GAP = 0.45;
export const BELL_GAP = 1.15;

// --- The drum -------------------------------------------------------------------------------------------------------

/** The drummer beating to quarters (N5.3 gives the order): a loop while he beats, placed where he stands. */
export const DRUM: SlapKind = { id: 'drum/quarters', gain: 0.7, ref: 8 };
/** How fast the drum starts and stops, s. */
export const DRUM_GLIDE = 0.15;
/** Held at this height, m over his feet. */
export const DRUM_HEIGHT = 0.9;

// --- Through her decks ----------------------------------------------------------------------------------------------

/** A sound on the other side of a deck from the ear (men on deck heard from below, or below heard from on deck): this much of its gain, through the world's muffle. */
export const THROUGH_DECK = 0.45;
