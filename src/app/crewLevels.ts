/**
 * The crew's levels of detail and animation rates (plan N4.0): for every man, from his distance to the eye and whether
 * he is seen, which of Actors' levels draws him, how often his clip advances and whether he casts the sun's shadow.
 * Pure: the crew view measures and applies; the knobs come from the quality level (quality.ts `CrewKnobs`).
 *
 * Every change of level costs Actors a rebuild of what the clothes hide, so a man keeps his level until he is
 * `STICK` farther than its limit: two men at about the same distance do not trade places every frame.
 */
import type { CrewKnobs } from './quality';

/** Actors' levels (the pack's `lods`): full detail, the base mesh, and the one-draw crowd mesh. */
export const FULL = 0;
export const MEDIUM = 1;
export const CROWD = 2;
/** How much farther than a level's limit a man keeps that level, m. */
export const STICK = 2;

/** What the rule needs to know of a man this frame. */
export interface ManSeen {
  /** From the eye, m. */
  readonly distance: number;
  /** In the view and in a room of hers that is drawn. */
  readonly seen: boolean;
  /** His level last frame. */
  readonly level: number;
}

/** What the rule decides for him. */
export interface ManLevel {
  level: number;
  /** His clip advances every this many frames (1: every frame). */
  step: number;
  shadow: boolean;
}

/** Overrides a trial phase makes (crewTrial.ts): every man at one level, every man animated every frame, no shadows. */
export interface CrewOverride {
  readonly level?: number;
  readonly everyFrame?: boolean;
  readonly shadows?: boolean;
}

/** The step of a man seen at `distance`. */
export function stepAt(k: CrewKnobs, distance: number): number {
  const i = k.stepsTo.findIndex((to) => distance <= to);
  return k.steps[i < 0 ? k.steps.length - 1 : i]!;
}

/**
 * The levels of all men, in `out` (one per man, reused frame to frame). The nearest seen men, at most `k.detailed`,
 * get Full or Medium by distance; everyone else is drawn at the crowd level.
 */
export function crewLevels(men: readonly ManSeen[], k: CrewKnobs, out: ManLevel[], override: CrewOverride = {}): ManLevel[] {
  while (out.length < men.length) out.push({ level: CROWD, step: 1, shadow: false });
  out.length = men.length;
  // The nearest seen men are the candidates for detail; each keeps his level a little longer than its limit.
  const order = men.map((_, i) => i).filter((i) => men[i]!.seen).sort((a, b) => men[a]!.distance - men[b]!.distance);
  let detailed = 0;
  for (const m of out) m.level = CROWD;
  for (const i of order) {
    if (detailed >= k.detailed) break;
    const m = men[i]!, held = (to: number, level: number) => m.distance <= to + (m.level <= level ? STICK : 0);
    const level = held(k.fullTo, FULL) && k.fullTo > 0 ? FULL : held(k.mediumTo, MEDIUM) ? MEDIUM : CROWD;
    if (level === CROWD) continue;
    out[i]!.level = level;
    detailed++;
  }
  men.forEach((m, i) => {
    const o = out[i]!;
    if (override.level !== undefined) o.level = override.level;
    o.step = override.everyFrame ? 1 : m.seen ? stepAt(k, m.distance) : k.hiddenStep;
    o.shadow = override.shadows !== false && m.distance <= k.shadowTo;
  });
  return out;
}
