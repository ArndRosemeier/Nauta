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
