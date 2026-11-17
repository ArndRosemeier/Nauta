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
 * How many wave components the simulation carries. Every one costs a sine and a cosine per sample, and 1000
 * samples must take under 1 ms (implementation plan, N1.1), so this stays small; the renderer adds the many short
 * waves on top. 28 holds the time with room on a CI runner; below about 24 distant patches of a calm sea begin
 * to resemble each other (autocorrelation over 0.65 within 2 km).
 */
export const SEA_COMPONENTS = 28;

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
 * The largest sum of (choppiness × steepness) one wave set may have; above it the set's choppiness is scaled
 * down. Below 1 the surface can never fold over itself; at 0.7 even two sets crossfading (each weighted by at most
 * √½ + √½ = √2) stay below 1.
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
