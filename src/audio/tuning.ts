/**
 * The sea's and the wind's sound, as data (plan N1.7): which ambience beds play at which sea state and wind speed, how
 * loud, and which slaps and crests are heard near the listener. Tuning the sound means editing this file; the takes
 * themselves are listed with their prompts in tools/sound/sounds.json. Pure.
 *
 * Every bed take is levelled alike when it is made (−24 dBFS RMS), so the gains here are what makes a gale louder
 * than a calm. Levels are amplitudes (0..1) on the engine's world bus.
 */

/** A bed of the mix: two takes of it (`<id>-a`, `<id>-b`) blended slowly, and where on its scale it plays. */
export interface BedAnchor {
  /** The bed's sound id without its take letter (`bed/sea-calm`). */
  readonly id: string;
  /** Where it plays fullest: a Beaufort force (sea beds) or a wind speed in m/s (wind beds). */
  readonly at: number;
  /** Its level there, 0..1. */
  readonly gain: number;
}

/**
 * The sea's beds, by the force of the sea (its wave layers' wind on the Beaufort scale, weighted as the layers show).
 * Between two neighbours the mix crossfades at equal power; below the first and above the last, that one alone.
 * A calm is quiet water at the side; a breeze an irregular seethe; a strong breeze loud whitecaps; a gale a roar.
 */
export const SEA_BEDS: readonly BedAnchor[] = [
  { id: 'bed/sea-calm', at: 0, gain: 0.32 },
  { id: 'bed/sea-breeze', at: 3, gain: 0.55 },
  { id: 'bed/sea-fresh', at: 5.5, gain: 0.8 },
  { id: 'bed/sea-gale', at: 8, gain: 1 },
];

/**
 * The wind's beds, by the wind's speed at the listener, m/s, gusts included, so a gust passing over is heard rising
 * and falling. 3 m/s is a light breeze (force 2), 8 a moderate to fresh breeze, 14 a near gale, 20 a gale.
 */
export const WIND_BEDS: readonly BedAnchor[] = [
  { id: 'bed/wind-light', at: 3, gain: 0.22 },
  { id: 'bed/wind-fresh', at: 8, gain: 0.45 },
  { id: 'bed/wind-strong', at: 14, gain: 0.75 },
  { id: 'bed/wind-gale', at: 20, gain: 1 },
];

/** Below this wind speed nothing of the wind is heard, m/s (a calm); from WIND_FULL on its beds play at their gain (a light breeze). */
export const WIND_SILENT = 0.6;
export const WIND_FULL = 3;

/** How fast the wind's level follows a gust, s (the engine's glide): quicker than the sea's, which changes over minutes. */
export const WIND_GLIDE = 0.6;
/** How fast the sea's and the swell's levels follow, s. */
export const SEA_GLIDE = 1.5;

/**
 * The two takes of a bed are blended by a slow swing, so the mix never comes round to the same moment: each bed's swing
 * takes a seeded time between these, s. With 30 s takes laid in two chains at slightly different rates, the whole
 * repeats only after many minutes.
 */
export const TAKE_SWING: readonly [number, number] = [47, 113];

/** The swell's deep surge under the listener: its level when the water is still and when it rises or falls fast. */
export const SWELL_GAIN: readonly [number, number] = [0.12, 0.42];
/**
 * The water's vertical speed at which the swell's surge is fullest, m/s: about what the swell from elsewhere (0.6 m,
 * 10 s) reaches at its fastest, π·0.6/10, and a breeze's sea a little more.
 */
export const SWELL_SPEED_FULL = 0.25;

/** A sound placed on the water near the listener when a crest passes there. */
export interface SlapKind {
  /** Its sound id: a set of seeded takes. */
  readonly id: string;
  /** Its loudness for a crest of the sea's usual height. */
  readonly gain: number;
  /** Half as loud at twice this distance, m. */
  readonly ref: number;
}

/** Small wavelets lapping (a calm or light air). */
export const LAP: SlapKind = { id: 'slap/lap', gain: 0.55, ref: 3 };
/** A wave slapping the hull (from a gentle breeze on). */
export const SLAP: SlapKind = { id: 'slap/hull', gain: 0.6, ref: 4 };
/** A crest tumbling into foam close by (whitecaps, from a moderate breeze on). */
export const CREST: SlapKind = { id: 'slap/crest', gain: 0.5, ref: 6 };
/** A heavy sea bursting alongside (from a strong breeze on). */
export const BURST: SlapKind = { id: 'slap/burst', gain: 0.75, ref: 8 };

/** Laps give way to slaps between these forces of the sea. */
export const LAP_UNTIL: readonly [number, number] = [1.5, 3];
/** Whitecaps: the share of crests that break, rising from none to most between these forces. */
export const CRESTS_BREAK: readonly [number, number] = [3, 7];
/** The most crests that break, however hard it blows. */
export const CRESTS_BREAK_MOST = 0.7;
/** Heavy seas: the share of breaking crests that burst against her, rising between these forces. */
export const BURSTS: readonly [number, number] = [5.5, 8];
/** The most breaking crests that burst. */
export const BURSTS_MOST = 0.45;

/** How many points on the water near the listener are watched for crests passing. */
export const SLAP_POINTS = 8;
/** How far from the listener they lie, m: least and most (a new place, seeded, after each sound). */
export const SLAP_REACH: readonly [number, number] = [3, 11];
/** The share of crests passing a point that are heard at all, so the slaps do not come in a beat. */
export const SLAP_CHANCE = 0.65;
/** No two placed sounds start closer together than this, s. */
export const SLAP_GAP = 0.3;
/** A crest is heard only when it stands higher than this many times the sea's RMS height (low humps pass unheard). */
export const CREST_LEAST = 0.6;
/** A crest's loudness follows its height over the usual crest's, held between these. */
export const CREST_LOUDNESS: readonly [number, number] = [0.5, 1.3];

/**
 * The most decoded sound kept, bytes: a 30 s bed decodes to 3.8 MB (32 kHz, 32-bit float), and between two forces nine
 * beds play at once (two sea and two wind beds of two takes each, and the swell), with the slaps beside them.
 */
export const SOUND_MEMORY = 48 * 1024 * 1024;
/** Under water the world's sound is heard through a low-pass at this frequency, Hz. */
export const UNDER_WATER_HZ = 350;
/** Below deck the sea and the wind come through the planking muffled, Hz (a first guess; N2.8 makes below deck sound right). */
export const BELOW_DECK_HZ = 900;
