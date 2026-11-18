/**
 * How the brig is finished (ship.md, "Looks, British"): her paint and the tints of her bare timber, as the solid
 * kinds read them (solid.ts Finish). Colours are linear RGB, chosen by eye as sRGB and converted (sRGB 0.80 is
 * linear 0.60), so they stay true under the light rig's physical albedos.
 */
import type { Finish } from './solid';
import { BULWARK, DECK_PLANK_WIDTH, STRAKE_WIDTH } from '../../sim/rules/ships';

/** Black paint (lamp black in oil): her sides above the copper, the rail, the channels, the port lids outside. */
export const BLACK: Finish = { rgb: [0.016, 0.016, 0.018], paint: 1 };
/** The yellow ochre band along her ports (sRGB 0.74, 0.56, 0.26). */
export const OCHRE: Finish = { rgb: [0.51, 0.27, 0.055], paint: 1 };
/** Red ochre inside the bulwarks, the port linings and the inside of the lids (sRGB 0.55, 0.22, 0.15). */
export const RED: Finish = { rgb: [0.26, 0.04, 0.02], paint: 1 };
/** The inside of her bulwarks, her stern and the faces of her breaks: red, boarded as wide as her rail. */
export const BULWARK_BOARDS: Finish = { ...RED, plank: BULWARK.railWidth };
/** Whitewash and buff on the bulkheads below, darkened by the smoke of lanterns and the galley (sRGB 0.62, 0.58, 0.5). */
export const BUFF: Finish = { rgb: [0.34, 0.3, 0.21], paint: 1 };
/** Tarred canvas and tar (the mast coat). */
export const TAR: Finish = { rgb: [0.02, 0.016, 0.011], paint: 1 };

/** Tints of bare timber over the grain's own pale colour. */
const PINE_TINT = [1, 0.96, 0.9] as const;
const OAK_TINT = [0.66, 0.53, 0.4] as const;
const MAST_TINT = [0.95, 0.78, 0.5] as const;
const OLD_PINE_TINT = [0.62, 0.52, 0.4] as const;

/** The weather deck: scrubbed pale pine planks (holystoned). */
export const DECK: Finish = { rgb: PINE_TINT, paint: 0, plank: DECK_PLANK_WIDTH };
/** The berth deck: pine never holystoned, darker with use. */
export const BERTH_DECK: Finish = { rgb: OLD_PINE_TINT, paint: 0, plank: DECK_PLANK_WIDTH };
/** The deck seen from below: the planks' undersides. */
export const DECK_BELOW: Finish = { rgb: OLD_PINE_TINT, paint: 0, plank: DECK_PLANK_WIDTH };
/** Her side's planking: the strakes under the paint. */
export const SIDE_PLANKS = (f: Finish): Finish => ({ ...f, plank: STRAKE_WIDTH });
/** Oak: beams, knees, coamings, waterways, the ceiling inside her. */
export const OAK: Finish = { rgb: OAK_TINT, paint: 0 };
/** The masts: oiled pine. */
export const MAST: Finish = { rgb: MAST_TINT, paint: 0 };
/** Iron is coloured by the fittings pack or by these: black-leaded iron and its bolts. */
export const IRON: Finish = { rgb: [0.03, 0.03, 0.032], paint: 1 };
/** Glass: the skylight's and the stern windows', dark against the lit wood. */
export const GLASS: Finish = { rgb: [0.012, 0.016, 0.018], paint: 1 };
/** Copper sheathing below the waterline (its plates are drawn by the copper kind). */
export const COPPER: Finish = { rgb: [0.55, 0.3, 0.17], paint: 1 };
