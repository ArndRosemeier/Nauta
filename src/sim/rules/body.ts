/**
 * The captain's body on a moving deck (implementation plan N2.7): how he leans against her roll, how quickly he
 * catches himself, how his feet step to keep him up, how his walk bobs, when he takes hold of a rail, and how far the calm view stills all of it. Pure data; his size is the plan's (ships.ts BODY).
 *
 * Tilts are small angles as tangents: a body axis (tx, 1, tz) normalised, in ship space (x across, z aft).
 */

/**
 * How much of the way to the felt vertical (gravity less the deck's own acceleration under his feet) his body leans,
 * standing free: a man on a rolling deck keeps nearly upright, his ankles and knees taking the rest of her tilt.
 * Holding a rail he goes more with her.
 */
export const LEAN_SHARE = 0.7;
export const HOLD_LEAN_SHARE = 0.45;
/**
 * How quickly he finds his balance again: the lean's natural frequency (rad/s, about 0.7 Hz: a man catching himself
 * on a moving floor takes most of a second) and its damping (under 1, so a sudden roll throws him a little past
 * upright before he settles). Holding on he is stiffer and steadier.
 */
export const LEAN_RATE = 4.4;
export const LEAN_DAMPING = 0.6;
export const HOLD_LEAN_RATE = 6.5;
export const HOLD_LEAN_DAMPING = 0.9;
/** The most he leans off her deck's square, as a tangent (about 20°). */
export const MOST_LEAN = 0.36;

/** His legs: the hip's height over the soles standing easy, as a share of his height, and the leg's full reach over that, m. */
export const HIP_SHARE = 0.53;
export const LEG_SLACK = 0.035;
/** The most his hips sink for his feet's reach, m: further, his heel lifts and the foot comes off the deck instead. */
export const MOST_DIP = 0.06;
/** How quickly the hips follow the height the feet allow, 1/s: fast, but never a jerk. */
export const HIP_RATE = 14;
/**
 * His feet: half the width of his stance standing easy (m, each foot off his middle), and how much wider it grows in a
 * seaway (per rad of the felt tilt's swing: a sailor stands with his feet apart).
 */
export const STANCE_HALF = 0.13;
export const STANCE_WIDEN = 3;
/**
 * His walk: steps a second standing (the slowest shuffle) and how many more per m/s of pace (about 1.9 a second at
 * his brisk 1.35 m/s, a man's usual cadence), and the share of each foot's cycle it is in the air.
 */
export const CADENCE = 1.0;
export const CADENCE_PER_PACE = 0.65;
export const SWING_SHARE = 0.45;
/** A pace below this is standing, m/s. */
export const STANDING_PACE = 0.05;
/** Standing, a foot steps when it is this far from where it should be, m; a step lifts the foot this high, m. */
export const STEP_TRIGGER = 0.08;
export const STEP_LIFT = 0.07;
/** A step standing takes this long, s; the quickest is a foot thrown out to catch a fall. */
export const STEP_SECONDS = 0.34;
export const STEP_QUICKEST = 0.18;
/** Starting or stopping a walk leans him into it: this share of his own push is felt (he leans a few degrees, not as far as the push alone would throw him). */
export const WALK_LEAN = 0.12;
/** Where his weight is over his soles, m (a man's centre of mass, a little over the hips): a lean off the felt vertical puts it this far times the lean off his feet. */
export const WEIGHT_HEIGHT = 1.0;
/** When a foot lands, this much of his swing toward a fall is caught (share of the lean's rate kept). */
export const CATCH_KEEP = 0.55;

/** Stooping under beams bends him forward: his eye comes this far forward per metre he stoops, m/m. */
export const STOOP_FORWARD = 0.35;
/** His body turns to where he looks at this rate, 1/s; past this much of a turn (rad) his feet step round with it. */
export const TURN_RATE = 5;

/**
 * Taking hold: how hard the sea is (the felt tilt off her deck's square, its swing measured over `SWING_SECONDS`, rad)
 * before he takes hold of a rail or a beam within reach, and how calm before he lets go again; and how fast he may be
 * walking and still hold (along a rail, his hand sliding on it), m/s.
 */
export const SWING_SECONDS = 4;
export const HOLD_ON = 0.09;
export const HOLD_OFF = 0.06;
export const HOLD_PACE = 0.5;
/**
 * His reach for a hold: the shoulders' height over his soles (share of his height), how far a hand reaches from the
 * middle of his chest at that height (m: an arm of about 0.65 m from a shoulder 0.2 m off his middle, not quite
 * straight), and the lowest and highest hold over the floor he takes (a rail at the hip, a beam just over his head).
 */
export const SHOULDER_SHARE = 0.82;
export const ARM_REACH = 0.8;
export const HOLD_LOWEST = 0.75;
export const HOLD_HIGHEST = 2.05;

/** A blow (a shot striking near, N5): its push on his lean per unit of strength, tangent per second. */
export const JOLT_PUSH = 1.6;

/**
 * The calm view (one setting, plan N2.7): how much of his body's motion the view takes, from all of it (1) down to
 * nearly still (`CALM_LEAST`); the steps the setting offers, and the one a new player starts with.
 */
export const CALM_LEAST = 0.1;
export const MOTION_STEPS = [1, 0.5, CALM_LEAST] as const;
export const MOTION_START = 1;
/** On or off a ladder, the body's own lean and steps fade in and out of the eye over about this rate, 1/s. */
export const LADDER_BLEND_RATE = 4;
