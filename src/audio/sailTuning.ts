/**
 * The sound under sail, as data (plan N3.9): the wind in her rigging by the apparent wind, canvas flogging while it is
 * loose or shivering, a sail filling, a sail thundering aback, blocks as her lines run, and the creak of her yards as
 * they are braced round. Tuning it means editing this file; the takes and their prompts are in tools/sound/sounds.json.
 * Pure.
 *
 * Levels are amplitudes (0..1) like tuning.ts's: every bed is levelled to −24 dBFS RMS and every call peaks at −3 dBFS
 * when made, so the gains here set the mix. All first proposals, judged by ear on the iPad.
 */
import type { BedAnchor, SlapKind } from './tuning';

// --- The wind in her rigging ----------------------------------------------------------------------------------------

/**
 * The wind in her rigging, by the apparent wind aloft, m/s (the true wind less her own way: running before it she is
 * quiet aloft, close-hauled it sings): a low hum and moan in the shrouds and stays in a working breeze, shrieking in a
 * gale. Two takes each, blended by a slow swing as the sea's beds are; on the world bus, so below deck it comes through
 * her planking as the wind does.
 */
export const RIGGING_BEDS: readonly BedAnchor[] = [
  { id: 'bed/rigging-low', at: 7, gain: 0.3 },
  { id: 'bed/rigging-high', at: 18, gain: 0.7 },
];
/** Below this apparent wind her rigging is silent, m/s; from RIGGING_FULL on its beds play at their gain. */
export const RIGGING_SILENT = 3;
export const RIGGING_FULL = 8;
/** How fast the rigging's level follows the wind, s: a gust is heard aloft as it passes. */
export const RIGGING_GLIDE = 0.8;

// --- Canvas ---------------------------------------------------------------------------------------------------------

/** Canvas makes no sound below this apparent wind, m/s, and its full sound from CANVAS_FULL (a strong breeze) on. */
export const CANVAS_SILENT = 1;
export const CANVAS_FULL = 10;

/**
 * Loose canvas flogging: a sail let fall but not yet sheeted home, one being clewed up or brailed, one hanging in its
 * bunt before it is rolled up, and a set sail shivering. Its two takes, blended by a slow swing, one bed for each mast
 * (and one for the bowsprit's headsails) placed amid the canvas flogging there.
 */
export const FLOG_BEDS = ['bed/canvas-flog-a', 'bed/canvas-flog-b'] as const;
/** The flogging's level at full (CANVAS_FULL wind, FLOG_FULL_AREA loose) and how far it carries, m. */
export const FLOG_GAIN = 0.75;
export const FLOG_REF = 7;
/** This much loose canvas, m², flogs at full level (about a topsail let fall, 114 m²); less rises as the root of its share. */
export const FLOG_FULL_AREA = 100;
/** A set sail shivering flogs as this share of its area loose: its luff lifts and shakes, the rest still half full. */
export const SHIVER_FLOG = 0.5;
/** How fast the flogging's level follows, s. */
export const FLOG_GLIDE = 0.3;

/** A sail filling: the deep whump of canvas snapping taut, from the sail. */
export const FILL: SlapKind = { id: 'canvas/fill', gain: 0.7, ref: 8 };
/**
 * A sail fills when its belly as drawn (a share of its full belly at this wind, 1 for full) passes FILL_AT, having been
 * below FILL_REARM since it last filled: sheeted home, or full again after shivering (a shivering sail keeps 0.3).
 */
export const FILL_AT = 0.6;
export const FILL_REARM = 0.35;

/** A sail taken aback: a thunderous slam of canvas back against the mast and its rigging. */
export const ABACK: SlapKind = { id: 'canvas/aback', gain: 0.9, ref: 10 };
/** A sail is heard going aback when its belly as drawn passes ABACK_AT the other way (a square sail aback is 0.3 deep), having been full past ABACK_REARM since. */
export const ABACK_AT = -0.12;
export const ABACK_REARM = 0.2;

/** Two canvas sounds (fill, aback) start at least this far apart, s; one more is put off at most CANVAS_QUEUE, else left out. */
export const CANVAS_GAP = 0.18;
export const CANVAS_QUEUE = 1.2;

// --- Blocks and yards -----------------------------------------------------------------------------------------------

/** A line running through its block: the squeal of the sheave and the rasp of the rope, aloft where the sail's lines lead. */
export const BLOCK_RUN: SlapKind = { id: 'block/run', gain: 0.45, ref: 5 };
/** While a mast's lines run (a sail set, taken in or reefed, its yards braced), a block every so often, s, each its own seeded share off it. */
export const BLOCK_PERIOD = 1.3;
export const BLOCK_SPREAD = 0.35;

/** A yard's parrel grinding round its mast as the yard is braced: a long creak, from the mast at the yards' height. */
export const YARD_CREAK: SlapKind = { id: 'yard/creak', gain: 0.55, ref: 6 };
/** A mast's yards are heard turning above this rate, rad/s (bracing at the sailing model's rate is about 0.15). */
export const YARD_TURNING = 0.01;
/** The creak is loudest at this rate, rad/s, and YARD_LEAST of that just past YARD_TURNING. */
export const YARD_FULL = 0.12;
export const YARD_LEAST = 0.45;
/** A creak every so often while they turn, s, each its own seeded share off it. */
export const YARD_PERIOD = 1.6;
export const YARD_SPREAD = 0.3;
/** How fast the heard rate follows the yards, s (the simulation steps them 30 times a second; frames come between). */
export const TURN_SMOOTH = 0.25;
/** A yard moving more than this in one frame was jumped (the browser checks run the match ahead), rad: not heard. */
export const TURN_JUMP = 0.3;
