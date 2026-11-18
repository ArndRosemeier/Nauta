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

/**
 * The winds a match may be set to (docs/design/menu.md, "Match setup"): the force drawn from the match's seed within
 * each, Beaufort. "As it comes" is the duel's own draw (rules/wind.ts `DUEL_FORCES`).
 */
export const WIND_CHOICES = { light: { least: 2, most: 3 }, fresh: { least: 4, most: 4 }, strong: { least: 5, most: 6 } } as const;
/**
 * How far the wind is turned from square across the line between the ships when one of them holds the weather
 * position at the start (menu.md, "How you meet"), degrees: she has the wind 20° abaft her beam, the other ship 70°
 * off her bow, close-hauled and still able to close (a brig lies about 67° off the wind, rules/sailing.ts).
 */
export const WEATHER_TURN_DEGREES = 20;
