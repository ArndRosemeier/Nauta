/**
 * How a fight ends (implementation plan N6.4, design decisions for N6, confirmed 2026-11-18; first proposals, balanced
 * in N7.5). Read by src/sim/end.ts. Pure.
 */

/**
 * Beaten: a computer captain strikes, a player's first lieutenant says "We must strike, sir", when any one holds: at
 * least `out` of her men killed or badly hurt; she cannot sail (no sail can draw) and fewer than `crews` gun crews on
 * both sides together can fire (a pair's crew at a mounted gun of the pair, at least `FEWEST_AT_GUN` of them there);
 * the water in her over `water` of what founders her and still gaining.
 */
export const BEATEN = { out: 1 / 2, crews: 4, water: 2 / 3 } as const;

/**
 * Burnt out, lost like a ship sunk: fire holds `spaces` or more spaces below her weather deck at over `size` each, or
 * the space by the magazine (`room`) is wholly alight (`whole`: all but what the men at hand still hold back). The magazine still goes up by its own rule (rules/damage.ts
 * `FIRE.catch`) if the fire reaches it first.
 */
export const BURNT = { spaces: 3, size: 1 / 2, room: 'lightroom', whole: 0.95 } as const;

/** A match is drawn when its time runs out with neither ship lost ("they part at nightfall"): a match setting, minutes. */
export const MATCH_MINUTES = 40;
/** The master warns the captain this many minutes before the light fails. */
export const LIGHT_WARNING_MINUTES = 5;

/** Striking is asked twice: the first lieutenant answers "Strike, sir?", and the order given again within this many seconds strikes her. */
export const ASK_AGAIN = 10;
