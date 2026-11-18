/**
 * Damage heard, as data (plan N6.8): shot striking her timber near and far, splinters, iron struck, rigging parting,
 * canvas torn, a mast going with its rigging, fire, the sea rushing in at her holes, her breaking up, her magazine
 * going up. Tuning the damage's sound means editing this file; the takes and their prompts are in
 * tools/sound/sounds.json. Pure.
 *
 * Levels are amplitudes (0..1) like tuning.ts's: every hit peaks at −3 dBFS and every bed is levelled to −24 dBFS RMS
 * when made, so the gains here set the mix. A placed sound is full inside its `ref` (m) and half as loud at twice it.
 * All first proposals, judged by ear on the iPad (the plan's test: with eyes shut, where she was hit can be told).
 */
import type { SlapKind } from './tuning';

// --- A ball striking her ---------------------------------------------------------------------------------------------

/** A ball smashing into her timber close by: a splintering crash. */
export const HIT_NEAR: SlapKind = { id: 'hit/timber', gain: 0.95, ref: 10 };
/** A ball striking a ship some way off: a dull thud and crack across the water. */
export const HIT_FAR: SlapKind = { id: 'hit/far', gain: 0.8, ref: 120 };
/** Splinters thrown across her deck: a burst of whizzing shards and a dry clatter, heard only near. */
export const SPLINTERS: SlapKind = { id: 'hit/splinters', gain: 0.55, ref: 6 };
export const SPLINTERS_REACH = 60;
/** A ball striking a gun: the ringing clang and her carriage crashing over. */
export const IRON: SlapKind = { id: 'hit/iron', gain: 0.9, ref: 10 };
/** A line shot through and parting: a twang and a whip (and her wheel's ropes when her steering is shot away). */
export const ROPE: SlapKind = { id: 'hit/rope', gain: 0.7, ref: 8 };
/** A ball tearing through a sail. */
export const CANVAS: SlapKind = { id: 'hit/canvas', gain: 0.6, ref: 10 };

/** A ball lodged in her timber (not through) is a duller blow: this loud of a hole and pitched down so. */
export const LODGED_GAIN = 0.7;
export const LODGED_PITCH = 0.85;
/** A spar struck cracks higher than her side. */
export const SPAR_PITCH = 1.2;
/** Between these distances (m) the near crash gives way to the far thud (log distance, eased). */
export const HIT_NEAR_TO_FAR: readonly [number, number] = [30, 200];
/** Of one kind of blow in one step of one ship, at most this many are heard, the nearest (grape's nine balls at once). */
export const BLOWS_A_STEP = 3;

/** A ball striking her within `near` m of the captain jolts him (N2.7's `jolt`; 1 is a shot striking close by), as 1 / distance beyond. */
export const HIT_JOLT = { strength: 1, near: 2, reach: 15 } as const;

// --- What follows ------------------------------------------------------------------------------------------------------

/** A mast or spar going: the crack, the long tearing groan, the crash on her rail and the splash over her side. */
export const MAST_FALL: SlapKind = { id: 'mast/fall', gain: 1, ref: 25 };
/** With it her rigging comes down: this many lines part, one after another over this many seconds. */
export const RIGGING_PARTS = 4;
export const RIGGING_SECONDS = 1.6;
/** A mast going over jolts her: the captain feels it this strongly anywhere aboard her. */
export const FALL_JOLT = 0.6;

/** Her magazine going up: the blast, then timber raining down into the sea. Heard over the whole fight. */
export const EXPLODE: SlapKind = { id: 'ship/explode', gain: 1, ref: 80 };

// --- Beds --------------------------------------------------------------------------------------------------------------

/** A fire: crackling and roaring in its space, louder as more of the space burns (by the root of its share). Two takes. */
export const FIRE_BEDS: readonly string[] = ['bed/fire-a', 'bed/fire-b'];
export const FIRE = { gain: 0.9, ref: 6, glide: 0.8 } as const;
/** At most this many fires are heard at once, the nearest. */
export const FIRES_HEARD = 3;
/** A fire's sound stands this high over its space's floor, m. */
export const FIRE_HEIGHT = 1;

/**
 * The sea rushing in at a hole under her waterline: heard aboard her only (inside her planking), by the root of its
 * head of water up to `fullHead` m; on deck at `onDeck` of it. Two takes.
 */
export const INRUSH_BEDS: readonly string[] = ['bed/inrush-a', 'bed/inrush-b'];
export const INRUSH = { gain: 0.8, ref: 3, glide: 0.4, fullHead: 2, onDeck: 0.3 } as const;
/** At most this many holes are heard rushing at once, the nearest. */
export const INRUSH_HEARD = 3;

/**
 * Her breaking up: groaning and splitting timber with the sea roaring in, from `from` of her foundering water (or
 * once her magazine has gone), full at foundering. Heard aboard her on her own bus, from off her on the world's.
 */
export const BREAKUP = { id: 'bed/breakup', gain: 0.8, ref: 30, glide: 2, from: 0.6 } as const;
