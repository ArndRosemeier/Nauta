/**
 * What a man does while he has no task and is at his home place (Arnd, 2026-11-18: "people that are visible should
 * NEVER just stand around"): the helmsmen hold the wheel, the officers talk, the marines clean their arms or keep
 * their watch with a pistol ready, the idle hands mend, coil and tinker on deck or eat and talk at their messes
 * below. By the place he is at, then his seed. Pure; clips are the pack's (crewLooks.ts PACK_CLIPS).
 */
import type { Man } from '../sim/crew/roster';
import { WHEEL } from '../sim/rules/crew';

/** At the wheel: the hands on the spokes. */
const STEERING = 'interact';
/** The chores of hands standing by on deck: mending, coiling down, tinkering with gear. */
const CHORES = ['repair (kneeling)', 'pick up', 'interact', 'repair (kneeling)', 'pick up'] as const;
/** At the messes below. */
const MESSING = ['eat or drink', 'talk', 'eat or drink', 'talk', 'nod'] as const;
/** Officers on deck: in talk. */
const TALKING = ['talk', 'nod', 'talk'] as const;
/** The marines off duty: cleaning their arms and gear, talking. */
const CLEANING = ['interact', 'interact', 'talk', 'interact'] as const;
/** A sentry on watch, his pistol ready. */
const ON_WATCH = 'pistol idle';
/** Anyone else. */
const TINKERING = 'interact';

/** The places of a kind of man by the id's start: the clips he plays there, by his seed. */
const BY_PLACE: readonly (readonly [prefix: string, clips: readonly string[]])[] = [
  [WHEEL, [STEERING]],
  ['station-sentries', [ON_WATCH]],
  ['station-cabin-door', [ON_WATCH]],
  ['station-marines', CLEANING],
  ['station-idle-', CHORES],
  ['station-mess-', MESSING],
  ['station-quarterdeck', TALKING],
  ['station-waist', TALKING],
];

/** The clip of man `m` standing by at his home place, by his seed (`manSeed`): never none, never a plain stand. */
export function standByClip(m: Man, seed: number): string {
  const row = BY_PLACE.find(([prefix]) => m.home.startsWith(prefix));
  const clips = row ? row[1] : [TINKERING];
  return clips[seed % clips.length]!;
}

/** Every clip a man standing by can play (the crowd bakes them). */
export const STAND_BY_CLIPS: readonly string[] = [...new Set([STEERING, ON_WATCH, TINKERING, ...CHORES, ...MESSING, ...TALKING, ...CLEANING])];
