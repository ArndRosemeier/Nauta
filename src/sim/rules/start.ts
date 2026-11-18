/**
 * How a duel starts (design thread, 2026-11-18, "The start" in the implementation plan's N3 design decisions, made "by
 * time, not by distance" with N7.5a; Arnd judges the feel at G3). Pure data, read by sim/start.ts.
 */

/**
 * The ships start as far apart as they close in this many minutes under battle sail in that wind (N7.5a): they open
 * fire about half a minute before they would meet, so the first broadside comes about three minutes in.
 */
export const START_MINUTES = 3.5;
/**
 * How fast the two ships close at the start, m/s together, by the wind's force: both under battle sail, heading at each
 * other with the wind abeam, over the first three minutes (measured in `check:sailing`, which fails when the sailing
 * strays from it): about 1,100 m in three minutes in a light breeze, 1,500 m in a strong one. Light airs are not slow
 * (rules/sailing.ts `LIGHT_AIRS`): in force 2 to 4 she gathers way quickly, so they close faster there than in force 5.
 */
export const START_CLOSING: Readonly<Record<number, number>> = { 2: 6.2, 3: 7.5, 4: 8.8, 5: 7.5, 6: 8.3 };
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
