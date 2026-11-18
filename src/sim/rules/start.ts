/**
 * How a duel starts (design thread, 2026-11-18, "The start" in the implementation plan's N3 design decisions; Arnd
 * judges the feel at G3). Pure data, read by sim/start.ts.
 */

/** How far apart the two ships start, m: a long gunshot and more, so the first decision is who works for the wind. */
export const START_APART = 1500;
/**
 * The way each ship has on at the start, knots: under way on a beam reach, closing. Not measured: about what battle
 * sail drives her at in a light breeze, so in a stronger wind she gathers more way in the first minute and in force 2
 * she loses a little.
 */
export const START_WAY = 4;
