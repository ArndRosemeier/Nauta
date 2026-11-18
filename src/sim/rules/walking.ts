/**
 * How the captain walks his decks (implementation plan N2.3): his paces, how quickly he answers the thumbs, how he
 * stoops under low beams, how near a door or a ladder he must be to use it, and how quickly a door swings. Pure data.
 * His body's size is the plan's (ships.ts BODY), so the walk graph and the walker agree on where he fits.
 */

/**
 * His paces, m/s: a brisk walk on a working deck (a man walks about 1.4 m/s on level ground; a deck that moves and is
 * full of gear asks a little less), backing away more slowly, stepping aside between the two.
 */
export const WALK_PACE = 1.35;
export const BACK_PACE = 0.7;
export const SIDE_PACE = 0.9;
/** How quickly his pace follows the thumb, 1/s: a quarter of a second to most of it, so the view never jerks. */
export const WALK_GRIP = 6;
/** How far his head keeps under the beams, m, and how quickly he stoops or straightens, 1/s. */
export const HEAD_CLEAR = 0.06;
export const STOOP_RATE = 5;
/** He ducks before a low beam or a door's head: he looks this far ahead, s of his pace. */
export const DUCK_AHEAD = 0.5;
/** His eye, m below the top of his head (a man's eye is about 12 cm under his crown). */
export const EYE_BELOW_TOP = 0.12;

/**
 * A door: how far its leaf swings open, rad (back against its bulkhead, a hand short of it, where there is room
 * there; otherwise a quarter turn), how long a full swing takes, s, how near its middle (m) he must come for it to
 * open, and how far open (share of the swing) before a body passes it. He is never in the leaf's way: within its
 * sweep he waits until it is open, and it stays open while he is that near.
 */
export const DOOR_SWING_BACK = Math.PI * 0.95;
export const DOOR_SWING = Math.PI / 2;
export const DOOR_SWING_SECONDS = 0.7;
export const DOOR_REACH = 1.5;
export const DOOR_PASS = 0.9;

/**
 * A ladder: how near (m) its foot his middle must come (pressed against it: the walk graph keeps his middle about
 * 0.3 m off it), or how near the spot where one stands at its head, and how straight at it he must push (the cosine
 * of the most angle between his way and the ladder's), for him to climb it rather than walk past.
 */
export const LADDER_TOUCH = 0.4;
export const LADDER_REACH = 0.35;
export const LADDER_AIM = 0.7;
/** He climbs only while he goes no faster than this (m/s) the way he pushes: standing, or stopped at it. */
export const LADDER_PRESS = 0.2;

/**
 * Aloft (N3.11). On a top or the crosstrees his middle keeps this far in from the rim and the mast's hole, m (a top
 * has no rail on its sides). Pushed outboard within `RIM_REACH` (m) of where he may stand by the rim, and within
 * `RIM_ALONG` (m) fore or aft of the shrouds there, he gets onto them: up the shrouds over him if he looks up past
 * `LOOK_UP` (rad), down over the rim if not.
 */
export const RIM_KEEP = 0.3;
export const RIM_REACH = 0.15;
export const RIM_ALONG = 0.9;
export const LOOK_UP = 0.35;
/** Onto a mast's shrouds from her deck: his middle within this of the place at their foot by the rail, m. */
export const SHROUD_REACH = 0.6;
/** On a ladder aloft he steps across onto a yard's footrope with his feet within this of its height, m, pushing toward it. */
export const FOOTROPE_REACH = 0.45;
/** On the bowsprit his middle keeps this near the middle of its top, m; he gets off it at either end within this, m. */
export const SPAR_FOOTING = 0.08;
export const SPAR_END_REACH = 0.4;
/** Onto the bowsprit from her deck: his middle within this of the spot beside its heel, m. */
export const BOWSPRIT_REACH = 0.5;
/** On a footrope his body is bent forward over the yard this far, rad (@futuremagic/figure's lean over a yard). */
export const YARD_BEND = 0.75;
