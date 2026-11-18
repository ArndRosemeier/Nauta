/**
 * How a fight ends (implementation plan N6.4, design decisions for N6, confirmed 2026-11-18; first proposals, balanced
 * in N7.5). Read by src/sim/end.ts. Pure.
 */
import { AWASH_SECONDS } from './damage';

/**
 * Beaten: a computer captain strikes, a player's first lieutenant says "We must strike, sir", when any one holds: at
 * least `out` of her men killed or badly hurt; she cannot sail (no sail can draw) and fewer than `crews` gun crews on
 * both sides together can fire (a pair's crew at a mounted gun of the pair, at least `FEWEST_AT_GUN` of them there);
 * the water in her over `water` of what founders her and still gaining; or (N7.5a, "a helpless ship is beaten") she
 * cannot sail and faces a ship that can and still has at least `guns` of her guns mounted (the other lies off her bow
 * or stern and rakes her).
 */
export const BEATEN = { out: 0.3, crews: 4, water: 0.95, guns: 1 / 2 } as const;

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

/**
 * Sailing out of the fight (menu.md, "Sailing out of the fight"): past `losing` m apart the master says they are losing
 * her; `gone` m apart for `seconds` s ends the match. The ship that sailed at least `share` of the distance opened
 * since they were last within `losing` has broken off the action and loses; if neither did, both sailed apart and it
 * is drawn.
 */
export const PARTING = { losing: 3000, gone: 4000, seconds: 60, share: 2 / 3 } as const;

/** Striking is asked twice: the first lieutenant answers "Strike, sir?", and the order given again within this many seconds strikes her. */
export const ASK_AGAIN = 10;

/** Seconds from the end of a ship foundered until the sea has her: her deck awash at about 85 s, her eye under at about 90 s, her gone down at about 100 s (checked by test/end.test.ts). */
const SINKING = 105;

/**
 * The end played out (plan N6.7, design decisions for N6: "a quiet moment, then the way back"): after the fight's end the
 * match goes on drawn for this many seconds before the end card, by how it ended, so the ship is seen going down or
 * her colours coming down. One blown up or burnt out takes the sea in from the end and founders `AWASH_SECONDS` later,
 * so goes down that much later than one that foundered; the colours take `COLOURS.after + COLOURS.down` s, and a quiet few
 * seconds follow. First proposals (N7.5).
 */
export const MOMENT = {
  struck: 16, sunk: SINKING, burnt: SINKING + AWASH_SECONDS, 'blew up': SINKING + AWASH_SECONDS, 'broke off': 8, drawn: 6,
} as const;

/** A struck ship's colours (N6.7): the first lieutenant has them hauled down `after` s after she strikes, taking `down` s to come to the deck. */
export const COLOURS = { after: 2, down: 8 } as const;
