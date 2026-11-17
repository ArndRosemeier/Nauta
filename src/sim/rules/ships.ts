/**
 * The brig's measures (docs/design/ship.md): a Cruizer-class brig-sloop of the Royal Navy. Pure data, one place
 * for every size of her, so the plan (N2.1), floating (N2.2), walking (N2.3) and the drawing read the same numbers.
 *
 * **Where they come from.** The lines are taken off the Admiralty draught "18-gun Brig Sloops of the Cruiser/Cruizer
 * design ordered between 1802-1808" (National Maritime Museum, Greenwich, ZAZ4607, 1:48; the body plan, sheer and
 * half-breadth signed by Henslow and Rule, 1 December 1802), from the museum's 1280-pixel image of the sheet: 0.0405 m
 * of ship to a pixel, calibrated on her moulded breadth of 30 ft 0 in. So each reading is good to about 4 cm. The
 * draught gives no scantlings; those are the usual sizes for a sloop of her burthen in the years 1800 to 1815 (Steel,
 * "Elements and Practice of Naval Architecture", 1805), and say so where they stand.
 *
 * **Heights** are metres above her base: the underside of the keel amidships. Positions along her are metres
 * forward of the mainmast. Ship space (src/sim/ship/section.ts) turns both into coordinates.
 */

/**
 * The midship section (the dead flat, ⊗): her moulded half-breadth (to the outside of the frames, m) at heights above
 * the base (m), bottom to top, read off the body plan at every second pixel row and averaged over its after and fore
 * halves (which agree to 2 cm). Her floors rise steeply (a fast brig's deadrise), the bilge is firm, and she is nearly
 * wall-sided from the bilge to the top of her side, with a few centimetres of tumblehome above the deck.
 */
export const MIDSHIP_SECTION: readonly (readonly [height: number, halfBreadth: number])[] = [
  [0.49, 0.16], [0.57, 0.27], [0.73, 0.53], [0.89, 0.84], [1.05, 1.2], [1.22, 1.64], [1.38, 2.12], [1.54, 2.51],
  [1.70, 2.87], [1.86, 3.13], [2.02, 3.32], [2.19, 3.54], [2.35, 3.71], [2.51, 3.85], [2.67, 3.97], [2.83, 4.07],
  [3.00, 4.18], [3.16, 4.25], [3.32, 4.32], [3.48, 4.39], [3.65, 4.43], [3.81, 4.48], [3.97, 4.52], [4.21, 4.55],
  [4.62, 4.57], [5.02, 4.59], [5.43, 4.56], [5.83, 4.52], [6.24, 4.53],
];

/** The keel's half siding below the rabbet, m (the body plan: the keel 13 in wide). */
export const KEEL_HALF_SIDING = 0.165;
/** The depth of the keel and false keel below the rabbet, m (the body plan: 12 px). */
export const KEEL_DEPTH = 0.49;
/** The load waterline amidships, m above the base (the draught's top waterline at the mainmast). */
export const LOAD_WATERLINE = 3.73;
/** The upper (weather) deck's upper side at the side amidships, m above the base (the draught's red deck line). */
export const DECK_AT_SIDE = 5.04;
/** How much higher the deck stands on the centreline than at the side, m (the round of her beams; the draught gives about 0.2). */
export const DECK_CAMBER = 0.18;
/** The top of her side, where the body plan's sections end, m above the base. */
export const TOP_OF_SIDE = 6.24;
/** The top of the rail amidships, m above the base. */
export const RAIL_TOP = 6.52;
/** The main wale: its lower and upper edge, m above the base (the draught's lower edge; two strakes of 9 in above it). */
export const WALE = { lower: 4.41, upper: 4.87 } as const;
/** A gun port of the waist: its sill and its top, m above the base, and its width, m. */
export const PORT = { sill: 5.49, top: 6.26, width: 0.85 } as const;
/** The waist's gun ports, m forward of the mainmast (the draught: 2.92 m apart). */
export const WAIST_PORTS: readonly number[] = [-4.84, -1.9, 0.97];
/** The main channel: its upper side, m above the base; how far it stands out from her side and its thickness, m. */
export const MAIN_CHANNEL = { top: 6.42, width: 0.4, thick: 0.1, aft: -4.35, fore: 0.55 } as const;
/** The main shrouds' deadeyes on the channel, m forward of the mainmast (the draught: six a side). */
export const MAIN_SHROUDS: readonly number[] = [-3.99, -3.21, -2.44, -1.28, -0.57, 0.12];
/** The lower ends of the chain plates, m above the base (the draught: bolted through the wale). */
export const CHAIN_PLATE_FOOT = 4.54;

/** Planking, m (Steel's sizes for a sloop): the bottom and sides, the wales, the weather deck, the berth deck. */
export const PLANKING = { side: 0.076, wale: 0.127, deck: 0.076, berthDeck: 0.064 } as const;
/** The width of a strake of her side and of a plank of her decks, m (7 in deals for the deck, 9 in strakes outside). */
export const STRAKE_WIDTH = 0.23;
export const DECK_PLANK_WIDTH = 0.18;
/** How long one deck plank runs between butts, m (24 ft deals). */
export const DECK_PLANK_LENGTH = 7.3;
/** Her frames, m: how deep they stand inside the outside planking, and the ceiling (inside planking) on them. */
export const FRAME_DEPTH = 0.25;
export const CEILING = 0.064;
/** The weather deck's beams, m: sided (fore and aft), moulded (deep), and how far apart (three to a port). */
export const DECK_BEAM = { sided: 0.25, moulded: 0.23, spacing: 0.973 } as const;
/** The carlings between the beams and the ledges across them, m: sided and moulded. */
export const CARLING = { sided: 0.15, moulded: 0.13 } as const;
/** The waterway along the deck's edge, m: how far in it reaches, and how high it rises over the planking. */
export const WATERWAY = { width: 0.28, rise: 0.11 } as const;
/** The bulwark, m: its timbers (sided, apart), its inside and outside boards, and its rail (width, thickness). */
export const BULWARK = { timber: 0.15, insideBoard: 0.05, outsideBoard: 0.064, railWidth: 0.3, railThick: 0.1 } as const;
/**
 * The pin rail inside the bulwark at the main shrouds, m: its height above the deck (its top, just under the main
 * rail and clear above the ports' tops at 1.22 m), width, thickness, pins apart.
 */
export const PIN_RAIL = { height: 1.32, width: 0.16, thick: 0.08, pitch: 0.32 } as const;

/** Clear height under the weather deck's beams on the berth deck, m (ship.md: about 1.7 m, so men stoop). */
export const BERTH_HEADROOM = 1.7;

/** The main hatch, m: its length (fore and aft), breadth, its middle forward of the mainmast, and its coamings. */
export const MAIN_HATCH = { length: 1.37, breadth: 1.22, at: 1.75, coamingHeight: 0.3, coamingThick: 0.13 } as const;
/** A hatch grating, m: the ledges and battens (wide, deep) and the square holes between them. */
export const GRATING = { bar: 0.038, depth: 0.05, hole: 0.064 } as const;

/** The lower mainmast, m: where its heel stands (above the base), its length, its diameter at the partners and the hounds, its masthead. */
export const MAIN_MAST = { step: 1.1, length: 20, partners: 0.56, hounds: 0.44, head: 2.9 } as const;
/** The main top, m: athwart, fore and aft, its thickness, and the lubber's hole round the masthead. */
export const MAIN_TOP = { breadth: 3.35, length: 2.45, thick: 0.1, hole: 1.15 } as const;

/** Rope diameters, m (from Steel's circumferences): main shrouds 6 in, ratlines 1¼ in, lanyards 3 in, running lines 2 in, breechings 4½ in. */
export const ROPE = { shroud: 0.049, ratline: 0.01, lanyard: 0.024, running: 0.016, breeching: 0.036, tackle: 0.02 } as const;
/** How far apart the ratlines are, m (15 in). */
export const RATLINE_PITCH = 0.38;
/** A deadeye, m: diameter and thickness; the lanyard's length between the two of a shroud. */
export const DEADEYE = { diameter: 0.25, thick: 0.11, apart: 0.7 } as const;
