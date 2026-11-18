/**
 * The ship's own sound, as data (plan N2.8): her timber creaking as she works, the water along her sides, the slap
 * under her counter, the captain's feet, and how a room below deck changes what is heard. Tuning the ship's sound means
 * editing this file; the takes and their prompts are in tools/sound/sounds.json. Pure.
 *
 * Levels are amplitudes (0..1) like tuning.ts's. Every bed take is levelled alike when it is made (−24 dBFS RMS) and
 * every call and step peaks at −3 dBFS, so the gains here set the mix.
 */
import type { SlapKind } from './tuning';

// --- Timber -------------------------------------------------------------------------------------------------------

/** Her deck, bulwarks and fittings creaking: short dry creaks, heard all over her. */
export const TIMBER: SlapKind = { id: 'creak/timber', gain: 0.42, ref: 2.5 };
/** Her frames and planking groaning as the hull works: long and low, loudest below deck. */
export const GROAN: SlapKind = { id: 'creak/hull', gain: 0.6, ref: 3 };

/**
 * How hard she must work for one creak: the change of her roll rate, rad/s (pitch's change counted PITCH_WORK times).
 * Creaks so come where her motion turns, at the end of each roll, as the weight of her masts and guns swings back.
 * Measured lying still in the game's seas (.tune in N2.8's notes): she works about 0.25 rad/s a minute in a calm,
 * 0.7 at force 2, 7 at force 4, 11 at force 6 to 8; so a creak about once a minute in a calm, every quarter minute in
 * a light breeze, every second or two at force 4 and about one a second in a gale.
 */
export const CREAK_WORK = 0.2;
/** Pitching works her long timbers more than rolling does: pitch's change counts this many times its roll's. */
export const PITCH_WORK = 1.5;
/** Each creak's work is drawn between these shares of CREAK_WORK, so they come unevenly. */
export const CREAK_SPREAD: readonly [number, number] = [0.4, 1.6];
/** No two creaks start closer than this, s. */
export const CREAK_GAP = 0.3;
/**
 * How hard she works (rad/s² of change in roll rate, pitch counted as above, its mean over WORK_SMOOTH) when a creak is
 * loudest: about twice a gale's mean.
 */
export const WORK_FULL = 0.35;
/** How hard she works is her work's mean over about this long, s: a creak is as loud as the roll it comes in. */
export const WORK_SMOOTH = 1;
/** A creak's loudness follows how hard she works then, between these. */
export const CREAK_LOUDNESS: readonly [number, number] = [0.3, 1.15];
/** The share of creaks that are the hull's groans: on deck (heard up through the planks), below deck. */
export const GROAN_SHARE = { above: 0.15, below: 0.55 } as const;
/** On deck the hull's groans come up through her deck: this much of their gain. */
export const GROAN_THROUGH_DECK = 0.35;
/** Where a creak comes from: within this far fore and aft of the ear, m. */
export const CREAK_ALONG = 4;
/** ...and between these heights from the ear, m: from the deck at the feet to the beams or rails above. */
export const CREAK_RISE: readonly [number, number] = [-1.4, 0.6];
/** A creak in her side is heard from this far inboard of her planking, m (her frames and ceiling). */
export const CREAK_INBOARD = 0.3;

// --- The counter ----------------------------------------------------------------------------------------------------

/** The sea slapping up under her counter, the stern's overhang over the water. */
export const COUNTER: SlapKind = { id: 'slap/counter', gain: 0.8, ref: 5 };
/**
 * The water must rise toward the counter faster than this to slap, m/s (relative to the counter as she pitches)...
 * Lying still her counter's edge stands about 1.35 m over the sea; at force 2 the sea closes on it at 0.6 m/s at most
 * and never slaps, from force 4 on at over 2 m/s.
 */
export const COUNTER_CLOSING = 0.8;
/** ...and come within this far of it, m. */
export const COUNTER_REACH = 0.8;
/** The closing speed of the loudest slap, m/s. */
export const COUNTER_FULL = 2.5;
/** A slap's loudness follows its closing speed, between these. */
export const COUNTER_LOUDNESS: readonly [number, number] = [0.4, 1.2];
/** No two slaps under the counter closer than this, s: one sea, one slap. */
export const COUNTER_GAP = 1.5;

// --- Water along her sides ----------------------------------------------------------------------------------------

/** Water running along her side, heard on deck from over each side (two takes, placed at the waterline); its gain at FLOW_FULL. */
export const HULL_RUN: SlapKind = { id: 'bed/hull-run', gain: 0.5, ref: 3 };
/** The sea against her planking heard from inside, below deck (two takes, all round). */
export const HULL_INSIDE = 'bed/hull-inside';
/**
 * The water's speed along her side when its sound is fullest, m/s: her way through the water and the sea rising and
 * falling against her planking, together; its level rises as the root of the flow's share of this, so a little flow is
 * heard. 2.5 m/s is 5 knots of way. Lying still the sea's rise and fall alone makes about 0.2 m/s at force 2 and 0.7 to
 * 0.8 m/s from force 4 to the gale (she rises with the long seas; the short ones run up her side).
 */
export const FLOW_FULL = 2.5;
/** How much of the water's rise and fall against her side counts as flow (its speed relative to her planking). */
export const RISE_FLOW = 1;
/** The rise and fall is heard as its root mean square over about this long, s: the level breathes, never flickers. */
export const FLOW_SMOOTH = 2;
/** The sea against her planking heard below deck: never silent (she always moves a little), fullest at FLOW_FULL. */
export const INSIDE_GAIN: readonly [number, number] = [0.14, 0.62];
/** How fast the water's levels follow, s. */
export const HULL_GLIDE = 0.8;
/** Her side is heard at a point this far inside her ends, m, so the ear at her bow or stern still hears it beside them. */
export const SIDE_END_MARGIN = 1.5;

// --- Below deck -----------------------------------------------------------------------------------------------------

/**
 * Below deck the sea and the wind come through her planking: a low-pass at OPEN_HZ standing under an opening to the
 * sky (a hatch, a ladderway, the companion), closing to SHUT_HZ OPENING_REACH m from it or further, and to HOLD_HZ in
 * the hold, two decks down. Glided between in log frequency.
 */
export const OPEN_HZ = 2400;
export const SHUT_HZ = 650;
export const HOLD_HZ = 420;
/** How far from an opening its open air still reaches, m. */
export const OPENING_REACH = 3.5;
/** How much of the sea's and the wind's level comes through: under an opening, shut in, in the hold. */
export const THROUGH = { open: 0.7, shut: 0.38, hold: 0.28 } as const;
/**
 * A room's echo by Sabine's rule, T60 = SABINE · V / (ABSORPTION · S): its volume V and surface S from the plan.
 * ABSORPTION is the mean share of sound her rooms swallow: bare oak swallows little (0.1), hammocks, bags, casks and
 * sails much, so 0.3; under her low beams a cabin rings 0.2 s, the berth deck's open run and the main hold 0.3 s.
 */
export const SABINE = 0.161;
export const ABSORPTION = 0.3;
/** A room's T60 is held between these, s. */
export const ECHO_T60: readonly [number, number] = [0.15, 1];
/** How much echo below deck: close and boxy, not a hall. */
export const ECHO_WET = 0.22;

// --- Feet -----------------------------------------------------------------------------------------------------------

/** A step on her planking (leather shoes on oak). */
export const STEP_DECK = { id: 'step/deck', gain: 0.5 } as const;
/** A foot on a ladder's tread. */
export const STEP_RUNG = { id: 'step/rung', gain: 0.55 } as const;
/**
 * A step's loudness by how far the foot went, between these, reached at these lengths, m: a sole goes about twice his
 * stride in a walking step (1.4 m), a step that catches a lurch a hand's breadth or two.
 */
export const STEP_LOUDNESS: readonly [number, number] = [0.55, 1];
export const STEP_LENGTHS: readonly [number, number] = [0.15, 1.2];
/** A sole moving slower than this is planted, m/s (a step's sole moves at a metre or more a second). */
export const SOLE_STILL = 0.1;
/** Below deck his feet fall on the berth deck's thinner planks over the hold: a little deeper and hollower. */
export const STEP_PITCH_BELOW = 0.92;
/** The eye moved further than this in one frame, m: put there (a standpoint chosen), not walked. */
export const STEP_JUMP = 1;
