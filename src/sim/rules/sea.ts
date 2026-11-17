/**
 * The sea's rules: how high and how long the waves are for each wind force, and how the wind's spectrum is turned
 * into the waves the simulation carries (src/sim/sea). Tuning the sea means editing this file. Pure data.
 */
import { DEGREE } from '../units';

/**
 * Wave height and period by Beaufort force (index = force). `height` is the significant wave height (m, the mean
 * of the highest third): the WMO "probable wave height" for the open sea. `period` is the spectrum's peak period
 * (s), about 4.5 √height, the steepness of a young wind sea. Force 0 has no waves; its period only keeps the
 * spectrum defined.
 */
export const SEA_BY_FORCE: readonly { readonly height: number; readonly period: number }[] = [
  { height: 0, period: 1 },
  { height: 0.1, period: 1.4 },
  { height: 0.2, period: 2.0 },
  { height: 0.6, period: 3.5 },
  { height: 1.0, period: 4.5 },
  { height: 2.0, period: 6.4 },
  { height: 3.0, period: 7.8 },
  { height: 4.0, period: 9.0 },
  { height: 5.5, period: 10.6 },
  { height: 7.0, period: 11.9 },
  { height: 9.0, period: 13.5 },
  { height: 11.5, period: 15.3 },
  { height: 14.0, period: 16.8 },
];

/**
 * How many wave components the wind sea carries. Every one costs a sine and a cosine per sample, and 1000
 * samples must take under 1 ms (implementation plan, N1.1), so this stays small; the renderer adds the many short
 * waves on top. The wind sea and the swell (SWELL_COMPONENTS) share the 28 that hold the time with room on a CI
 * runner (32 missed it); below about 24 distant patches of a calm sea begin to resemble each other
 * (autocorrelation over 0.65 within 2 km).
 */
export const SEA_COMPONENTS = 25;

/**
 * The band of the spectrum the simulation carries, as multiples of the peak frequency. Below the low end there is
 * almost no energy; above the high end the waves are shorter than about a sixth of the peak wavelength, too short
 * for a hull to feel, and are the renderer's.
 */
export const SEA_BAND_LOW = 0.6;
export const SEA_BAND_HIGH = 2.5;

/**
 * JONSWAP peak enhancement: how much sharper the spectrum's peak is than a fully developed sea's (3.3 is the
 * North Sea mean, a sea still growing under its wind).
 */
export const SEA_PEAK_SHARPNESS = 3.3;

/**
 * Directional spread, the exponent s of cos^(2s)(angle / 2) around the wind: 6 gives a short-crested wind sea
 * with most waves within about 40° of the wind.
 */
export const SEA_SPREAD = 6;

/**
 * Gerstner choppiness: how far water moves sideways towards the crests, as a part of a wave's height (0 rolling
 * sines, 1 the full trochoid). Sharp crests and wide troughs.
 */
export const SEA_CHOPPINESS = 0.9;

/**
 * The largest sum of (choppiness × steepness) one wind wave set may have; above it the set's choppiness is scaled
 * down. Below 1 the surface can never fold over itself; at 0.7 even two sets crossfading (each weighted by at most
 * √½ + √½ = √2) stay at 0.99, and the swell (SWELL_FOLD_LIMIT) takes no more than what is left up to 1.
 */
export const SEA_FOLD_LIMIT = 0.7;

/** How long the sea takes to follow a change of its wind, s: "blends over minutes" (implementation plan, N1.1). */
export const SEA_CHANGE_SECONDS = 180;

/**
 * How far the wind may move from the one the sea last took before the sea takes the new one (`followWind`): a
 * change of speed, m/s, about half a Beaufort force at a fresh breeze; and a turn, rad (15°), about what the eye
 * notices in the run of the waves.
 */
export const SEA_FOLLOW_SPEED = 1.5;
export const SEA_FOLLOW_ANGLE = 15 * DEGREE;

/**
 * The swell from elsewhere (implementation plan N1.10): a long, low swell that the local wind did not raise, there
 * in every sea and the same in every preset, so a flat calm is glassy on top and still breathes, and in a breeze the
 * wind sea crosses an older one. It is drawn once per sea from its seed and never follows the wind.
 *
 * SWELL_HEIGHT is the swell's own significant height, m (about 0.6 m: a low swell, felt under a ship more than
 * seen). It adds to a wind sea's height as squares do (Hs² of both), so it raises a preset by at most this much.
 */
export const SWELL_HEIGHT = 0.6;

/** How many wave components the swell carries: a few, so the sea's sample cost stays within its budget. */
export const SWELL_COMPONENTS = 3;

/**
 * The swell's periods, s: 9 to 12 s, waves 125 to 225 m long that have travelled out of a storm far away. Its waves
 * are spread evenly over this band, each jittered within its share by the seed.
 */
export const SWELL_PERIOD_SHORTEST = 9;
export const SWELL_PERIOD_LONGEST = 12;

/**
 * How far the swell runs from the wind's direction at the start, rad: at least 40°, so it reads as a sea from
 * somewhere else and crosses the wind sea; beyond that its side and angle are the seed's, up to running against
 * the wind.
 */
export const SWELL_OFF_WIND = 40 * DEGREE;

/**
 * How far each swell wave runs off the swell's own direction, rad (either side): a narrow spread, so its crests are
 * long but not endless ruled lines.
 */
export const SWELL_SPREAD = 8 * DEGREE;

/**
 * The largest sum of (choppiness × steepness) the swell may have: what two crossfading wind sets leave below 1
 * (1 − √2·SEA_FOLD_LIMIT, about 0.01), so the whole sea never folds. A 0.6 m swell of 9 to 12 s sums to about 0.015
 * at full choppiness, so its water moves round a little less than a full trochoid's.
 */
export const SWELL_FOLD_LIMIT = 1 - Math.SQRT2 * SEA_FOLD_LIMIT;
