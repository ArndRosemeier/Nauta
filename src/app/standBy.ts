/**
 * What a man does while he has no task and is at his home place (Arnd, 2026-11-18: "people that are visible should
 * NEVER just stand around"): the helmsmen hold the wheel, the officers talk, the marines clean their arms or keep
 * their watch with a pistol ready. The hands off watch are not on deck at all: they sleep below (crewDrawn.ts). By the place he is at, then his seed. Pure; clips are the pack's (crewLooks.ts PACK_CLIPS).
 */
import type { Man } from '../sim/crew/roster';
import { WHEEL } from '../sim/rules/crew';

/** At the wheel: the hands on the spokes. */
const STEERING = 'interact';
/** Officers on deck: in talk. */
const TALKING = ['talk', 'nod', 'talk'] as const;
/** The marines off duty: cleaning their arms and gear, talking. */
const CLEANING = ['interact', 'interact', 'talk', 'interact'] as const;
/** A sentry on watch, his pistol ready. */
const ON_WATCH = 'pistol idle';
/** Anyone else. */
const TINKERING = 'interact';
/** At his gun at quarters, ready: heaving with a handspike, sponging and ramming, crouched low by the carriage, eyes on the enemy. */
const AT_GUN = ['push', 'interact', 'crouch', 'arms folded', 'interact', 'push', 'crouch'] as const;
/** A marine at quarters, his arm ready. */
const ARMED = ['pistol idle', 'pistol idle', 'pistol aim up'] as const;
/** Anyone else told off to his place at quarters: alert, glancing about, a word to his neighbour. */
const ALERT = ['arms folded', 'nod', 'arms folded', 'shake head', 'talk'] as const;
/** An officer at his place at quarters: crying his orders to the guns across the deck, a look, a nod to the man he has told. */
const CALLING = ['call from rail', 'arms folded', 'call from rail', 'nod'] as const;
/** A powder boy at his gun, handing the cartridge over to her captain and looking for the next. */
const HANDING = ['pick up', 'interact', 'pick up'] as const;
/** The midshipman at the captain's side: attentive, glancing about, ready to be sent off. */
const ATTENTIVE = ['arms folded', 'nod', 'shake head'] as const;

/** The places of a kind of man by the id's start: the clips he plays there, by his seed. */
const BY_PLACE: readonly (readonly [prefix: string, clips: readonly string[]])[] = [
  [WHEEL, [STEERING]],
  ['station-sentries', [ON_WATCH]],
  ['station-cabin-door', [ON_WATCH]],
  ['station-marines', CLEANING],
  ['station-quarterdeck', TALKING],
  ['station-waist', TALKING],
];

/** The clip of man `m` standing by at his home place, by his seed (`manSeed`): never a plain stand. */
export function standByClip(m: Man, seed: number): string {
  const row = BY_PLACE.find(([prefix]) => m.home.startsWith(prefix));
  const clips = row ? row[1] : [TINKERING];
  return clips[seed % clips.length]!;
}

/** The clip of a man at his place at quarters, or waiting there for his work to begin: ready at his gun, arms at hand, or alert. */
export function standToClip(m: Man, seed: number): string {
  const clips = m.gun !== null ? AT_GUN : m.part === 'marines' ? ARMED : m.part === 'boys' ? HANDING : m.part === 'officers' ? CALLING : ALERT;
  return clips[seed % clips.length]!;
}

/** The clip of the midshipman standing by the captain. */
export const attentiveClip = (seed: number): string => ATTENTIVE[seed % ATTENTIVE.length]!;

/** Every clip a man standing by or standing to can play (the crowd bakes them). */
export const STAND_BY_CLIPS: readonly string[] = [
  ...new Set([STEERING, ON_WATCH, TINKERING, ...TALKING, ...CLEANING, ...AT_GUN, ...ARMED, ...HANDING, ...CALLING, ...ALERT, ...ATTENTIVE]),
];
