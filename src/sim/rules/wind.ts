/**
 * The wind's rules (docs/ARCHITECTURE.md: rules as data), one row per force of the Beaufort scale, calm to gale. The
 * mean speed of each force is the scale's (beaufort.ts). The gust, veer and freshen numbers are first proposals tuned
 * for the look of the water and the feel of sailing; they are adjusted by eye at N1.4 and N3.3. Pure.
 */
import { DEGREE, SECONDS_PER_MINUTE } from '../units';

/** One force of wind: its speed, its gusts and how its mean swings about. */
export interface WindPreset {
  /** What a gust adds to the mean speed at its heart, at its peak: least and most, as a fraction of the mean. */
  readonly gustStrength: readonly [number, number];
  /** A gust patch's radius on the water, m: least and most. */
  readonly gustRadius: readonly [number, number];
  /** How long a gust lasts, from rising to gone, s: least and most. */
  readonly gustLife: readonly [number, number];
  /** Mean distance between neighbouring gusts on the water at one moment, m. */
  readonly gustSpacing: number;
  /** The most the mean wind swings to either side of its bearing, rad. */
  readonly veer: number;
  /** The most the mean speed rises or falls by freshening and easing, as a fraction of the mean. */
  readonly freshen: number;
}

/** How long one slow swing of the wind's bearing takes, s: least and most (a shift is felt over a quarter hour). */
export const VEER_PERIOD: readonly [number, number] = [10 * SECONDS_PER_MINUTE, 30 * SECONDS_PER_MINUTE];
/** How long one slow freshening and easing takes, s: least and most. */
export const FRESHEN_PERIOD: readonly [number, number] = [5 * SECONDS_PER_MINUTE, 20 * SECONDS_PER_MINUTE];
/** How many slow swings add up to the veer and to the freshening: two, so neither is a plain sine. */
export const WIND_SWINGS = 2;
/** The chance that a place and time slot holds a gust: below one, so gusts do not lie on a visible grid. */
export const GUST_CHANCE = 0.6;

/** The wind of each force, indexed by its number on the Beaufort scale (0 calm to 8 gale; stronger is not sailed in yet). */
export const WIND_PRESETS: readonly WindPreset[] = [
  // 0 calm
  { gustStrength: [0.5, 1.5], gustRadius: [20, 80], gustLife: [30, 90], gustSpacing: 400, veer: 45 * DEGREE, freshen: 0.3 },
  // 1 light air
  { gustStrength: [0.4, 1], gustRadius: [30, 100], gustLife: [40, 100], gustSpacing: 350, veer: 35 * DEGREE, freshen: 0.25 },
  // 2 light breeze
  { gustStrength: [0.3, 0.7], gustRadius: [40, 130], gustLife: [40, 120], gustSpacing: 350, veer: 25 * DEGREE, freshen: 0.2 },
  // 3 gentle breeze
  { gustStrength: [0.25, 0.55], gustRadius: [50, 160], gustLife: [45, 130], gustSpacing: 350, veer: 20 * DEGREE, freshen: 0.15 },
  // 4 moderate breeze
  { gustStrength: [0.2, 0.45], gustRadius: [60, 190], gustLife: [50, 140], gustSpacing: 380, veer: 15 * DEGREE, freshen: 0.12 },
  // 5 fresh breeze
  { gustStrength: [0.18, 0.4], gustRadius: [70, 220], gustLife: [50, 150], gustSpacing: 400, veer: 12 * DEGREE, freshen: 0.1 },
  // 6 strong breeze
  { gustStrength: [0.16, 0.36], gustRadius: [80, 250], gustLife: [50, 150], gustSpacing: 420, veer: 10 * DEGREE, freshen: 0.1 },
  // 7 near gale
  { gustStrength: [0.15, 0.33], gustRadius: [90, 280], gustLife: [50, 150], gustSpacing: 450, veer: 10 * DEGREE, freshen: 0.1 },
  // 8 gale
  { gustStrength: [0.15, 0.3], gustRadius: [100, 300], gustLife: [50, 150], gustSpacing: 480, veer: 10 * DEGREE, freshen: 0.1 },
];
