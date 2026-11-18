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
/** The depth of the keel and false keel below the rabbet, m (the sheer plan, N2.1; the body plan's 12 px read 0.49). */
export const KEEL_DEPTH = 0.39;
/**
 * The load waterline at the dead flat, m above the base: ship space's level (y = 0). The draught draws the load
 * waterline sloping, 1.1 m deeper aft (DESIGN_WATERLINE); at the mainmast it stands at 3.99.
 */
export const LOAD_WATERLINE = 3.73;
/** The upper (weather) deck's upper side at the side at the dead flat, m above the base (the draught's red deck line); the sheer is in PROFILE. */
export const DECK_AT_SIDE = 5.04;
/** How much higher the deck stands on the centreline than at the side, m (the round of her beams; the draught gives about 0.2). */
export const DECK_CAMBER = 0.18;
/** The top of her side at the dead flat, where the body plan's sections end, m above the base. */
export const TOP_OF_SIDE = 6.24;
/** The top of the rail amidships, m above the base. */
export const RAIL_TOP = 6.52;
/** The main wale: its lower and upper edge, m above the base (the draught's lower edge; two strakes of 9 in above it). */
export const WALE = { lower: 4.41, upper: 4.87 } as const;
/** A gun port of the waist: its sill and its top, m above the base, and its width, m. */
export const PORT = { sill: 5.49, top: 6.26, width: 0.85 } as const;
/**
 * Her gun ports, the same each side, aft to fore (the sheer plan, N2.1): [mark, middle (m forward of the mainmast),
 * sill, top (m above the base), width (m)]. Ten a side, about 2.92 m apart; J is the narrow chase port in her bow.
 */
export const PORTS: readonly (readonly [mark: string, along: number, sill: number, top: number, width: number])[] = [
  ['A', -7.93, 6.05, 6.84, 0.83], ['B', -5.01, 5.88, 6.64, 0.83], ['C', -2.07, 5.67, 6.46, 0.81], ['D', 0.82, 5.48, 6.27, 0.8],
  ['E', 3.73, 5.39, 6.17, 0.82], ['F', 6.74, 5.28, 6.05, 0.85], ['G', 9.67, 5.21, 5.97, 0.8], ['H', 12.56, 5.14, 5.93, 0.83],
  ['I', 15.43, 5.16, 5.9, 0.9], ['J', 18.08, 5.15, 5.86, 0.64],
];
/** The waist's gun ports, m forward of the mainmast: B, C and D. */
export const WAIST_PORTS: readonly number[] = [PORTS[1]![1], PORTS[2]![1], PORTS[3]![1]];
/** The main channel: its upper side, m above the base; how far it stands out from her side and its thickness, m. */
export const MAIN_CHANNEL = { top: 6.42, width: 0.4, thick: 0.1, aft: -4.6, fore: 0.3 } as const;
/** The main shrouds' deadeyes on the channel, m forward of the mainmast (the draught: six a side, N2.1's reading from the mast's middle). */
export const MAIN_SHROUDS: readonly number[] = [-4.32, -3.51, -2.78, -1.44, -0.75, -0.06];
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

/** Clear height under the weather deck's beams on the berth deck, m (the inboard profile, N2.1: 1.6 m; men stoop). */
export const BERTH_HEADROOM = 1.6;

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

// ---------------------------------------------------------------------------------------------------------------
// The whole hull (N2.1): the table of offsets, taken off the same draught (ZAZ4607, the 1280-pixel image at 0.0405 m a
// pixel) on Arnd's computer, where the museum's pages load. Heights share the base above; places along her are
// measured from the mainmast's middle (the midship section was read at the dead flat, ⊗, 5.91 m forward of it).
// The draught's own scale bar reads 0.4 % shorter; the numbers keep the 0.0405 m of the midship section so the
// two agree. Readings are good to about 4 cm amidships and 10 cm at the ends, where the paper is torn at the stem.
// ---------------------------------------------------------------------------------------------------------------

/** A station of the body plan: its mark, its place (m forward of the mainmast), where it rises off the keel (m above the base), and its half-breadths [height, half-breadth] (m). */
export interface BodyStation {
  readonly name: string;
  readonly along: number;
  readonly rising: number;
  readonly offsets: readonly (readonly [height: number, halfBreadth: number])[];
}

/**
 * Her profile, every metre of the sheer plan: [m forward of the mainmast, keel's underside, rabbet, weather deck at
 * side, top of side], m above the base. The keel runs level along her base from the sternpost's heel (-8.98) to the
 * forefoot (17.92); she draws more aft because her load waterline is drawn sloping (DESIGN_WATERLINE). Aft of -10
 * the deck is carried on at the sheer's rise; the top of her side ends at the taffrail.
 */
export const PROFILE: readonly (readonly [along: number, keel: number, rabbet: number, deck: number, top: number])[] = [
  [-12.54, 0, 0.39, 6.05, 7.71], [-12.0, 0, 0.39, 6.02, 7.5], [-11.0, 0, 0.39, 5.96, 7.3], [-10.0, 0, 0.39, 5.9, 7.23], [-9.0, 0, 0.39, 5.84, 7.15], [-8.0, 0, 0.39, 5.77, 7.07], [-7.0, 0, 0.39, 5.71, 6.99], [-6.0, 0, 0.39, 5.65, 6.92], [-5.0, 0, 0.39, 5.59, 6.84], [-4.0, 0, 0.39, 5.53, 6.77], [-3.0, 0, 0.39, 5.47, 6.71], [-2.0, 0, 0.39, 5.42, 6.65], [-1.0, 0, 0.39, 5.36, 6.59], [0, 0, 0.39, 5.31, 6.54], [1, 0, 0.39, 5.26, 6.49], [2, 0, 0.39, 5.22, 6.44], [3, 0, 0.39, 5.17, 6.39], [4, 0, 0.39, 5.13, 6.35], [5, 0, 0.39, 5.09, 6.31], [6, 0, 0.39, 5.05, 6.27], [7, 0, 0.39, 5.02, 6.24], [8, 0, 0.39, 4.99, 6.21], [9, 0, 0.39, 4.96, 6.19], [10, 0, 0.39, 4.93, 6.18], [11, 0, 0.39, 4.91, 6.17], [12, 0, 0.39, 4.89, 6.17], [13, 0, 0.39, 4.87, 6.18], [14, 0, 0.39, 4.85, 6.19], [15, 0, 0.39, 4.84, 6.22], [16, 0, 0.39, 4.83, 6.25], [17, 0, 0.39, 4.82, 6.29], [18, 0, 0.39, 4.81, 6.32], [19, 0, 0.39, 4.8, 6.36], [20.35, 0, 0.39, 4.8, 6.4],
];
/** The load waterline as the draught draws it: straight, from the after perpendicular (m forward of the mainmast, m above the base) to the fore one. */
export const DESIGN_WATERLINE = { aft: [-10.76, 4.42], fore: [19.88, 3.30] } as const;
/** The stem's outer face: [height above the base, m forward of the mainmast], from the rabbet up to the head (above 2 m the paper is torn; read off the rabbet line, 0.33 m inside it). */
export const STEM: readonly (readonly [height: number, along: number])[] = [
  [0.39, 18.55], [1.0, 19.04], [1.5, 19.31], [2.0, 19.5], [2.5, 19.7], [3.0, 19.86], [3.5, 19.98], [4.0, 20.08], [4.5, 20.16],
  [5.0, 20.22], [6.4, 20.35],
];
/** Her after end: [height above the base, m forward of the mainmast], the sternpost's after face up to the wing transom, then the counter up to the taffrail. */
export const STERN: readonly (readonly [height: number, along: number])[] = [
  [0.39, -9.15], [1.0, -9.39], [1.5, -9.58], [2.0, -9.76], [2.5, -9.94], [3.0, -10.12], [3.5, -10.3], [4.0, -10.48],
  [4.5, -10.65], [5.0, -10.84], [5.5, -11.01], [5.76, -11.1], [6.0, -11.47], [6.25, -11.97], [6.5, -12.08], [6.75, -12.16],
  [7.0, -12.25], [7.25, -12.34], [7.5, -12.45], [7.71, -12.54],
];
/** The square stern: the wing transom's height (m above the base), and the stern's half-breadth [height, half-breadth] from it to the taffrail (the body plan's stern board), m. */
export const TRANSOM = {
  wing: 5.76,
  outline: [[5.76, 2.85], [6.0, 2.85], [6.25, 2.83], [6.5, 2.77], [6.75, 2.71], [7.0, 2.67], [7.25, 2.63], [7.5, 2.6], [7.71, 2.53]],
} as const;
/**
 * Her stern board as the body plan draws it, seen from aft: the moulding across it where the counter meets the
 * upright stern (m above the base), and the two square stern ports above the deck: their middles either side of the
 * middle line, sill and top (m above the base) and width, m.
 */
export const STERN_BOARD = { moulding: 6.25, ports: { across: 1.2, sill: 6.6, top: 7.28, width: 0.66 } } as const;
/**
 * Her rudder (the draught's sheer plan): hung by its pintles on the sternpost's after face from the heel up, its
 * breadth fore and aft [height above the base, m] narrowing to the head, which runs up under her counter; the head's
 * fore and after edges end at these heights (m above the base), inside the counter. Its thickness at the fore edge
 * (the sternpost's siding) and the after edge, m, and the heights of its pintles' straps, m above the base.
 */
export const RUDDER_BLADE = {
  breadth: [[0.05, 1.15], [4.9, 0.75], [5.3, 0.42]],
  head: { fore: 5.85, aft: 6.1 },
  thick: { fore: 2 * KEEL_HALF_SIDING, aft: 0.2 },
  pintles: [0.7, 1.7, 2.7, 3.7, 4.7],
} as const;
/**
 * The body plan's stations, aft to fore, about 1.45 m apart (the marks are illegible at this size; aft numbered,
 * forward lettered, as English draughts are). Each station's half-breadths come from the four waterlines of the
 * half-breadth plan at their heights, the station's top, and the dead flat's shape between them (it matches the
 * body plan's own lines within 4 cm). The dead flat is the midship section itself.
 */
export const BODY_STATIONS: readonly BodyStation[] = [
  { name: '10', along: -8.61, rising: 2.2, offsets: [[2.5, 0.21], [3.0, 0.39], [3.5, 0.69], [4.0, 1.45], [4.5, 2.27], [5.0, 2.94], [5.5, 3.35], [6.0, 3.36], [7.12, 3.29]] },
  { name: '9', along: -7.17, rising: 1.4, offsets: [[1.5, 0.23], [1.75, 0.25], [2.0, 0.29], [2.5, 0.54], [3.0, 0.98], [3.5, 1.66], [4.0, 2.53], [4.5, 3.11], [5.0, 3.48], [5.5, 3.64], [6.0, 3.63], [7.01, 3.56]] },
  { name: '8', along: -5.69, rising: 0.8, offsets: [[1.0, 0.25], [1.25, 0.32], [1.5, 0.41], [1.75, 0.46], [2.0, 0.58], [2.5, 1.03], [3.0, 1.73], [3.5, 2.53], [4.0, 3.24], [4.5, 3.6], [5.0, 3.81], [5.5, 3.87], [6.0, 3.85], [6.89, 3.79]] },
  { name: '7', along: -4.26, rising: 0.39, offsets: [[0.6, 0.17], [0.8, 0.25], [1.0, 0.33], [1.25, 0.47], [1.5, 0.61], [1.75, 0.72], [2.0, 0.95], [2.5, 1.62], [3.0, 2.43], [3.5, 3.15], [4.0, 3.68], [4.5, 3.91], [5.0, 4.04], [5.5, 4.06], [6.0, 4.04], [6.79, 3.98]] },
  { name: '6', along: -2.8, rising: 0.39, offsets: [[0.6, 0.18], [0.8, 0.3], [1.0, 0.43], [1.25, 0.64], [1.5, 0.86], [1.75, 1.05], [2.0, 1.41], [2.5, 2.25], [3.0, 3.02], [3.5, 3.59], [4.0, 3.96], [4.5, 4.12], [5.0, 4.21], [5.5, 4.21], [6.0, 4.19], [6.7, 4.14]] },
  { name: '5', along: -1.34, rising: 0.39, offsets: [[0.6, 0.2], [0.8, 0.36], [1.0, 0.55], [1.25, 0.83], [1.5, 1.13], [1.75, 1.45], [2.0, 1.9], [2.5, 2.76], [3.0, 3.45], [3.5, 3.89], [4.0, 4.16], [4.5, 4.27], [5.0, 4.32], [5.5, 4.32], [6.0, 4.29], [6.61, 4.24]] },
  { name: '4', along: 0.1, rising: 0.39, offsets: [[0.6, 0.22], [0.8, 0.43], [1.0, 0.67], [1.25, 1.04], [1.5, 1.43], [1.75, 1.86], [2.0, 2.35], [2.5, 3.16], [3.0, 3.72], [3.5, 4.08], [4.0, 4.28], [4.5, 4.37], [5.0, 4.4], [5.5, 4.39], [6.0, 4.36], [6.53, 4.32]] },
  { name: '3', along: 1.53, rising: 0.39, offsets: [[0.6, 0.24], [0.8, 0.5], [1.0, 0.8], [1.25, 1.25], [1.5, 1.75], [1.75, 2.26], [2.0, 2.75], [2.5, 3.46], [3.0, 3.92], [3.5, 4.22], [4.0, 4.38], [4.5, 4.45], [5.0, 4.48], [5.5, 4.46], [6.0, 4.43], [6.46, 4.4]] },
  { name: '2', along: 2.99, rising: 0.39, offsets: [[0.6, 0.25], [0.8, 0.55], [1.0, 0.9], [1.25, 1.43], [1.5, 2.01], [1.75, 2.54], [2.0, 3.01], [2.5, 3.63], [3.0, 4.02], [3.5, 4.31], [4.0, 4.45], [4.5, 4.51], [5.0, 4.52], [5.5, 4.5], [6.0, 4.47], [6.39, 4.44]] },
  { name: '1', along: 4.43, rising: 0.39, offsets: [[0.6, 0.27], [0.8, 0.62], [1.0, 1.02], [1.25, 1.64], [1.5, 2.25], [1.75, 2.76], [2.0, 3.19], [2.5, 3.74], [3.0, 4.09], [3.5, 4.36], [4.0, 4.49], [4.5, 4.55], [5.0, 4.56], [5.5, 4.54], [6.0, 4.5], [6.33, 4.48]] },
  { name: '⊗', along: 5.91, rising: 0.39, offsets: MIDSHIP_SECTION },
  { name: 'A', along: 7.16, rising: 0.39, offsets: [[0.6, 0.28], [0.8, 0.66], [1.0, 1.11], [1.25, 1.78], [1.5, 2.37], [1.75, 2.9], [2.0, 3.33], [2.5, 3.83], [3.0, 4.15], [3.5, 4.41], [4.0, 4.52], [4.5, 4.58], [5.0, 4.59], [5.5, 4.56], [6.0, 4.53], [6.24, 4.51]] },
  { name: 'B', along: 8.6, rising: 0.39, offsets: [[0.6, 0.28], [0.8, 0.65], [1.0, 1.09], [1.25, 1.74], [1.5, 2.34], [1.75, 2.89], [2.0, 3.32], [2.5, 3.84], [3.0, 4.17], [3.5, 4.41], [4.0, 4.51], [4.5, 4.56], [5.0, 4.56], [5.5, 4.54], [6.0, 4.5], [6.2, 4.49]] },
  { name: 'C', along: 10.06, rising: 0.39, offsets: [[0.6, 0.27], [0.8, 0.63], [1.0, 1.04], [1.25, 1.65], [1.5, 2.25], [1.75, 2.8], [2.0, 3.22], [2.5, 3.77], [3.0, 4.11], [3.5, 4.35], [4.0, 4.45], [4.5, 4.52], [5.0, 4.52], [5.5, 4.49], [6.0, 4.45], [6.18, 4.44]] },
  { name: 'D', along: 11.5, rising: 0.39, offsets: [[0.6, 0.26], [0.8, 0.58], [1.0, 0.95], [1.25, 1.49], [1.5, 2.07], [1.75, 2.6], [2.0, 3.02], [2.5, 3.61], [3.0, 4.0], [3.5, 4.26], [4.0, 4.37], [4.5, 4.44], [5.0, 4.44], [5.5, 4.41], [6.0, 4.38], [6.17, 4.37]] },
  { name: 'E', along: 12.94, rising: 0.39, offsets: [[0.6, 0.24], [0.8, 0.5], [1.0, 0.8], [1.25, 1.27], [1.5, 1.8], [1.75, 2.31], [2.0, 2.71], [2.5, 3.35], [3.0, 3.79], [3.5, 4.08], [4.0, 4.23], [4.5, 4.31], [5.0, 4.32], [5.5, 4.29], [6.0, 4.25], [6.18, 4.24]] },
  { name: 'F', along: 14.39, rising: 0.39, offsets: [[0.6, 0.21], [0.8, 0.41], [1.0, 0.63], [1.25, 1.01], [1.5, 1.46], [1.75, 1.9], [2.0, 2.28], [2.5, 2.94], [3.0, 3.43], [3.5, 3.75], [4.0, 3.95], [4.5, 4.08], [5.0, 4.09], [5.5, 4.06], [6.0, 4.03], [6.2, 4.02]] },
  { name: 'G', along: 15.81, rising: 0.39, offsets: [[0.6, 0.18], [0.8, 0.28], [1.0, 0.4], [1.25, 0.67], [1.5, 1.03], [1.75, 1.4], [2.0, 1.73], [2.5, 2.36], [3.0, 2.87], [3.5, 3.24], [4.0, 3.52], [4.5, 3.72], [5.0, 3.75], [5.5, 3.72], [6.0, 3.69], [6.24, 3.67]] },
  // Forward of G the draught draws only cant frames: two stations made from G's shape and the half-breadth plan's waterline and top breadth.
  { name: 'G+', along: 17.0, rising: 0.9, offsets: [[1.0, 0.18], [1.25, 0.33], [1.5, 0.55], [1.75, 0.81], [2.0, 1.07], [2.5, 1.61], [3.0, 2.13], [3.5, 2.59], [4.0, 2.92], [4.5, 3.21], [5.0, 3.32], [5.5, 3.3], [6.0, 3.28], [6.3, 3.27]] },
  { name: 'G++', along: 18.3, rising: 1.6, offsets: [[1.75, 0.23], [2.0, 0.31], [2.5, 0.62], [3.0, 0.95], [3.5, 1.32], [4.0, 1.8], [4.5, 2.21], [5.0, 2.57], [5.5, 2.59], [6.0, 2.62], [6.3, 2.63]] },
];
/** The half-breadth plan's lines, a check on the fair surface: [m forward of the mainmast, the load waterline's half-breadth, the top-breadth line's], m. */
export const HALF_BREADTH_PLAN: readonly (readonly [along: number, waterline: number, topBreadth: number])[] = [
  [-10, 0.68, 3.08], [-9, 1.75, 3.29], [-8, 2.49, 3.49], [-7, 2.99, 3.67], [-6, 3.35, 3.83], [-5, 3.62, 3.97], [-4, 3.81, 4.09], [-3, 3.98, 4.2], [-2, 4.1, 4.28], [-1, 4.19, 4.35], [0, 4.28, 4.4], [1, 4.34, 4.45], [2, 4.38, 4.49], [3, 4.43, 4.52], [4, 4.44, 4.56], [5, 4.45, 4.57], [6, 4.47, 4.59], [7, 4.47, 4.6], [8, 4.45, 4.59], [9, 4.44, 4.56], [10, 4.38, 4.53], [11, 4.33, 4.48], [12, 4.22, 4.41], [13, 4.09, 4.32], [14, 3.86, 4.17], [15, 3.53, 3.97], [16, 3.1, 3.69], [17, 2.52, 3.31], [18, 1.68, 2.73],
];

// ---------------------------------------------------------------------------------------------------------------
// Her plan (N2.1): levels, spaces, openings, fittings in the way, the guns, stations and the body she is sized for.
// Places are m forward of the mainmast (`along`) and m from the centreline, + to starboard (`across`).
// ---------------------------------------------------------------------------------------------------------------

/**
 * The body every space is sized for (ship.md, "Sized for a real body"): the captain and a grown seaman. Height
 * standing, m; breadth across the shoulders and elbows, m; the lowest overhead he still walks under, stooping, m; the
 * highest step taken without climbing, m. The magazine and the hold are about 1.2 m under the beams: men worked
 * there crouching, as the captain does.
 */
export const BODY = { height: 1.78, breadth: 0.5, leastHeadroom: 1.1, stepUp: 0.45 } as const;
/** The least clear width of a way a body walks along, m: its breadth and a hand's room either side. */
export const LEAST_PASSAGE = 0.6;
/** A door: its clear width and height, m (a sloop's cabin doors, low enough that a tall man ducks). */
export const DOOR = { width: 0.66, height: 1.5 } as const;
/** The least clear opening of a hatch or scuttle a body goes through, m each way. */
export const LEAST_HATCH = 0.6;
/** A ladder: its width, the rise between its steps, the most rise a step may have, and its slope from the level, rad (about 65°). */
export const LADDER = { width: 0.6, rise: 0.25, mostRise: 0.3, slope: 1.13 } as const;
/** How far from a door or a ladder's end a body stands to use it, m. */
export const WAY_STANDOFF = 0.45;

/** The berth deck's beams, m moulded (deep); its planking is PLANKING.berthDeck. */
export const BERTH_BEAM = 0.2;
/**
 * The floors below the berth deck, m above the base (the inboard profile, ZAZ4587): the hold's walking floor (the
 * dunnage laid over the casks' ground tier; the ceiling itself is at 1.25 amidships, too narrow to stand on), the
 * spirit room's, the light room's and the magazine's platform (2.17 aft to 1.96 forward on the profile).
 */
export const HOLD_FLOOR = 1.7;
export const SPIRIT_ROOM_FLOOR = 1.85;
export const LIGHT_ROOM_FLOOR = 2.0;
export const MAGAZINE_FLOOR = 2.1;
/** The bread room's raised floor on the berth deck aft, m above the base (kept dry above the deck). */
export const BREAD_ROOM_FLOOR = 4.0;

/** A level of her: the weather deck, the berth deck (parallel to it, BERTH_HEADROOM under its beams), or the hold. */
export type Level = 'weather' | 'berth' | 'hold';

/** A space of her plan: a room or a deck with its floor, an oblong in plan clipped by her sides. */
export interface SpaceRow {
  readonly id: string;
  readonly name: string;
  readonly level: Level;
  readonly aft: number;
  readonly fore: number;
  /** Its extent across, m from the centreline (+ starboard); absent: side to side. */
  readonly across?: readonly [number, number];
  /** A flat floor's height above the base; absent: the floor is its level's deck. */
  readonly floor?: number;
  readonly use: string;
}

/** The officers' passage and the middle of the berth deck between the cabins, m either side of the centreline. */
const PASSAGE = 1.1;
const MIDSHIPS = 1.3;
/** Out past her side, m: a space reaching to her side is clipped by it. */
const SIDE = 5;

/**
 * Her spaces, from the inboard profile (ZAZ4587) and the lower deck plan (ZAZ4588) of the Cruizer brigs of 1812-15,
 * which fit the 1802 draught within 0.1 m. The captain's cabin, the officers' cabins and the men's messes are all on
 * the berth deck; the brig has no gunroom. The cabins' depth across her is not drawn: they reach from her side to
 * the passage.
 */
export const SPACES: readonly SpaceRow[] = [
  { id: 'deck', name: 'weather deck', level: 'weather', aft: -12.6, fore: 20.4, use: 'the fight: guns, wheel, capstan, sail handling' },
  { id: 'breadroom', name: 'bread room', level: 'berth', aft: -10.48, fore: -8.23, floor: BREAD_ROOM_FLOOR, use: 'biscuit in bins' },
  { id: 'cabin', name: "captain's cabin", level: 'berth', aft: -8.23, fore: -5.85, use: "the captain's cabin, under the companion" },
  { id: 'passage', name: "officers' passage and mates' berth", level: 'berth', aft: -5.85, fore: 0.8, across: [-PASSAGE, PASSAGE], use: "the way between the officers' cabins; the master's mates and midshipmen mess at its fore end" },
  { id: 'master', name: "master's cabin", level: 'berth', aft: -5.85, fore: -3.83, across: [-SIDE, -PASSAGE], use: 'an officer sleeps' },
  { id: 'surgeon', name: "surgeon's cabin", level: 'berth', aft: -3.83, fore: -1.46, across: [-SIDE, -PASSAGE], use: 'an officer sleeps' },
  { id: 'purser', name: "purser's cabin", level: 'berth', aft: -1.46, fore: 0.8, across: [-SIDE, -PASSAGE], use: 'an officer sleeps' },
  { id: 'lieutenant', name: "first lieutenant's cabin", level: 'berth', aft: -5.85, fore: -3.69, across: [PASSAGE, SIDE], use: 'an officer sleeps' },
  { id: 'second', name: "second lieutenant's cabin", level: 'berth', aft: -3.69, fore: -1.46, across: [PASSAGE, SIDE], use: 'an officer sleeps' },
  { id: 'gunner', name: "gunner's cabin", level: 'berth', aft: -1.46, fore: 0.8, across: [PASSAGE, SIDE], use: 'an officer sleeps' },
  { id: 'boatswain', name: "boatswain's cabin", level: 'berth', aft: 0.8, fore: 2.53, across: [-SIDE, -MIDSHIPS], use: 'a warrant officer sleeps' },
  { id: 'carpenter', name: "carpenter's cabin", level: 'berth', aft: 0.8, fore: 2.53, across: [MIDSHIPS, SIDE], use: 'a warrant officer sleeps' },
  { id: 'steward', name: "captain's steward's cabin", level: 'berth', aft: 2.53, fore: 4.27, across: [-SIDE, -MIDSHIPS], use: 'the steward sleeps' },
  { id: 'pilot', name: "pilot's cabin", level: 'berth', aft: 2.53, fore: 4.27, across: [MIDSHIPS, SIDE], use: 'the pilot sleeps' },
  { id: 'cockpit', name: 'cockpit', level: 'berth', aft: 4.27, fore: 6.29, across: [-SIDE, -MIDSHIPS], use: "the midshipmen's berth; the surgeon's station in action" },
  { id: 'stewards-room', name: "steward's room", level: 'berth', aft: 4.27, fore: 6.29, across: [MIDSHIPS, SIDE], use: "the purser's steward issues provisions" },
  { id: 'midships', name: 'main hatchway', level: 'berth', aft: 0.8, fore: 6.29, across: [-MIDSHIPS, MIDSHIPS], use: 'the way forward past the main hatch and the hold scuttles' },
  { id: 'messdeck', name: 'messdeck', level: 'berth', aft: 6.29, fore: 11.15, use: "the men eat at tables between the guns' places and sleep in hammocks; store bins along the sides" },
  { id: 'galley', name: 'galley', level: 'berth', aft: 11.15, fore: 13.87, across: [-MIDSHIPS, MIDSHIPS], use: 'the fire hearth and stove under the chimney' },
  { id: 'sailroom', name: 'sail room', level: 'berth', aft: 11.15, fore: 12.51, across: [-SIDE, -MIDSHIPS], use: 'spare sails' },
  { id: 'dry-store', name: 'dry provisions', level: 'berth', aft: 12.51, fore: 13.87, across: [-SIDE, -MIDSHIPS], use: 'dry provisions' },
  { id: 'boatswain-store', name: "boatswain's store", level: 'berth', aft: 11.15, fore: 13.87, across: [MIDSHIPS, SIDE], use: 'blocks, spare rope, tools' },
  { id: 'fore-store', name: 'fore store rooms', level: 'berth', aft: 13.87, fore: 16.8, use: 'store rooms round the foremast, the scuttles to the fore hold' },
  { id: 'magazine', name: 'magazine', level: 'hold', aft: -5.59, fore: -3.51, floor: MAGAZINE_FLOOR, use: 'powder in barrels; cartridges are filled here' },
  { id: 'lightroom', name: 'light room passage', level: 'hold', aft: -3.51, fore: -1.46, floor: LIGHT_ROOM_FLOOR, use: 'a lantern behind glass lights the magazine; the powder boys pass cartridges up' },
  { id: 'spirit', name: 'spirit room and well', level: 'hold', aft: -1.46, fore: 1.52, floor: SPIRIT_ROOM_FLOOR, use: 'spirits under lock; the pump well round the mainmast' },
  { id: 'hold', name: 'main hold', level: 'hold', aft: 1.52, fore: 11.46, floor: HOLD_FLOOR, use: 'water casks on the shingle ballast, the shot, the fish room' },
  { id: 'fore-hold', name: 'fore hold', level: 'hold', aft: 11.46, fore: 15.3, floor: HOLD_FLOOR, use: "the boatswain's and carpenter's heavy stores, the cables" },
];
/** Spaces of a level open to each other, with no bulkhead between them, and where across their shared edge the way is reckoned (clear of masts and scuttles), m. */
export const OPEN_JOINS: readonly { readonly between: readonly [string, string]; readonly across: number }[] = [
  { between: ['passage', 'midships'], across: 0.75 }, { between: ['midships', 'messdeck'], across: 0.9 },
  { between: ['messdeck', 'galley'], across: 0 }, { between: ['galley', 'fore-store'], across: 0.8 },
];

/**
 * What a hole in a deck is: a hatch (with its grating, for light, air and stores), a ladderway, the companion (a
 * hooded ladderway), a scuttle (a small hatch with a ladder), or a skylight (light only).
 */
export type OpeningKind = 'hatch' | 'ladderway' | 'companion' | 'scuttle' | 'skylight';
/** A hole in a deck: in the deck of `level`, its oblong in plan (m), its coaming's height over the deck (m). */
export interface OpeningRow {
  readonly id: string;
  readonly name: string;
  readonly kind: OpeningKind;
  readonly level: Level;
  readonly aft: number;
  readonly fore: number;
  readonly across: readonly [number, number];
  readonly coaming: number;
}
/** Coamings, m over the deck: the weather deck's hatches, a companion's hood, a skylight's, the berth deck's. */
const COAMING = 0.3;
const HOOD = 0.9;
const SKYLIGHT_HOOD = 0.7;
const COAMING_BELOW = 0.12;
/**
 * Her openings, along her from the upper deck plan (ZAZ4592) and the lower deck plan; their breadths are not drawn
 * except the main hatch's (1.9 m) and are a sloop's usual sizes.
 */
export const OPENINGS: readonly OpeningRow[] = [
  { id: 'bread-scuttle', name: 'bread room scuttle', kind: 'scuttle', level: 'weather', aft: -10.05, fore: -9.31, across: [-0.4, 0.4], coaming: COAMING },
  { id: 'companion', name: 'companion', kind: 'companion', level: 'weather', aft: -6.65, fore: -5.62, across: [-0.5, 0.5], coaming: HOOD },
  { id: 'after-ladderway', name: 'after ladderway', kind: 'ladderway', level: 'weather', aft: -5.41, fore: -4.59, across: [-0.45, 0.45], coaming: COAMING },
  { id: 'skylight', name: "officers' skylight", kind: 'skylight', level: 'weather', aft: -2.96, fore: -1.63, across: [-0.4, 0.4], coaming: SKYLIGHT_HOOD },
  { id: 'main-hatch', name: 'main hatch', kind: 'hatch', level: 'weather', aft: 1.03, fore: 2.94, across: [-0.95, 0.95], coaming: COAMING },
  { id: 'fore-hatch', name: 'fore hatch', kind: 'hatch', level: 'weather', aft: 8.11, fore: 9.74, across: [-0.8, 0.8], coaming: COAMING },
  { id: 'fore-ladderway', name: 'fore ladderway', kind: 'ladderway', level: 'weather', aft: 9.74, fore: 11.07, across: [-0.45, 0.45], coaming: COAMING },
  { id: 'magazine-scuttle', name: 'magazine scuttle', kind: 'scuttle', level: 'berth', aft: -3.19, fore: -2.59, across: [-0.35, 0.35], coaming: COAMING_BELOW },
  { id: 'spirit-scuttle', name: 'spirit room scuttle', kind: 'scuttle', level: 'berth', aft: -1.39, fore: -0.79, across: [-0.45, 0.25], coaming: COAMING_BELOW },
  { id: 'main-hatch-below', name: 'main hatch (berth deck)', kind: 'hatch', level: 'berth', aft: 1.23, fore: 2.53, across: [-0.6, 0.6], coaming: COAMING_BELOW },
  { id: 'hold-scuttles', name: 'hold scuttles', kind: 'hatch', level: 'berth', aft: 4.56, fore: 7.88, across: [-0.5, 0.5], coaming: COAMING_BELOW },
  { id: 'fore-hatch-below', name: 'fore hatch (berth deck)', kind: 'hatch', level: 'berth', aft: 8.17, fore: 9.47, across: [-0.8, 0.8], coaming: COAMING_BELOW },
  { id: 'fore-scuttle', name: 'fore hold scuttle', kind: 'scuttle', level: 'berth', aft: 14.39, fore: 15.26, across: [-1.15, -0.55], coaming: COAMING_BELOW },
];

/** A way in plan: toward the bow or the stern, to larboard (port) or starboard. */
export type Toward = 'aft' | 'fore' | 'port' | 'starboard';
/**
 * A ladder: through which opening, from which space below to which space above, toward which end of the opening it
 * climbs (its head), and, where another opening or fitting stands beyond that end, from which side its head is
 * stepped onto instead.
 */
export interface LadderRow {
  readonly id: string;
  readonly opening: string;
  readonly below: string;
  readonly above: string;
  readonly head: Toward;
  readonly step?: Toward;
}
/** Her ladders: one in every ladderway, companion and scuttle, and one down the berth deck's main hatch to the hold. */
export const LADDERS: readonly LadderRow[] = [
  { id: 'bread-ladder', opening: 'bread-scuttle', below: 'breadroom', above: 'deck', head: 'aft' },
  { id: 'companion-ladder', opening: 'companion', below: 'cabin', above: 'deck', head: 'fore', step: 'starboard' },
  { id: 'after-ladder', opening: 'after-ladderway', below: 'passage', above: 'deck', head: 'aft', step: 'port' },
  { id: 'fore-ladder', opening: 'fore-ladderway', below: 'messdeck', above: 'deck', head: 'aft', step: 'starboard' },
  { id: 'magazine-ladder', opening: 'magazine-scuttle', below: 'lightroom', above: 'passage', head: 'aft' },
  { id: 'spirit-ladder', opening: 'spirit-scuttle', below: 'spirit', above: 'passage', head: 'starboard' },
  { id: 'hold-ladder', opening: 'main-hatch-below', below: 'hold', above: 'midships', head: 'aft', step: 'starboard' },
  { id: 'fore-hold-ladder', opening: 'fore-scuttle', below: 'fore-hold', above: 'fore-store', head: 'fore' },
];

/** A door: the two spaces it joins and where it stands, m forward of the mainmast and from the centreline. */
export interface DoorRow {
  readonly id: string;
  readonly between: readonly [string, string];
  readonly along: number;
  readonly across: number;
}
/** Where a cabin's door stands across her: in the passage's side, or the main hatchway's. */
const CABIN_DOOR = PASSAGE;
const STORE_DOOR = MIDSHIPS;
/**
 * Doors in athwart bulkheads beside a ladder's foot, m from the centreline (N2.3): the captain's cabin door stands to
 * starboard of the companion ladder, which comes down in his cabin; the magazine's door to starboard of the magazine
 * ladder's foot in the light room passage; the spirit room's door to port of the hold ladder's foot. On the
 * centreline the ladders stood in their doorways.
 */
const BESIDE_COMPANION = 0.7;
const BESIDE_MAGAZINE_LADDER = 0.6;
const BESIDE_HOLD_LADDER = -0.7;
export const DOORS: readonly DoorRow[] = [
  { id: 'bread-door', between: ['breadroom', 'cabin'], along: -8.23, across: 0 },
  { id: 'cabin-door', between: ['cabin', 'passage'], along: -5.85, across: BESIDE_COMPANION },
  { id: 'master-door', between: ['master', 'passage'], along: -4.84, across: -CABIN_DOOR },
  { id: 'surgeon-door', between: ['surgeon', 'passage'], along: -2.2, across: -CABIN_DOOR },
  { id: 'purser-door', between: ['purser', 'passage'], along: -0.33, across: -CABIN_DOOR },
  { id: 'lieutenant-door', between: ['lieutenant', 'passage'], along: -4.77, across: CABIN_DOOR },
  { id: 'second-door', between: ['second', 'passage'], along: -2.2, across: CABIN_DOOR },
  { id: 'gunner-door', between: ['gunner', 'passage'], along: -0.33, across: CABIN_DOOR },
  { id: 'boatswain-door', between: ['boatswain', 'midships'], along: 1.67, across: -STORE_DOOR },
  { id: 'carpenter-door', between: ['carpenter', 'midships'], along: 1.67, across: STORE_DOOR },
  { id: 'steward-door', between: ['steward', 'midships'], along: 3.4, across: -STORE_DOOR },
  { id: 'pilot-door', between: ['pilot', 'midships'], along: 3.4, across: STORE_DOOR },
  { id: 'cockpit-door', between: ['cockpit', 'midships'], along: 5.28, across: -STORE_DOOR },
  { id: 'stewards-room-door', between: ['stewards-room', 'midships'], along: 5.28, across: STORE_DOOR },
  { id: 'sailroom-door', between: ['sailroom', 'galley'], along: 11.83, across: -STORE_DOOR },
  { id: 'dry-store-door', between: ['dry-store', 'galley'], along: 13.19, across: -STORE_DOOR },
  { id: 'boatswain-store-door', between: ['boatswain-store', 'galley'], along: 12.51, across: STORE_DOOR },
  { id: 'magazine-door', between: ['lightroom', 'magazine'], along: -3.51, across: BESIDE_MAGAZINE_LADDER },
  { id: 'spirit-door', between: ['spirit', 'hold'], along: 1.52, across: BESIDE_HOLD_LADDER },
  { id: 'fore-hold-door', between: ['hold', 'fore-hold'], along: 11.46, across: 0 },
];

/** The fore lower mast and its top are the main's scaled as her trucks are, 29 m over the deck to 32 (ship.md), until N3.2's spar table gives them. */
const FORE_SCALE = 29 / 32;
/** The lower foremast, m: its heel (above the base), length, diameter at the partners and the hounds, its masthead. */
export const FORE_MAST = { step: 1.3, length: MAIN_MAST.length * FORE_SCALE, partners: 0.53, hounds: MAIN_MAST.hounds * FORE_SCALE, head: MAIN_MAST.head * FORE_SCALE } as const;
/** The fore top, m: athwart, fore and aft, its thickness, and the lubber's hole. */
export const FORE_TOP = { breadth: MAIN_TOP.breadth * FORE_SCALE, length: MAIN_TOP.length * FORE_SCALE, thick: MAIN_TOP.thick, hole: MAIN_TOP.hole * FORE_SCALE } as const;
/** The masts: where each stands (m forward of the mainmast), where its heel is stepped (m above the base), and its diameter at the deck, m. */
export const MASTS = {
  main: { along: 0, step: MAIN_MAST.step, diameter: MAIN_MAST.partners },
  fore: { along: 14.64, step: FORE_MAST.step, diameter: FORE_MAST.partners },
} as const;
/** The square of the partners round a mast through a deck, m across (the slice's partners). */
export const PARTNERS = 0.82;

/** A fitting that stands in the way of walking: on which level, its oblong in plan (m), what it is. */
export interface FittingRow {
  readonly id: string;
  readonly name: string;
  readonly level: Level;
  readonly aft: number;
  readonly fore: number;
  readonly across: readonly [number, number];
}
/**
 * The fife rails' places that make the ways across her deck (ship.md, "Crossing the deck": a way 0.7 m wide across
 * the centreline at least every 6 m, one forward of the foremast), m forward of the mainmast: the main fife rail on
 * the main bitts' after face, 0.48 m abaft the mainmast, leaving the way between it and the skylight; the foremast's
 * fore fife rail just clear of the mast, leaving the way between it and the bowsprit's heel and the long six's captain
 * his place (ship.md, "The forecastle is reached past the fore fife rail": narrow, its pins within 0.8 m of the middle).
 */
export const MAIN_FIFE_AT = -0.89;
/** The ways across her weather deck's centreline (ship.md, "Crossing the deck"): each this wide clear, m, and no more than `every` m of centreline without one. */
export const DECK_CROSSING = { width: 0.7, every: 6 } as const;
export const FORE_FIFE_FORE_AT = 15.06;
/**
 * Her fittings in the way that are not furnished models (those are in the way as their own room, rules/fittings.ts
 * SOLID, so no fitting has two footprints), along her from the deck plans; across, a sloop's usual sizes. The store
 * scuttle stands to port over the sail room, off the centreline, leaving the way across between the galley chimney and the fore bitts
 * (over the dry store it would close the port gangway at the fore bitts).
 */
export const FITTINGS: readonly FittingRow[] = [
  { id: 'store-scuttle', name: 'store scuttle', level: 'weather', aft: 11.6, fore: 12.22, across: [-2.05, -1.35] },
  { id: 'bins-p', name: "boatswain's bins", level: 'berth', aft: 7.01, fore: 10.92, across: [-SIDE, -3.4] },
  { id: 'bins-s', name: "carpenter's bins", level: 'berth', aft: 7.01, fore: 10.92, across: [3.4, SIDE] },
  { id: 'well', name: 'pump well', level: 'hold', aft: -0.75, fore: 0.75, across: [-0.95, 0.95] },
];

/** The guns: in which ports they stand. A to H a 32-pounder carronade each side, I a long 6-pounder, J the chase port it is shifted to. */
export type GunKind = 'carronade' | 'long6';
export const PORT_GUNS: Readonly<Record<string, { readonly gun: GunKind; readonly chase: boolean }>> = {
  A: { gun: 'carronade', chase: false }, B: { gun: 'carronade', chase: false }, C: { gun: 'carronade', chase: false },
  D: { gun: 'carronade', chase: false }, E: { gun: 'carronade', chase: false }, F: { gun: 'carronade', chase: false },
  G: { gun: 'carronade', chase: false }, H: { gun: 'carronade', chase: false }, I: { gun: 'long6', chase: false },
  J: { gun: 'long6', chase: true },
};
/** A gun on deck, m: its footprint inboard from her side when run out (the slide or carriage with its tackles), and along her. */
export const GUN_FOOTPRINT: Readonly<Record<GunKind, { readonly inboard: number; readonly width: number }>> = {
  carronade: { inboard: 2.0, width: 0.9 },
  long6: { inboard: 2.1, width: 1.0 },
};
/** A gun's crew places, m: [inboard from her side, along her from the gun's middle] (the captain of the gun behind it, the rest at the tackles either side). */
export const GUN_CREW: readonly (readonly [inboard: number, along: number])[] = [
  [2.4, 0], [1.0, 0.85], [1.0, -0.85], [1.7, 0.85], [1.7, -0.85],
];

/**
 * The rails lines are made fast on. A pin rail runs inside the bulwark at a mast's shrouds, both sides, a pin every
 * PIN_RAIL.pitch but none over a gun's port. A fife rail stands athwart at a mast (here the bitts' cross-piece), its
 * pins at the places across given, the men hauling on the side `toward` (-1 aft, 1 forward).
 */
export type RailRow =
  | { readonly id: string; readonly kind: 'pin rail'; readonly mast: 'fore' | 'main'; readonly aft: number; readonly fore: number }
  | { readonly id: string; readonly kind: 'fife rail'; readonly mast: 'fore' | 'main'; readonly at: number; readonly pins: readonly number[]; readonly toward: 1 | -1 };
export const RAILS: readonly RailRow[] = [
  { id: 'main-pins', kind: 'pin rail', mast: 'main', aft: -4.2, fore: -0.2 },
  { id: 'fore-pins', kind: 'pin rail', mast: 'fore', aft: 10.9, fore: 14.6 },
  { id: 'main-fife', kind: 'fife rail', mast: 'main', at: MAIN_FIFE_AT, pins: [-1.05, -0.8, 0.8, 1.05], toward: -1 },
  { id: 'fore-fife', kind: 'fife rail', mast: 'fore', at: 13.15, pins: [-1.0, -0.85, 0.85, 1.0], toward: -1 },
  // The rig plan (N3.2) belays every running line on a pin of its own (about 100): the bulwark carries pins from the
  // taffrail to the bow, between the ports, and the foremast's fife rail has pins on its fore side too.
  { id: 'quarter-pins', kind: 'pin rail', mast: 'main', aft: -11.36, fore: -4.6 },
  { id: 'waist-pins', kind: 'pin rail', mast: 'main', aft: 0.1, fore: 10.6 },
  { id: 'bow-pins', kind: 'pin rail', mast: 'fore', aft: 14.92, fore: 19.1 },
  { id: 'fore-fife-fore', kind: 'fife rail', mast: 'fore', at: FORE_FIFE_FORE_AT, pins: [-0.75, -0.6, -0.45, 0.45, 0.6, 0.75], toward: 1 },
];
/** A fife rail's pins stand this high over the deck, m. */
export const BELAY_HEIGHT = 0.9;
/** No pin stands within this of a gun port's middle, m: the gun and its crew are there. */
export const PIN_CLEAR_OF_PORT = 0.8;
/** The fore shrouds' deadeyes on the fore channel, m forward of the mainmast (the draught). */
export const FORE_SHROUDS: readonly number[] = [10.87, 11.68, 13.22, 14.03, 14.76];

/** Where orders are given (ship.md, "Where orders are given"): a station, who stands there, what can be ordered, and the place. */
export interface StationRow {
  readonly id: string;
  readonly name: string;
  readonly who: string;
  readonly orders: readonly string[];
  readonly space: string;
  readonly along: number;
  readonly across: number;
}
/** The tops and the masthead (lookouts, marines) come with the rig plan (N3.2), aloft. */
export const STATIONS: readonly StationRow[] = [
  { id: 'wheel', name: 'the wheel', who: 'the master and the helmsmen', orders: ['course', 'come up', 'bear away', 'tack', 'wear', 'heave to'], space: 'deck', along: -9.5, across: 1.0 },
  { id: 'quarterdeck', name: 'the quarterdeck, by the capstan', who: 'the first lieutenant and the boatswain', orders: ['battle sail', 'plain sail', 'make sail', 'take in sail', 'reef', 'brace'], space: 'deck', along: -3.78, across: 1.3 },
  { id: 'waist', name: 'the waist, among the guns', who: 'the second lieutenant or the gunner, and the gun captains', orders: ['quarters', 'shot', 'target', 'run out', 'fire', 'cease fire', 'which side'], space: 'deck', along: 4.5, across: 0 },
  { id: 'magazine', name: 'the magazine', who: "the gunner's mate and the powder boys", orders: ['what is filled and passed up'], space: 'lightroom', along: -1.9, across: 0.6 },
  { id: 'pumps', name: 'the well and the pumps', who: 'the carpenter', orders: ['sound the well', 'man the pumps', 'plug and patch'], space: 'deck', along: 0, across: 1.5 },
  { id: 'surgeon', name: 'the cockpit', who: 'the surgeon', orders: [], space: 'cockpit', along: 5.28, across: -2.6 },
];
/**
 * Her lanterns below deck (plan N2.4): [space, m forward of the mainmast, m from the centreline], each hung from the
 * beams over its space. Horn lanterns burned in every inhabited space; the magazine has none (it is lit through the
 * light room's glass) and the officers' cabins one each. N2.6 may refine the places with the furniture.
 */
export const LANTERNS: readonly (readonly [space: string, along: number, across: number])[] = [
  ['cabin', -7.0, 0.6], ['passage', -4.6, 0], ['passage', -1.0, 0], ['master', -4.84, -2.6], ['surgeon', -2.6, -2.6],
  ['purser', -0.3, -2.6], ['lieutenant', -4.77, 2.6], ['second', -2.6, 2.6], ['gunner', -0.3, 2.6], ['midships', 3.4, 0.8],
  ['boatswain', 1.67, -2.6], ['carpenter', 1.67, 2.6], ['steward', 3.4, -2.6], ['pilot', 3.4, 2.6], ['cockpit', 5.3, -2.6],
  ['stewards-room', 5.3, 2.6], ['messdeck', 7.4, 1.4], ['messdeck', 9.9, -1.4], ['galley', 13.3, 0.7], ['sailroom', 11.8, -2.6],
  ['dry-store', 13.2, -2.6], ['boatswain-store', 12.5, 2.6], ['fore-store', 15.6, 0.6], ['lightroom', -2.0, 0.6],
  ['spirit', 0.9, 0.9], ['hold', 4.0, 0.9], ['hold', 9.4, -0.9], ['fore-hold', 13.0, 0.6], ['breadroom', -9.0, 0.6],
];

/** Where the plan's walk begins: the quarterdeck, by the capstan. */
export const QUARTERDECK = 'quarterdeck';

/** Damage cells, m: a panel of planking along her and up her girth, a deck panel along and across, a bulwark section along. */
export const CELL = { along: 1.0, girth: 0.92, across: 1.0 } as const;

// ---------------------------------------------------------------------------------------------------------------
// Her weight (N2.1): what she weighs fitted for sea, and where. Her timber is reckoned from the plan's own cells;
// what she carries from the allowances of a sloop of her size about 1805. N2.2 floats her on it.
// ---------------------------------------------------------------------------------------------------------------

/** Sea water, t/m³. */
export const SEA_WATER = 1.025;
/** Timber in service, t/m³: oak (frames, planking, beams; seasoned, then wet), and the fir deals of her decks. */
export const OAK = 0.85;
export const DEAL = 0.55;
/** Of the band her frames stand in, the share that is timber (room and space: frames 2 ft apart, sided about 14 in). */
export const FRAME_FILL = 0.6;
/** The ceiling covers this share of her frames' girth (from the limbers to the clamps; open above and at the floors' ends). */
export const CEILING_SHARE = 0.75;
/** Carlings, ledges and knees as a share of the beams' own weight. */
export const BEAM_FRAMING = 0.4;
/** The keelson over the floors, m: sided and moulded; the stem's and sternpost's siding is the keel's. */
export const KEELSON = { sided: 0.33, moulded: 0.33 } as const;
/** The deadwood fore and aft, m³ (the draught's chocks between keel and keelson at the ends). */
export const DEADWOOD = 4;
/** Iron and copper: bolts, knees' fastenings, chain plates, the copper sheathing, as a share of her timber. */
export const IRONWORK = 0.08;

/** What she carries fitted for sea: [what, tonnes, height of its middle above the base (m)]. */
export const LOADS: readonly (readonly [what: string, tonnes: number, height: number])[] = [
  ['16 carronades, 32-pounders of 17 cwt, on their slides', 21.8, 5.8],
  ['2 long 6-pounders of 22 cwt on their carriages', 2.9, 5.6],
  ['round shot: 50 rounds a carronade, 80 a long gun', 12.1, 2.4],
  ['powder, 90 barrels', 4.1, 2.5],
  ['masts, yards, rigging, blocks and sails', 30, 12],
  ['anchors: two bowers, a stream and a kedge', 4.8, 6],
  ['cables', 7, 2.6],
  ['boats on the skids and at the davits', 2.5, 7.4],
  ['water for ten weeks, in casks', 53, 2.3],
  ['provisions for ten weeks, in casks and bins', 17, 2.7],
  ['121 men and their hammocks, bags and chests', 13.3, 4.6],
  ["boatswain's, carpenter's and gunner's stores, spare sails", 10, 3.6],
  ['galley stove, coals and wood', 4, 4],
  ['ballast: iron pigs and shingle', 65, 1.5],
];

// ---------------------------------------------------------------------------------------------------------------
// Floating (N2.2): what her hull's pressure points alone do not give, the water moving with her and taking her
// motion's energy away, and the range her roll must fall in. src/sim/ship/motion.ts floats her on these.
// ---------------------------------------------------------------------------------------------------------------

/**
 * Her radius of gyration in roll as a share of her beam, the water rolling with her included. Ships run 0.35 to 0.4;
 * a brig's tall rig (30 t about 8 m over her centre) puts her at the top, and IMO's roll-period rule (Intact
 * Stability Code: T = 2·C·B/√GM, C = 0.373 + 0.023·B/d − 0.043·L/100) gives 0.42 for her proportions.
 */
export const ROLL_GYRATION = 0.42;
/** Her radius of gyration in pitch as a share of her length on the load waterline (0.25 for most hulls). */
export const PITCH_GYRATION = 0.25;
/** The water that heaves and pitches with her, as a share of her own mass and of her own pitch inertia (strip theory gives 0.7 to 1 for a hull of her form). */
export const HEAVE_ADDED_MASS = 0.8;
export const PITCH_ADDED_INERTIA = 0.8;
/**
 * How hard the water resists her hull moving across its own surface, per m² of wetted hull, t/(m²·s), for motion up
 * and down and for motion sideways. Up and down is the waves her heaving and pitching make, which carry their energy
 * away fast: they die out in about three swings. Sideways is the eddies off her keel and bilges as she rolls, far
 * weaker (her sway, which would let her keel give way, is not simulated, so it stands in for that too). Heeled and let
 * go she rolls five or six times before she is still: a deep keel and deadwood damp a brig's roll more than a modern hull's.
 */
export const HULL_DAMPING = { upward: 3, sideways: 0.4 } as const;
/**
 * The range her natural roll period must fall in, s: IMO's rule (above) for her beam and draught with the metacentric
 * height a sloop of war carried laden, about 0.7 to 1.5 m.
 */
export const ROLL_PERIOD = { least: 6, most: 10 } as const;
