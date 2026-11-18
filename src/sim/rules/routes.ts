/**
 * How fast a man gets about the ship (N4.2): his pace on each kind of footing, how the heel, a low deckhead, haste and
 * a crowd change it, how men queue on a ladder and stand aside for the captain. Read by the crew's routes
 * (src/sim/crew/). First proposals, reckoned from the plan's sizes and a seaman's usual practice about 1805; Arnd
 * judges the feel at gate G4.
 */

/** The footings a man moves on, each with its own pace. Climbs are reckoned in metres of height, the rest in metres walked. */
export type PaceName =
  | 'walk' | 'aloft' | 'sidle' | 'spar'
  | 'ladderUp' | 'ladderDown' | 'ratlinesUp' | 'ratlinesDown' | 'overhangUp' | 'overhangDown';

/**
 * A man's pace alone, at a walk, on an upright ship, m/s (climbs: m/s of height).
 * - walk: a brisk walk on a clear deck (people walk 1.2 to 1.4 m/s).
 * - aloft: across a top or the crosstrees, a hand on the rigging.
 * - sidle: out along a footrope, both hands on the jackstay, about two shuffles a second.
 * - spar: along the bowsprit holding its manropes, or down onto the jib-boom's horses.
 * - ladder: a ship's ladder of about 65°, steps 0.24 m apart, about two steps a second up and a little faster down.
 * - ratlines: hand over hand up the shrouds, a ratline (0.38 m) a second or a little more.
 * - overhang: out and round the futtock shrouds, hanging back from them: about half the ratlines' pace.
 */
export const PACE: Readonly<Record<PaceName, number>> = {
  walk: 1.3,
  aloft: 0.8,
  sidle: 0.45,
  spar: 0.5,
  ladderUp: 0.5,
  ladderDown: 0.6,
  ratlinesUp: 0.45,
  ratlinesDown: 0.5,
  overhangUp: 0.2,
  overhangDown: 0.22,
};

/** How a man is told to go: at a walk, or smartly (at the run on deck, as when the hands are piped to stations). */
export type Haste = 'walk' | 'smart';

/**
 * Going smartly: each pace times this. A seaman runs a clear deck at about 2.5 m/s; topmen racing aloft go up the
 * ratlines at about 0.75 m/s of height, so the main top (13 m over the deck) takes some 20 s and the topsail yard
 * some 35 s from the deck.
 */
export const SMART: Readonly<Record<PaceName, number>> = {
  walk: 1.9,
  aloft: 1.4,
  sidle: 1.3,
  spar: 1.4,
  ladderUp: 1.5,
  ladderDown: 1.5,
  ratlinesUp: 1.7,
  ratlinesDown: 1.7,
  overhangUp: 1.5,
  overhangDown: 1.5,
};

/**
 * Under a low deckhead a man stoops and goes slower: at the captain's full height he walks upright; just under it he
 * stoops (STOOP of his pace); at the least headroom a body goes through at all (rules/ships.ts BODY, 1.1 m) he
 * crouches (CROUCH). Between them it is taken in a straight line. The berth deck (1.6 m) gives about 0.7.
 */
export const STOOP = 0.8;
export const CROUCH = 0.45;

/** A door: what opening it, stooping through and seeing it shut costs beyond the steps, s. */
export const DOOR_PASS = 1.5;

/**
 * The heel. On deck a man's pace falls with the square of her heel and is near the slowest at HEEL_WALK_HALT (a deck
 * at 20° takes about a third off). A ladder below is held with both hands and slows in proportion to the heel, gone at
 * HEEL_LADDER_HALT. The shrouds on the weather side lean in further as she heels and are climbed nearly as fast; the
 * lee shrouds hang out over the water and go slack, so they slow fast (HEEL_LEE_HALT): seamen go aloft by the weather
 * shrouds. Footropes and the bowsprit go as the weather shrouds. Nobody stops altogether: he holds on and creeps
 * (HEEL_SLOWEST of his pace). Heel in radians.
 */
export const HEEL_WALK_HALT = 0.6;
export const HEEL_LADDER_HALT = 0.8;
export const HEEL_WEATHER_HALT = 0.9;
export const HEEL_LEE_HALT = 0.4;
export const HEEL_SLOWEST = 0.2;

/**
 * A crowd. What a man walking meets is the men within CROWD_RADIUS ahead of him (a half circle, m): up to
 * CROWD_FREE men per m² he keeps his pace; beyond it his pace falls in a straight line to CROWD_SLOWEST at
 * CROWD_JAM men per m², where a crowd stands nearly still (people moving through a crowd, after Fruin).
 */
export const CROWD_RADIUS = 1.5;
export const CROWD_FREE = 0.5;
export const CROWD_JAM = 4;
export const CROWD_SLOWEST = 0.15;

/**
 * Men on a way go one behind another at least WAY_GAP apart along it (m), and only as many side by side as the way is
 * wide (WAY_ABREAST, men): a ladder or a door takes one, the shrouds of a side two (they are five or six shrouds
 * wide), an open join between two spaces three. A single-file way is not entered while a man comes the other way on it.
 */
export const WAY_GAP = 0.45;
export const WAY_ABREAST: Readonly<Record<string, number>> = {
  ladder: 1,
  door: 1,
  open: 3,
  shrouds: 2,
  'topmast shrouds': 1,
  footrope: 1,
  bowsprit: 1,
};

/**
 * The captain. A man walking toward him within ASIDE_RADIUS (m) stops and stands aside ASIDE_STEP (m) off his line,
 * away from the captain, until the captain has passed or moved off, or ASIDE_WAIT s have gone: then he goes on past him,
 * still that far off his line (a captain standing at his post does not hold the whole crew).
 */
export const ASIDE_RADIUS = 1.6;
export const ASIDE_STEP = 0.5;
export const ASIDE_WAIT = 2;

/** A spot a little off the walk graph (a place by a gun or a pin) is still reached: the man walks to the nearest square a body fits within this far, m, and steps the rest. */
export const SNAP_REACH = 0.8;
