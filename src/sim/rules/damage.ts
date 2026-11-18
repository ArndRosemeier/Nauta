/**
 * What a hit does (implementation plan N6.1; docs/ARCHITECTURE.md: rules as data): how much timber each kind of shot
 * goes through by its speed, how thick each part of her is, what a ball needs to cut a line, hole a sail or wound a
 * spar, how splinters fly and how badly men are hurt. Read by src/sim/damage.ts, the one routine that takes a hit.
 *
 * **First proposals** (design thread, "Design decisions for N6", 2026-11-18), balanced in N7.5. The design's
 * statements these numbers are held to (tested in test/damage.test.ts):
 * - Round shot: a 32-pound ball goes through a brig's side out to about 400 m and through both sides inside 100 m; a
 *   6-pound ball goes through bulwarks at any fighting range and through the side only inside about 150 m.
 * - Chain does not pierce the side; it cuts lines, tears sails and wounds spars about four times as well as round shot,
 *   out to 250 m. Grape pierces nothing thicker than a bulwark, and is for the men, inside 100 m.
 * - Where a ball comes through, splinters fly inward in a cone and strike men within about 3 m; a ball that meets a gun
 *   dismounts it. The captain is never hit (he is not in the simulation; the drawing staggers him, N6.5).
 * Pure.
 */
import { DEGREE } from '../units';
import type { ShotKind } from './guns';
import { BERTH_BEAM, BULWARK, CEILING, DEAL, DECK_BEAM, FRAME_DEPTH, FRAME_FILL, OAK, PLANKING, type GunKind } from './ships';

// ---- Her timber ----

/** Of a bulwark's length, the share its timbers (stanchions between the boards) fill: a ball meets one now and then. */
export const BULWARK_FILL = 0.3;
/** Deal (her decks' planking) as oak: a ball goes through this much more of it, by their weights (rules/ships.ts). */
const DEAL_AS_OAK = DEAL / OAK;
/** Of a deck's length, the share its beams fill (sided ÷ spacing): a plunging ball meets one now and then. */
const BEAM_FILL = DECK_BEAM.sided / DECK_BEAM.spacing;
/**
 * How much oak a ball goes through to pierce each part of her square on, m (her frames and beams by the share of the
 * length they fill, deal as oak): her side (outside planking, frames, ceiling), her side in the wale's band, the
 * bulwark above her deck, the weather deck and the berth deck.
 */
export const TIMBER = {
  side: PLANKING.side + FRAME_DEPTH * FRAME_FILL + CEILING,
  wale: PLANKING.wale + FRAME_DEPTH * FRAME_FILL + CEILING,
  bulwark: BULWARK.outsideBoard + BULWARK.insideBoard + BULWARK.timber * BULWARK_FILL,
  weather: PLANKING.deck * DEAL_AS_OAK + DECK_BEAM.moulded * BEAM_FILL,
  berth: PLANKING.berthDeck * DEAL_AS_OAK + BERTH_BEAM * BEAM_FILL,
} as const;
/** The least cosine of a ball's meeting with timber that counts: a ball meeting it more glancingly goes through at most 1/GLANCING times its thickness (it skids off). */
export const GLANCING = 0.25;

// ---- What a ball goes through ----

/**
 * How much oak each kind of shot goes through by its speed ("punch", m): straight in the square of its speed between
 * two points of the table, `slow` and `fast` ([m/s, m of oak]), none below where that line reaches 0 (the ball only
 * bruises the timber), and never more than `most`. A ball spends its punch in order along its path: through 0.1 m of oak it
 * has 0.1 m less (damage.ts). The speeds are where each ball flies at the design's ranges (laid for them, calm air, from
 * the flight of N5.2):
 * - round, carronade: 196 m/s at 400 m just pierces her side; 221 m/s at 100 m both sides with a little to spare.
 * - round, long six: 240 m/s at 700 m still pierces a bulwark; 396 m/s at 150 m just pierces her side.
 * - chain: through a bulwark inside about 250 m (carronade 124 m/s, long six 163 m/s), never through her side.
 * - grape: a ball through a bulwark inside about 100 m (carronade 191 m/s, long six 330 m/s), hardly beyond 200 m.
 * `splinters`: how many splinters a ball throws where it comes through, as a share of a 32-pound ball's.
 */
export interface Pierce {
  readonly slow: readonly [speed: number, oak: number];
  readonly fast: readonly [speed: number, oak: number];
  readonly most: number;
  readonly splinters: number;
}
export const PIERCE: Readonly<Record<ShotKind, Readonly<Record<GunKind, Pierce>>>> = {
  round: {
    carronade: { slow: [196, 0.3], fast: [221, 0.62], most: Infinity, splinters: 1 },
    long6: { slow: [240, 0.17], fast: [396, 0.3], most: Infinity, splinters: 0.5 },
  },
  chain: {
    carronade: { slow: [124, 0.17], fast: [158, 0.24], most: 0.26, splinters: 0.4 },
    long6: { slow: [163, 0.17], fast: [253, 0.24], most: 0.26, splinters: 0.2 },
  },
  grape: {
    carronade: { slow: [177, 0.04], fast: [191, 0.17], most: 0.2, splinters: 0.1 },
    long6: { slow: [270, 0.04], fast: [330, 0.17], most: 0.2, splinters: 0.05 },
  },
};

// ---- What else a ball meets ----

/**
 * Chain's two halves and their chain whirl across its `span` (rules/guns.ts): it cuts lines, tears sails and wounds
 * spars CHAIN_BITE times as well as a ball (its reach to them is this many times a ball's).
 */
export const CHAIN_BITE = 4;
/** The least punch that cuts a line, holes a sail, wounds a spar or dismounts a gun, m of oak: a ball almost spent glances off. */
export const LEAST_PUNCH = { line: 0.01, sail: 0.002, spar: 0.04, gun: 0.04 } as const;
/** Fir (her spars) as oak: a ball through a spar spends its chord through it at this share. */
export const FIR_AS_OAK = 0.65;
/** A gun's iron and its slide or carriage, as oak, m: a ball that meets her dismounts her and is all but stopped. */
export const GUN_AS_OAK = 0.6;
/** How high a gun and her slide or carriage stand over her deck, m (her footprint in the plan is the rest of her box). */
export const GUN_HIGH = 0.9;
/** A man in the way, m: how far from the middle of his body a ball strikes him, and the oak he is to it. */
export const MAN_REACH = 0.22;
export const MAN_AS_OAK = 0.03;

// ---- Splinters ----

/**
 * Where a ball comes through her timber, splinters fly on in its direction: men within SPLINTER_REACH (m) of the
 * hole and within SPLINTER_CONE (rad, half the cone's angle) of the ball's line are each struck by chance: SPLINTER_STRIKE
 * at the hole, falling straight to none at the reach, times the shot's `splinters` (PIERCE). A ball that lodges throws
 * LODGED_SPLINTERS of that off the inside.
 */
export const SPLINTER_REACH = 3;
export const SPLINTER_CONE = 40 * DEGREE;
export const SPLINTER_STRIKE = 0.7;
export const LODGED_SPLINTERS = 0.5;

// ---- Men ----

/** How badly a man is hurt: wounded (fights on), badly wounded (must be carried below), killed. */
export type Harm = 'wounded' | 'badly' | 'killed';
export const HARMS: readonly Harm[] = ['wounded', 'badly', 'killed'];
/** What strikes a man: a ball itself (by its kind), or splinters. */
export type HurtBy = ShotKind | 'splinter';
/** How a man struck is hurt, by what struck him: the shares wounded, badly wounded and killed (they add up to one, tested). */
export const HURT: Readonly<Record<HurtBy, readonly [wounded: number, badly: number, killed: number]>> = {
  round: [0, 0.3, 0.7],
  chain: [0, 0.4, 0.6],
  grape: [0.3, 0.4, 0.3],
  splinter: [0.6, 0.3, 0.1],
};

// ---- What she looks like after ----

/** A panel of her side with this many holes is stove in; a bulwark section with this many is smashed out (ship.md "What can be damaged"). */
export const STOVE_IN = 4;
export const SMASHED = 3;
/** Holes are kept to this grid, m: the damage map's texel (render/ship/damageMap.ts draws them there). */
export const HOLE_GRID = 0.04;

// ---- Violence (design decisions for N6) ----

/**
 * How much of what happens to the men is shown: mild (men fall and are carried below, nothing more is shown), plain
 * (wounds and blood are seen), unsparing (a gun deck in action as it was). The simulation is the same under each;
 * only the drawing reads it (N6.6). Plain is the default.
 */
export type Violence = 'mild' | 'plain' | 'unsparing';
export const VIOLENCE: readonly Violence[] = ['mild', 'plain', 'unsparing'];
export const DEFAULT_VIOLENCE: Violence = 'plain';
