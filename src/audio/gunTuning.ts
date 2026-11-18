/**
 * Gunfire heard, as data (plan N5.6): the report of a gun close by, far off and through her deck, shot passing, shot
 * falling into the sea, the ears ringing after a broadside close by, and the jolt of her own guns through her deck.
 * Tuning the guns' sound means editing this file; the takes and their prompts are in tools/sound/sounds.json, the
 * ringing's synthesis in tools/sound/ring.mjs. Pure.
 *
 * Levels are amplitudes (0..1) like tuning.ts's: every take peaks at −3 dBFS when made, so the gains here set the mix.
 * Distances are the engine's: a placed sound is half as loud at twice its `ref` (m) and full inside it. All first
 * proposals, judged by ear on the iPad with headphones (the plan's test: the first broadside makes Arnd flinch).
 */
import type { GunKind } from '../sim/rules/ships';
import type { ShotKind } from '../sim/rules/guns';
import type { SlapKind } from './tuning';

// --- The report ------------------------------------------------------------------------------------------------------

/**
 * A gun fired close by: the crack and boom, the carriage rumbling back. The loudest thing in the game, full out to
 * `ref`: every gun of her own battery is within it from anywhere on her deck.
 */
export const GUN_NEAR: SlapKind = { id: 'gun/near', gain: 1, ref: 22 };
/** A gun far off across the water: the crack gone, a heavy boom rolling away. Full out to `ref`. */
export const GUN_FAR: SlapKind = { id: 'gun/far', gain: 0.9, ref: 160 };
/** One of her own guns heard below deck: the deck overhead jumps, her timbers shake and loose things rattle. */
export const GUN_THROUGH: SlapKind = { id: 'gun/through', gain: 1, ref: 14 };

/** Between these distances (m) the near report gives way to the far one (log distance, eased). */
export const NEAR_TO_FAR: readonly [number, number] = [45, 260];
/** Each kind of gun's report pitched (the carronade's short heavy 32-pounder deeper, the long six sharper). */
export const GUN_PITCH: Readonly<Record<GunKind, number>> = { carronade: 0.92, long6: 1.12 };
/** A report more than this late (s: a tab that slept, a jump of the browser checks) is left out. */
export const LATE = 0.25;
/** Sounds are handed to the engine this long (s) before they are heard, with the rest as their delay. */
export const LOOK_AHEAD = 0.2;

// --- Shot passing and falling ------------------------------------------------------------------------------------------

/** A ball passing within `reach` m of the ear: a tearing rush, full within `ref`. */
export const SHOT_PASS: SlapKind = { id: 'shot/pass', gain: 0.95, ref: 6 };
export const PASS_REACH = 40;
/** A ball slower than this (m/s) passing is not heard (spent, rolling down to the sea). */
export const PASS_SLOWEST = 50;
/** The pass take's loudest moment is this far into it (s): it is started that long before the ball is nearest. */
export const PASS_LEAD = 0.9;
/** Each kind of shot's rush pitched (chain's two halves whirl lower, grape's small balls higher). */
export const PASS_PITCH: Readonly<Record<ShotKind, number>> = { round: 1, chain: 0.8, grape: 1.25 };
/** The first moments of a ball's flight are its gun's: closer to the muzzle than this (m) a pass is not heard. */
export const PASS_CLEAR = 12;

/** A ball striking the water within `reach` m: a smack and a heavy splash. */
export const SHOT_SPLASH: SlapKind = { id: 'shot/splash', gain: 0.8, ref: 20 };
export const SPLASH_REACH = 400;
/** A skip off the water (not the last plunge) is this loud of a plunge and pitched up so (the ball is smaller in the water). */
export const SKIP_GAIN = 0.55;
export const SKIP_PITCH = 1.2;
/** At most this many splashes of one shot are heard (grape's nine balls), the nearest. */
export const SPLASHES_A_SHOT = 3;

// --- Deafened ----------------------------------------------------------------------------------------------------------

/**
 * How much a gun deafens: each report adds `dose` × (`near` / distance, at most 1) to the ears' load, which falls away
 * with the time constant `decay` (s); the load over 1 counts as 1. A broadside fired round the ear deafens fully for a
 * moment; one gun across her deck a little. Below deck her own guns deafen by `below` of that.
 */
export const DEAF = { dose: 0.32, near: 6, decay: 2.6, below: 0.5 } as const;
/**
 * Deafened, the world is dull: the sea, the wind and the enemy's guns (the world bus) through a low-pass that glides
 * from open down to `hz` and at `through` of their level when fully deafened. Her own sounds (the body bus) stay.
 */
export const DULL = { hz: 650, through: 0.35 } as const;
/** The low-pass when open, Hz (the engine's open is half its rate; this is where the glide starts from). */
export const OPEN_HZ = 16000;
/** The ringing in the ears (in the head, never muffled): starts when the load passes `from`, at most once in `every` s. */
export const RING: SlapKind = { id: 'gun/ring', gain: 0.22, ref: 1 };
export const RING_FROM = 0.6;
export const RING_EVERY = 5;

// --- The jolt ----------------------------------------------------------------------------------------------------------

/**
 * Her own gun firing jolts the deck under the captain (N2.7's `jolt`; 1 is a shot striking close by): this strong
 * within `near` m of the gun, weaker as 1 / distance beyond.
 */
export const JOLT = { strength: 0.45, near: 3 } as const;
