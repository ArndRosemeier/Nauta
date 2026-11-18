/**
 * The brig's rig (N3.2, docs/design/ship.md "Masts, rigging and sails"): her spars, sails and lines as data, one place
 * for every size of them, so the sailing model (N3.3), the crew (N4), the damage (N6) and the drawing (N3.6, N3.10)
 * read the same numbers. The rig plan (src/sim/ship/rig.ts) builds from them.
 *
 * **Where they come from.** The lower mainmast and the main top are the slice's (rules/ships.ts, N2.0), so the rig
 * meets what Arnd has seen. Everything else follows Steel's proportions for a brig of her burthen (*Elements and
 * Practice of Rigging and Seamanship*, 1794; his "Dimensions of the masts and yards of a brig of 14 to 18 guns") and
 * the sizes ship.md gives (main truck about 32 m and fore about 29 m over the deck, main yard about 17 m). **These are
 * estimates:** the Admiralty's sail plan of 18-gun brigs (National Maritime Museum) could not be fetched in the
 * cloud, so lengths are good to perhaps 5 %, and the heights where yards hang, the brace limits, the sails' cuts and
 * where each line belays are a seaman's usual practice about 1805, not readings off a draught. Where a number is
 * estimated its comment says so.
 *
 * Places are m forward of the mainmast (`along`), m from the centreline (+ starboard, `across`), heights m above
 * her base, as in rules/ships.ts.
 */
import { MAIN_MAST, MAIN_TOP, MASTS } from './ships';

/** A mast of hers. */
export type MastName = 'fore' | 'main';

/** How far each mast rakes aft, m per m up (fore about 1.5°, main about 3°: a brig's usual rake). Estimated. */
export const MAST_RAKE: Readonly<Record<MastName, number>> = { fore: 0.026, main: 0.052 };

/**
 * A mast's three spars, m. The lower mast: its length from the heel, its masthead (hounds to cap) and diameters at the
 * partners and the hounds. The topmast and the topgallant mast: length, head (hounds to cap, or the topgallant's pole
 * above its hounds) and greatest diameter. Each stands on the trestle trees of the one below, its heel at their
 * hounds, so its doubling is the lower one's head. The top's breadth and length, and the topmast crosstrees'
 * spread either side.
 */
export interface MastRow {
  readonly lower: { readonly length: number; readonly head: number; readonly partners: number; readonly hounds: number };
  readonly topmast: { readonly length: number; readonly head: number; readonly diameter: number };
  readonly topgallant: { readonly length: number; readonly pole: number; readonly diameter: number };
  readonly top: { readonly breadth: number; readonly length: number };
  readonly crosstrees: number;
}
/** Her masts (Steel's brig, the main lower mast and top the slice's; fore about nine tenths of the main). Estimated. */
export const MAST_SPARS: Readonly<Record<MastName, MastRow>> = {
  main: {
    lower: { length: MAIN_MAST.length, head: MAIN_MAST.head, partners: MAIN_MAST.partners, hounds: MAIN_MAST.hounds },
    topmast: { length: 11.6, head: 1.6, diameter: 0.33 },
    topgallant: { length: 9.5, pole: 3.4, diameter: 0.19 },
    top: { breadth: MAIN_TOP.breadth, length: MAIN_TOP.length },
    crosstrees: 0.95,
  },
  fore: {
    lower: { length: 18.2, head: 2.7, partners: MASTS.fore.diameter, hounds: 0.42 },
    topmast: { length: 10.9, head: 1.5, diameter: 0.31 },
    topgallant: { length: 8.8, pole: 3.1, diameter: 0.18 },
    top: { breadth: 3.05, length: 2.2 },
    crosstrees: 0.9,
  },
};
/** The square masthead's side, m (the slice's), and the trestle trees' depth under a top, m (the slice's). */
export const MASTHEAD_SIDE = 0.36;
export const TRESTLE_DEPTH = 0.26;
/** The topmast crosstrees stand this high over the topmast's hounds, m. */
export const CROSSTREES_DEPTH = 0.2;
/** The lower cap's thickness, m (the slice's): the topsail yard is lowered onto it. */
export const CAP_THICK = 0.22;
/* The timber of a top and the caps, as the drawing (render/ship/masts.ts) and the sails' clearance of it (render/ship/sailClear.ts) both read it. */
/** A cap reaches this far beyond the masthead aft and the mast it holds forward, and either side, m. */
export const CAP_RIM = 0.08;
/** The trestle trees under a top: their siding, m; the crosstrees across them stand this share of the top's length either side of the mast. */
export const TRESTLE_SIDED = 0.14;
export const CROSSTREES_AT = 0.33;
/** The crosstrees' depth under a top, m (a little shallower than the trestle trees). */
export const TOP_CROSSTREES_DEEP = 0.21;
/** A top's rim stands this high over its floor, m. */
export const TOP_RIM = 0.09;
/** A topmast's trestle trees reach this far fore and aft of it, m. */
export const TOPMAST_TRESTLE_REACH = 0.55;

/** A square sail's yard: on which mast, which of the three, length overall, each yardarm (outside the sail's head), diameter at the slings. */
export type YardLevel = 'course' | 'topsail' | 'topgallant';
export interface YardRow {
  readonly id: string;
  readonly name: string;
  readonly mast: MastName;
  readonly level: YardLevel;
  readonly length: number;
  readonly arm: number;
  readonly diameter: number;
  /** How far it braces round from square either way, rad (the lee shrouds and backstays stop it). Estimated. */
  readonly brace: number;
}
/** Her yards (Steel's brig; the main yard ship.md's 17 m). Lower and topsail yards brace 42°, topgallant yards 45°. The lower yards were 38° at first: the crew trims one brace for a mast's yards (a share of each one's own limit), so with the topsails drawing at their limit the courses, 4° short of it, were aback for as long as she held a course 70° to 80° off the wind, and the check's tack waited minutes for them. */
export const YARDS: readonly YardRow[] = [
  { id: 'fore-yard', name: 'fore yard', mast: 'fore', level: 'course', length: 15.2, arm: 0.75, diameter: 0.34, brace: 0.73 },
  { id: 'fore-topsail-yard', name: 'fore topsail yard', mast: 'fore', level: 'topsail', length: 11.4, arm: 0.9, diameter: 0.24, brace: 0.73 },
  { id: 'fore-topgallant-yard', name: 'fore topgallant yard', mast: 'fore', level: 'topgallant', length: 7.3, arm: 0.4, diameter: 0.15, brace: 0.79 },
  { id: 'main-yard', name: 'main yard', mast: 'main', level: 'course', length: 16.9, arm: 0.85, diameter: 0.37, brace: 0.73 },
  { id: 'main-topsail-yard', name: 'main topsail yard', mast: 'main', level: 'topsail', length: 12.5, arm: 1.0, diameter: 0.26, brace: 0.73 },
  { id: 'main-topgallant-yard', name: 'main topgallant yard', mast: 'main', level: 'topgallant', length: 8.0, arm: 0.45, diameter: 0.16, brace: 0.79 },
];
/**
 * Where a yard hangs, m: the lower yards are slung under the lower mast's hounds; a topsail yard is hoisted to just
 * under the topmast's hounds and lowered onto the lower cap; a topgallant yard hoisted under its hounds and lowered
 * onto the topmast's cap. The heights are of the yard's middle. Estimated.
 */
export const YARD_HANG: Readonly<Record<YardLevel, { readonly hoisted: number; readonly lowered: number }>> = {
  course: { hoisted: -1.0, lowered: -1.0 },
  topsail: { hoisted: -0.6, lowered: 0.3 },
  topgallant: { hoisted: -0.4, lowered: 0.2 },
};

/**
 * The bowsprit: its heel on deck (m forward of the mainmast, and how high its middle stands over the deck there), its
 * length, its steeve (rise from the level, rad, about 17°) and its diameter at the stem. Estimated.
 */
export const BOWSPRIT = { heel: 16.0, over: 0.3, length: 12.2, steeve: 0.3, diameter: 0.53 } as const;
/** The jib-boom along the top of the bowsprit: length, how far it overlaps the bowsprit, diameter, m. The flying jib is set at its end. Estimated. */
export const JIB_BOOM = { length: 11.0, doubling: 3.0, diameter: 0.25 } as const;
/** The dolphin striker under the bowsprit's cap that spreads the martingale: its length down, its diameter, m. Estimated. */
export const STRIKER = { length: 1.6, diameter: 0.12 } as const;
/**
 * The main boom and gaff of the boom sail: lengths, diameters, m; the boom's jaws over the quarterdeck's level (so it
 * clears a man standing there, N2.12) and how it rises aft,
 * rad; the gaff's jaws under the main hounds and its peak (rise from the level), rad; how far each swings out either
 * side of the centreline, rad. The boom reaches 2.7 m past her taffrail, as a brig's did. Estimated. With the boom
 * raised over the quarterdeck (N2.12) the gaff is 1.7 m longer than first estimated, so the boom sail keeps its area
 * (133 m²) and her balance on the wind.
 */
export const BOOM = { length: 15.2, diameter: 0.3, jaws: 2.4, rise: 0.04, swing: 1.31 } as const;
export const GAFF = { length: 11.2, diameter: 0.2, jaws: -1.0, peak: 0.6, swing: 1.31 } as const;

/**
 * The places on a spar where it can break, as shares of its length from the heel (each two the ends of one segment:
 * ship.md, "each spar is a chain of segments, so a hit breaks it at a real place"). A lower mast's partners and
 * hounds and a topmast's cap and hounds are reckoned from the spars themselves; these are the rest.
 */
export const BREAK_SHARES = {
  /** A yard: the yardarms' quarters and the slings in the middle. */
  yard: [0, 0.25, 0.5, 0.75, 1],
  /** The middle of a lower mast between the partners and the hounds, and of a long boom or bowsprit. */
  middle: 0.5,
} as const;

/** A square sail: its yard; the course's foot or, for the sails above, the yard below whose arms its clews are sheeted to. */
export interface SquareSailRow {
  readonly id: string;
  readonly name: string;
  readonly kind: 'square';
  readonly yard: string;
  /** The yard its clews are sheeted home to; null: a course, sheeted to the deck. */
  readonly sheetedTo: string | null;
  /** How many reef bands it has, and how much of its drop each takes up. Estimated. */
  readonly reefs: number;
  readonly reefShare: number;
}
/**
 * A fore-and-aft sail. The boom sail is laced to the boom and gaff and the mast; a headsail or a staysail is hanked to
 * a stay (a line of the rig), its tack and head at shares of the stay from its lower end, its clew where its foot and
 * leech (m) meet below the stay.
 */
export interface ForeAftSailRow {
  readonly id: string;
  readonly name: string;
  readonly kind: 'boom' | 'head' | 'stay';
  /** A headsail's or staysail's stay (a line id), its luff's two ends as shares of the stay from its lower end, its foot and leech, m. */
  readonly stay?: string;
  readonly luff?: readonly [number, number];
  readonly foot?: number;
  readonly leech?: number;
  readonly reefs: number;
  readonly reefShare: number;
}
export type SailRow = SquareSailRow | ForeAftSailRow;
/** Her eleven sails (ship.md): six square, the boom sail, three headsails, two staysails between the masts. Cuts estimated. */
export const SAILS: readonly SailRow[] = [
  { id: 'fore-course', name: 'fore course', kind: 'square', yard: 'fore-yard', sheetedTo: null, reefs: 1, reefShare: 0.15 },
  { id: 'fore-topsail', name: 'fore topsail', kind: 'square', yard: 'fore-topsail-yard', sheetedTo: 'fore-yard', reefs: 3, reefShare: 0.13 },
  { id: 'fore-topgallant', name: 'fore topgallant', kind: 'square', yard: 'fore-topgallant-yard', sheetedTo: 'fore-topsail-yard', reefs: 0, reefShare: 0 },
  { id: 'main-course', name: 'main course', kind: 'square', yard: 'main-yard', sheetedTo: null, reefs: 1, reefShare: 0.15 },
  { id: 'main-topsail', name: 'main topsail', kind: 'square', yard: 'main-topsail-yard', sheetedTo: 'main-yard', reefs: 3, reefShare: 0.13 },
  { id: 'main-topgallant', name: 'main topgallant', kind: 'square', yard: 'main-topgallant-yard', sheetedTo: 'main-topsail-yard', reefs: 0, reefShare: 0 },
  { id: 'boom-sail', name: 'main boom sail', kind: 'boom', reefs: 2, reefShare: 0.15 },
  { id: 'fore-topmast-staysail', name: 'fore topmast staysail', kind: 'head', stay: 'fore-topmast-stay', luff: [0.05, 0.6], foot: 6.5, leech: 11.0, reefs: 0, reefShare: 0 },
  { id: 'jib', name: 'jib', kind: 'head', stay: 'jib-stay', luff: [0.03, 0.75], foot: 8.0, leech: 14.0, reefs: 0, reefShare: 0 },
  { id: 'flying-jib', name: 'flying jib', kind: 'head', stay: 'flying-jib-stay', luff: [0.03, 0.65], foot: 6.5, leech: 15.0, reefs: 0, reefShare: 0 },
  { id: 'main-staysail', name: 'main staysail', kind: 'stay', stay: 'main-stay', luff: [0.15, 0.6], foot: 6.0, leech: 6.5, reefs: 0, reefShare: 0 },
  { id: 'main-topmast-staysail', name: 'main topmast staysail', kind: 'stay', stay: 'main-topmast-stay', luff: [0.1, 0.75], foot: 7.5, leech: 9.0, reefs: 0, reefShare: 0 },
];
/** A course's clews: how far outside its head's ends, m (the gore), and how high over the deck at its mast, m. Estimated. */
export const COURSE_GORE = 0.5;
export const COURSE_CLEW: Readonly<Record<MastName, number>> = { fore: 3.2, main: 3.6 };
/** The boom sail: its tack over the boom's jaws, how far short of the boom's end its clew, of the gaff's its peak, m. */
export const BOOM_SAIL = { tack: 0.3, clewShort: 0.8, peakShort: 0.4 } as const;

/**
 * The deadeyes' seats on her side, m: a channel's top under the top of her side (the main channel's, ships.ts, is
 * 0.12 under it), how far out it stands, how far in from its edge a deadeye sits and how high over it. The main
 * shrouds use the main channel itself; the fore channel and the backstays' stools follow the same rule. Estimated.
 */
export const CHANNEL = { underTop: 0.12, width: 0.38, seatIn: 0.06, seatUp: 0.1 } as const;
/** The backstays' deadeyes on stools abaft each mast's channel, m forward of the mainmast: two topmast backstays, then the topgallant one. Estimated. */
export const BACKSTAYS: Readonly<Record<MastName, readonly number[]>> = { main: [-5.0, -5.5, -6.0], fore: [10.4, 10.0, 9.6] };
/** The topmast shrouds a side, their deadeyes in the top's rim (and the futtock shrouds under them), and the topgallant shrouds a side. */
export const TOPMAST_SHROUDS = 3;
export const TOPGALLANT_SHROUDS = 2;
/** The topmast shrouds' deadeyes in the top's rim: how far in from its edge, and spread fore and aft round the mast, m. */
export const TOP_DEADEYES = { in: 0.1, spread: 0.45 } as const;
/** The futtock stave lies about this far under the top's floor, m; the rig puts it where the climb's gait meets it (`futtock.lo`, @futuremagic/figure). */
export const FUTTOCK_UNDER_TOP = 1.4;
/** The topmast shrouds' stave under the crosstrees, m, where the climb leans out onto them. */
export const CROSSTREES_STAVE = 0.9;

/**
 * Line kinds: whether standing or running, its diameter, m (Steel's circumferences for a brig), and what it does,
 * in words for people and as the act the simulation reads.
 */
export type LineKind =
  | 'shroud' | 'futtock shroud' | 'topmast shroud' | 'topgallant shroud' | 'backstay' | 'stay' | 'bobstay'
  | 'bowsprit shroud' | 'guy' | 'martingale' | 'back rope' | 'sling'
  | 'brace' | 'lift' | 'halliard' | 'sheet' | 'tack' | 'clewgarnet' | 'clewline' | 'buntline' | 'bowline'
  | 'reef tackle' | 'downhaul' | 'outhaul' | 'vang' | 'brail' | 'topping lift';
/** What a line does to the thing it serves: holds a spar up, swings a yard, hoists, trims a sail's corner, gathers or reefs it. */
export type LineAct = 'holds' | 'braces' | 'lifts' | 'hoists' | 'sheets' | 'tacks' | 'gathers' | 'reefs' | 'hauls down' | 'hauls out' | 'steadies';
export const LINE_KINDS: Readonly<Record<LineKind, { readonly standing: boolean; readonly diameter: number; readonly act: LineAct; readonly does: string }>> = {
  'shroud': { standing: true, diameter: 0.049, act: 'holds', does: 'holds the lower mast against the roll' },
  'futtock shroud': { standing: true, diameter: 0.032, act: 'holds', does: 'carries the topmast shrouds\' pull from the top\'s rim to the lower shrouds' },
  'topmast shroud': { standing: true, diameter: 0.032, act: 'holds', does: 'holds the topmast sideways' },
  'topgallant shroud': { standing: true, diameter: 0.02, act: 'holds', does: 'holds the topgallant mast sideways' },
  'backstay': { standing: true, diameter: 0.035, act: 'holds', does: 'holds a mast above the top aft and sideways' },
  'stay': { standing: true, diameter: 0.06, act: 'holds', does: 'holds a mast forward; a headsail or staysail is hanked to it' },
  'bobstay': { standing: true, diameter: 0.05, act: 'holds', does: 'holds the bowsprit down against the stays' },
  'bowsprit shroud': { standing: true, diameter: 0.04, act: 'holds', does: 'holds the bowsprit sideways' },
  'guy': { standing: true, diameter: 0.03, act: 'holds', does: 'holds the jib-boom sideways' },
  'martingale': { standing: true, diameter: 0.03, act: 'holds', does: 'holds the jib-boom down over the dolphin striker' },
  'back rope': { standing: true, diameter: 0.03, act: 'holds', does: 'holds the dolphin striker back' },
  'sling': { standing: true, diameter: 0.04, act: 'holds', does: 'holds a lower yard up to its masthead' },
  'brace': { standing: false, diameter: 0.022, act: 'braces', does: 'swings a yard round to the wind' },
  'lift': { standing: false, diameter: 0.02, act: 'lifts', does: 'holds a yardarm up and squares the yard' },
  'halliard': { standing: false, diameter: 0.025, act: 'hoists', does: 'hoists a yard or a sail' },
  'sheet': { standing: false, diameter: 0.028, act: 'sheets', does: 'hauls a sail\'s clew home' },
  'tack': { standing: false, diameter: 0.028, act: 'tacks', does: 'holds a course\'s weather clew forward' },
  'clewgarnet': { standing: false, diameter: 0.018, act: 'gathers', does: 'hauls a course\'s clew up to its yard' },
  'clewline': { standing: false, diameter: 0.018, act: 'gathers', does: 'hauls a sail\'s clew up to its yard' },
  'buntline': { standing: false, diameter: 0.016, act: 'gathers', does: 'hauls a sail\'s foot up to its yard' },
  'bowline': { standing: false, diameter: 0.016, act: 'sheets', does: 'hauls a square sail\'s weather leech forward, close-hauled' },
  'reef tackle': { standing: false, diameter: 0.016, act: 'reefs', does: 'hauls the leech up to the yardarm for reefing' },
  'downhaul': { standing: false, diameter: 0.016, act: 'hauls down', does: 'hauls a headsail or staysail down its stay' },
  'outhaul': { standing: false, diameter: 0.02, act: 'hauls out', does: 'hauls a sail\'s corner out along its spar' },
  'vang': { standing: false, diameter: 0.018, act: 'steadies', does: 'steadies the gaff\'s peak' },
  'brail': { standing: false, diameter: 0.016, act: 'gathers', does: 'gathers the boom sail in to the mast' },
  'topping lift': { standing: false, diameter: 0.02, act: 'lifts', does: 'holds the boom\'s end up' },
};

/**
 * The belaying of the running lines: each kind of line, on each mast or sail, goes to the first of these rails with
 * a free pin on its side, the pin nearest `near` (m forward of the mainmast). One line to a pin (rails: ships.ts
 * RAILS). A seaman's usual plan for a brig: halliards at the fife rails, the gear of each mast at its own pin rail,
 * main braces and the boom's gear aft, fore braces in the waist, the headsails' gear forward. Estimated.
 */
export const BELAYING: Readonly<Record<string, { readonly rails: readonly string[]; readonly near: number }>> = {
  'main-course brace': { rails: ['quarter-pins'], near: -10.5 },
  'main-topsail brace': { rails: ['quarter-pins'], near: -9.5 },
  'main-topgallant brace': { rails: ['quarter-pins'], near: -8.8 },
  'fore-course brace': { rails: ['waist-pins', 'main-pins'], near: 2.0 },
  'fore-topsail brace': { rails: ['waist-pins', 'main-pins'], near: 2.5 },
  'fore-topgallant brace': { rails: ['waist-pins', 'main-pins'], near: 4.5 },
  'main lift': { rails: ['main-pins', 'waist-pins'], near: -0.5 },
  'fore lift': { rails: ['fore-pins', 'bow-pins'], near: 14.5 },
  'main halliard': { rails: ['main-fife', 'main-pins'], near: -1.2 },
  'fore halliard': { rails: ['fore-fife', 'fore-fife-fore', 'fore-pins'], near: 13.3 },
  'main-course sheet': { rails: ['quarter-pins'], near: -6.5 },
  'fore-course sheet': { rails: ['waist-pins'], near: 8.5 },
  'main sheet': { rails: ['main-fife', 'main-pins', 'waist-pins'], near: -1.2 },
  'fore sheet': { rails: ['fore-fife', 'fore-pins', 'waist-pins'], near: 13.3 },
  'main-course tack': { rails: ['waist-pins'], near: 8.8 },
  'fore-course tack': { rails: ['bow-pins', 'fore-pins'], near: 16.8 },
  'main gear': { rails: ['main-pins', 'waist-pins', 'quarter-pins'], near: -2.0 },
  'fore gear': { rails: ['fore-pins', 'waist-pins', 'bow-pins'], near: 12.0 },
  'main bowline': { rails: ['fore-pins', 'waist-pins'], near: 11.0 },
  'fore bowline': { rails: ['bow-pins', 'fore-pins'], near: 17.0 },
  'boom halliard': { rails: ['main-fife', 'main-pins', 'quarter-pins'], near: -1.5 },
  'boom aft': { rails: ['quarter-pins'], near: -11.0 },
  'boom gear': { rails: ['main-pins', 'quarter-pins'], near: -3.0 },
  'head halliard': { rails: ['fore-fife-fore', 'fore-fife', 'fore-pins'], near: 15.9 },
  'head downhaul': { rails: ['bow-pins', 'fore-fife-fore', 'fore-pins'], near: 18.0 },
  'head sheet': { rails: ['fore-pins', 'waist-pins', 'bow-pins'], near: 12.5 },
  'stay halliard': { rails: ['main-pins', 'waist-pins', 'main-fife'], near: -0.4 },
  'stay downhaul': { rails: ['fore-pins', 'fore-fife-fore', 'waist-pins'], near: 14.0 },
  'stay sheet': { rails: ['waist-pins', 'main-pins'], near: 2.0 },
};

/**
 * The climb aloft (ship.md, "Every space navigable"): the most a ratline may rise over the last, m (the shrouds are
 * climbed at their pitch, RATLINE_PITCH); how far a footrope ends short of its yardarm, m; the most slope a spar
 * walked along may have, rad; how far apart the topmen's places on a footrope are, m.
 */
export const CLIMB = { mostRung: 0.4, footropeShort: 0.3, mostSlope: 0.35, yardPlace: 1.0 } as const;
/** Where one gets onto the bowsprit from the deck: beside its heel at the knightheads, m forward of the mainmast and out from the centreline. */
export const BOWSPRIT_STEP = { along: 18.6, across: 0.7 } as const;
/** How far out along the bowsprit from the stem its walk runs, as a share of its outboard length (the cap is beyond). */
export const BOWSPRIT_WALK = 0.95;

/** Stations aloft (ship.md, "Where orders are given"): the tops and the masthead, the lookouts and marines in action. */
export const ALOFT_STATIONS: readonly { readonly id: string; readonly name: string; readonly who: string; readonly orders: readonly string[]; readonly on: string }[] = [
  { id: 'main-top', name: 'the main top', who: 'the lookouts, marines in action', orders: ['report a sail', 'fire at her deck'], on: 'main-top' },
  { id: 'fore-top', name: 'the fore top', who: 'the lookouts, marines in action', orders: ['report a sail', 'fire at her deck'], on: 'fore-top' },
  { id: 'masthead', name: 'the main masthead', who: 'the masthead lookout', orders: ['report a sail'], on: 'main-crosstrees' },
];

/** The topgallant shrouds' feet at the crosstrees' ends, spread this far fore and aft of the topmast, m; the crosstrees' two timbers, how far apart and sided, m (the slice's trestle trees). */
export const TOPGALLANT_SPREAD = 0.25;
export const CROSSTREES_TIMBERS = { apart: 0.7, sided: 0.14 } as const;
/** A footrope is stood on by a foot this wide, m: what a body has to stand on there. */
export const FOOTING = 0.1;

/**
 * Where the stays come down, estimated from a brig's usual rig: the fore stay to a collar on the bowsprit this far
 * outboard of the stem (m); the jib stay from this high over the fore topmast's hounds (m) to the jib's traveller,
 * this share of the jib-boom's length outside the bowsprit's cap; the fore topgallant stay to this share of it; the
 * flying jib stay from this high over the topgallant's hounds (m) to its end; the main stay to a collar this high
 * on the foremast over the deck (m).
 */
export const STAY_ENDS = { foreStayOut: 1.2, jibStayAbove: 0.3, jibTraveller: 0.55, topgallantStayOut: 0.85, flyingStayAbove: 0.5, mainStayCollar: 1.2 } as const;

/**
 * The bowsprit's standing rigging, estimated: two bobstays, from these shares of its length outside the stem down to
 * the stem at these heights above the base; two bowsprit shrouds a side, from these shares of it to her bows (m
 * forward of the mainmast) this far under the top of her side (m); the jib-boom guys to the catheads (m forward of
 * the mainmast, how far out from her side, m); the martingale's back ropes to her bows (m forward of the mainmast).
 */
export const BOBSTAYS: readonly (readonly [out: number, stem: number])[] = [[0.45, 4.2], [0.8, 3.6]];
export const BOWSPRIT_SHROUDS: readonly (readonly [out: number, along: number])[] = [[0.35, 18.8], [0.65, 18.2]];
export const BOW_FASTENINGS = { under: 0.6, cathead: 18.0, catheadOut: 0.9, backRope: 19.0 } as const;

/** The main braces and their topsail's and topgallant's lead aft through blocks at her quarter: m forward of the mainmast, and over her rail, m. Estimated. */
export const BRACE_QUARTER = { along: -10.4, up: 0.4 } as const;
/** Where a fore brace leads, on the mainmast: how far out either side of its middle, m. */
export const BRACE_ON_MAIN = 0.3;
/** A sail's leech is held by its bowline at this share of the way from its head to its clew, and a buntline lifts its foot this share out from its middle. */
export const BOWLINE_AT = 0.5;
export const BUNTLINE_OUT = 0.25;
/** A peak halliard takes the gaff this share of its length out from the jaws; the boom sheet the boom this far short of its end, m. */
export const PEAK_HALLIARD_AT = 0.65;
export const BOOM_SHEET_SHORT = 1.0;

/**
 * How far a sail is set, as one share the crew moves (design thread 2026-11-18): 0 furled, 1 sheeted home (crew/drill.ts
 * moves it, sails.ts `sailShare`). A square sail passes `HANGING` on the way, hanging in its gear: let fall from its
 * gaskets on the way up, clewed up on the way down; below it the men aloft are furling or loosing it on the yard, above
 * it the hands on deck sheet it home or clew it up, and only above it does it draw (sails.ts `drawShare`). A
 * fore-and-aft sail draws as it is hoisted. Roughly the drawn seconds of N3.10: let fall 5 s of 17 to sheeted home.
 */
export const HANGING = 0.3;
