/**
 * The player's settings (implementation plan N7.3): what they are, their defaults and their bounds, and reading
 * them back from whatever the device kept. Pure: the store (settingsStore.ts) keeps them on the device, the panel
 * (settingsPanel.ts) changes them, and each part of the page applies its own when it changes.
 *
 * Kept on the device, never sent: two captains in one room each have their own. Only the match length is a rule of
 * the match; the host's applies, from the next match on.
 */
import { MOTION_START, MOTION_STEPS } from '../sim/rules/body';
import { MATCH_MINUTES } from '../sim/rules/end';
import { QUALITY_LEVELS } from './quality';

/** The quality setting: `auto` measures frame time and chooses (quality.ts), or a level by its name. */
export type QualitySetting = 'auto' | string;
/** How much of the wounded and the killed is drawn (plan N6.6, design: the same simulation under each). */
export const VIOLENCE_LEVELS = ['mild', 'plain', 'unsparing'] as const;
export type Violence = (typeof VIOLENCE_LEVELS)[number];
/** The languages of the interface (design thread, 2026-11-18: English and German). */
export const LANGUAGES = ['en', 'de'] as const;
export type Language = (typeof LANGUAGES)[number];
/** Which thumb walks on a tablet; the other looks (plan N2.3 puts the walking thumb on the left). */
export const THUMB_SIDES = ['left', 'right'] as const;
export type ThumbSide = (typeof THUMB_SIDES)[number];
/** The sound's parts, each with its own level under the whole (`all`). */
export const SOUND_PARTS = ['all', 'sea', 'ship', 'crew', 'battle'] as const;
export type SoundPart = (typeof SOUND_PARTS)[number];
/**
 * The keys a player may change, each one key (its `code`); the arrows always walk as well. Walking and the glass,
 * then the orders (docs/design/orders.md "Keys"): steer there, come up and bear away a point, tack, wear, heave to,
 * the three settings of sail and shorten, beat to quarters, the three shot, fire (as they bear, or the word), cease
 * firing, the fan of the man looked at, the midshipman.
 */
export const KEY_ACTIONS = ['forward', 'back', 'left', 'right', 'glass', 'steer', 'up', 'away', 'tack', 'wear', 'heave', 'battle', 'plain', 'all', 'shorten', 'quarters', 'round', 'chain', 'grape', 'fire', 'cease', 'fan', 'midshipman'] as const;
export type KeyAction = (typeof KEY_ACTIONS)[number];

export interface Settings {
  readonly quality: QualitySetting;
  /** The frame times and the rest of the HUD on screen (`?hud` for one visit). */
  readonly frameTimes: boolean;
  /** Each part's level, 0..1. */
  readonly sound: Readonly<Record<SoundPart, number>>;
  /** How much of his body's motion the view takes (plan N2.7): one of `MOTION_STEPS`. */
  readonly motion: number;
  /** How far a drag turns the look, times the natural (a finger: the picture stays under it). */
  readonly fingerSpeed: number;
  readonly mouseSpeed: number;
  /** The mouse moved up looks down (a flight stick's way); off, it looks up. */
  readonly mouseInverted: boolean;
  readonly thumb: ThumbSide;
  readonly keys: Readonly<Record<KeyAction, string>>;
  readonly violence: Violence;
  /** How long a match may last before it is drawn at nightfall, minutes (rules/end.ts `MATCH_MINUTES` by default). */
  readonly matchMinutes: number;
  readonly language: Language;
}

/** The slowest and fastest a drag may turn the look, times the natural. */
export const SPEED_LEAST = 0.25;
export const SPEED_MOST = 3;
/** The match lengths offered, minutes, and their step. */
export const MATCH_LEAST = 15;
export const MATCH_MOST = 90;
export const MATCH_STEP = 5;

export const DEFAULT_SETTINGS: Settings = {
  quality: 'auto',
  frameTimes: false,
  sound: { all: 1, sea: 1, ship: 1, crew: 1, battle: 1 },
  motion: MOTION_START,
  fingerSpeed: 1,
  mouseSpeed: 1,
  mouseInverted: false,
  thumb: 'left',
  keys: {
    forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', glass: 'KeyQ',
    steer: 'KeyX', up: 'KeyZ', away: 'KeyC', tack: 'KeyT', wear: 'KeyG', heave: 'KeyH',
    battle: 'Digit1', plain: 'Digit2', all: 'Digit3', shorten: 'Digit4',
    quarters: 'KeyB', round: 'Digit7', chain: 'Digit8', grape: 'Digit9', fire: 'KeyF', cease: 'KeyV', fan: 'KeyE', midshipman: 'KeyM',
  },
  violence: 'plain',
  matchMinutes: MATCH_MINUTES,
  language: 'en',
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, of: readonly T[], or: T): T => (of.includes(v as T) ? (v as T) : or);
const between = (v: unknown, least: number, most: number, or: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(most, Math.max(least, v)) : or);

/** The quality settings there are: `auto`, then every level by name, best first. */
export const QUALITY_CHOICES: readonly QualitySetting[] = ['auto', ...QUALITY_LEVELS.map((l) => l.name)];

/**
 * Settings from whatever was kept (an older build's, a hand-edited one, nothing): every field that is missing,
 * of the wrong kind or out of bounds takes its default, so a build never starts from settings it cannot use.
 */
export function readSettings(kept: unknown): Settings {
  const k = isRecord(kept) ? kept : {}, d = DEFAULT_SETTINGS;
  const sound = isRecord(k.sound) ? k.sound : {}, keys = isRecord(k.keys) ? k.keys : {};
  return {
    quality: oneOf(k.quality, QUALITY_CHOICES, d.quality),
    frameTimes: typeof k.frameTimes === 'boolean' ? k.frameTimes : d.frameTimes,
    sound: Object.fromEntries(SOUND_PARTS.map((p) => [p, between(sound[p], 0, 1, d.sound[p])])) as Record<SoundPart, number>,
    motion: MOTION_STEPS.find((s) => s === k.motion) ?? d.motion,
    fingerSpeed: between(k.fingerSpeed, SPEED_LEAST, SPEED_MOST, d.fingerSpeed),
    mouseSpeed: between(k.mouseSpeed, SPEED_LEAST, SPEED_MOST, d.mouseSpeed),
    mouseInverted: typeof k.mouseInverted === 'boolean' ? k.mouseInverted : d.mouseInverted,
    thumb: oneOf(k.thumb, THUMB_SIDES, d.thumb),
    keys: keptKeys(keys),
    violence: oneOf(k.violence, VIOLENCE_LEVELS, d.violence),
    matchMinutes: Math.round(between(k.matchMinutes, MATCH_LEAST, MATCH_MOST, d.matchMinutes) / MATCH_STEP) * MATCH_STEP,
    language: oneOf(k.language, LANGUAGES, d.language),
  };
}

/** The glass's key before the order keys came (N4.4): G is Wear now (orders.md), so a glass kept on G moves to its new default. */
const OLD_GLASS = 'KeyG';

/**
 * The keys kept, each action's own or its default; a build before the order keys kept no `wear`, and its glass on G
 * gives G up to Wear. Two actions never share a key: a later one that would take a key in use keeps its default.
 */
function keptKeys(keys: Record<string, unknown>): Record<KeyAction, string> {
  const d = DEFAULT_SETTINGS.keys, out = {} as Record<KeyAction, string>, used = new Set<string>();
  const old = !('wear' in keys);
  for (const a of KEY_ACTIONS) {
    let k = typeof keys[a] === 'string' && keys[a] ? (keys[a] as string) : d[a];
    if (old && a === 'glass' && k === OLD_GLASS) k = d.glass;
    if (used.has(k)) k = d[a];
    out[a] = k;
    used.add(k);
  }
  return out;
}

/** `s` with one key given to `action`; an action that had that key before takes `action`'s old key, so no key does two things. */
export function withKey(s: Settings, action: KeyAction, code: string): Settings {
  const keys: Record<KeyAction, string> = { ...s.keys };
  const clash = KEY_ACTIONS.find((a) => a !== action && keys[a] === code);
  if (clash) keys[clash] = keys[action];
  keys[action] = code;
  return { ...s, keys };
}

/** The language a browser asks for, as far as the interface has it (`navigator.language`, `de-AT` is German). */
export const languageOf = (asked: string | undefined): Language => (asked?.toLowerCase().startsWith('de') ? 'de' : 'en');
