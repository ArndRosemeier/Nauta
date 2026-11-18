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
import type { SparKind } from '../ship/spars';
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
/**
 * The hammocks stowed in the waist's nettings at quarters (ship.md, "The view from the deck"): the lowered waist's
 * breastwork above its rail. Packed tight they stop grape as the old bulwark did, `thick` m of oak to it square on;
 * round and chain shot go through as if they were not there and throw no splinters from them. A ship not at quarters
 * has the open rail and no such shelter. Only the shot named in `stops` is held by them.
 */
export const HAMMOCKS = { thick: TIMBER.bulwark, stops: ['grape'] as readonly ShotKind[] } as const;

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
    carronade: { slow: [177, 0.04], fast: [191, 0.17], most: 0.2, splinters: 0.3 },
    long6: { slow: [270, 0.04], fast: [330, 0.17], most: 0.2, splinters: 0.15 },
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
export const SPLINTER_REACH = 4;
export const SPLINTER_CONE = 50 * DEGREE;
export const SPLINTER_STRIKE = 1;
export const LODGED_SPLINTERS = 0.5;
/**
 * Raking (N7.5a, "raking pays"): a ball whose path through her lies within `within` (rad) of her length, in by her bow
 * or stern, travels the length of her deck and counts for several fired into her side: it meets her timber square on
 * (her stern and bow, built across it, not her side glancing), and a gun it meets is dismounted without stopping it (it
 * spends `1 / times` of a gun's iron), so it goes on through the gun crews down her side.
 */
export const RAKING = { within: 30 * DEGREE, times: 2 } as const;

// ---- Men ----

/** How badly a man is hurt: wounded (fights on), badly wounded (must be carried below), killed. */
export type Harm = 'wounded' | 'badly' | 'killed';
export const HARMS: readonly Harm[] = ['wounded', 'badly', 'killed'];
/** What strikes a man: a ball itself (by its kind), or splinters. */
export type HurtBy = ShotKind | 'splinter' | 'fall';
/**
 * How a man struck is hurt, by what struck him (a man aloft on a spar that falls is thrown down: `fall`): the shares
 * wounded, badly wounded and killed (they add up to one, tested). Splinters and grape put about half the men they strike
 * out of the fight (N7.5a, "splinters and grape hurt"), so a well-served broadside thins a gun deck; held there so
 * that no fight is over within 5 min of the first broadside, however close the ships lie (design ruling, N7.5a rerun).
 */
export const HURT: Readonly<Record<HurtBy, readonly [wounded: number, badly: number, killed: number]>> = {
  round: [0, 0.3, 0.7],
  chain: [0, 0.4, 0.6],
  grape: [0.45, 0.35, 0.2],
  splinter: [0.5, 0.3, 0.2],
  fall: [0.2, 0.4, 0.4],
};

// ---- Water (N6.2) ----

/**
 * A shot hole lets the sea in as a round opening RAGGED times the ball's diameter across (the timber splintered round
 * it), passing DISCHARGE of the ideal flow (a sharp-edged opening): flow = DISCHARGE × area × √(2 g × depth), the depth
 * from the sea outside down to the hole, less the water inside standing over it. A lodged ball plugs its own hole; a
 * hole the carpenter has plugged still weeps WEEP of what it let in, so the water gains slowly even with a good
 * carpenter (N7.5a).
 */
export const RAGGED = 1.7;
export const DISCHARGE = 0.6;
export const WEEP = 0.25;
/**
 * Every hole in her planking, above the water too, lets in at least SEEP of what the same hole at her waterline would
 * (`AT_WATERLINE`): the sea she ships through it as she rolls and the seams the blow opened round it. So the water in her
 * adds up with the fire she takes, not with where one or two balls happen to strike (design thread, 2026-11-18, "less
 * luck in flooding").
 */
export const SEEP = 0.2;
/**
 * The sea washes in at a hole up to WASH m above it, as if the hole lay that much deeper: her roll, her own wave and the
 * slop along her side (N7.5a: holes "between wind and water" let the sea in; turning the wounded side away lifts them
 * clear).
 */
export const WASH = 1;
/**
 * A hole "at her waterline" in the design's sense (between wind and water): her roll and the waves put it about this far
 * under on the average, m. The pumps are measured against a 32-pound shot hole lying so.
 */
export const AT_WATERLINE = 0.3;
/**
 * Her chain pumps (ship.md; rules/fittings.ts `PUMPS`): `count` side by side by the mainmast, each fully manned by
 * `hands` men holding `holds` open 32-pound shot holes at her waterline (`AT_WATERLINE`), fewer men in proportion
 * (N7.5a, "flooding is a contest": the carpenter's crew, four at the pumps while he and his mate plug, hold one and a
 * half; "Hands to the pumps", eight men at both, about three). They draw from the well and leave `least` t in the bilge. The
 * men posted at the pumps by the quarter bill (crew.ts) work them. Faster than chain pumps were, for the contest's sake.
 */
export const PUMPING = { count: 2, hands: 4, holds: 1.5, least: 1 } as const;
/** The post of the men who work the pumps (rules/crew.ts quarter bill). */
export const PUMP_POST = 'station-pumps';
/**
 * Water in her runs across her hold toward the level as she heels, taking about CROSS_SECONDS through her stowage and ballast: the sea
 * coming in at a hole on one side lists her that way until it has run across, and water left in her runs to the low
 * side as she rolls (her free surface).
 */
export const CROSS_SECONDS = 12;
/**
 * Foundered (her water at `founderTonnes`: her deck's lowest edge at the sea), the sea pours in over her side and down
 * her hatches, as much again as founders her in about AWASH_SECONDS, and she goes down (N6.4: her decks awash in about a
 * minute; she is lost).
 */
export const AWASH_SECONDS = 60;

// ---- Spars falling (N6.2) ----

/**
 * A spar breaks at a part with STRUCK_DOWN wounds (design decisions for N6), and goes over its lee side with all it
 * carries. A spar goes too when more than SUPPORT_LOST of the standing lines holding it on its weather side are gone
 * (its shrouds and backstays: cut, or made fast to a spar that is down) and the wind is on that side at FALL_WIND or
 * more (m/s, across her); or when that share of its stays is gone and its mast's square sails are aback (the wind on
 * their fore side presses it aft). Pulled over, a mast breaks at the part above where it is held (`FALLS_AT_PART` of its
 * parts, damage/meet.ts `sparParts`): a lower mast at her partners (the deck), a topmast at the cap, the bowsprit at
 * the stem.
 */
export const STRUCK_DOWN = 3;
export const SUPPORT_LOST = 0.5;
export const FALL_WIND = 3;
export const FALLS_AT_PART = 1;
/**
 * What falls drags alongside, held by its rigging until it is cut away (N6.3): a drag on her where it lies, at her side
 * by its mast, kN for each (m/s)² of the water past it, by the kind of each spar that fell (with its sails and rigging
 * in the water). A lower mast over the side all but stops her and swings her toward it.
 */
export const WRECK_DRAG: Readonly<Record<SparKind, number>> = {
  mast: 6, topmast: 2, 'topgallant mast': 0.6, yard: 0.8, bowsprit: 2, 'jib-boom': 0.6, striker: 0.1, boom: 0.6, gaff: 0.4,
};
/**
 * A sail's holes: each takes RENT_AREA m² of its drive (the cloth round it flogs), and a sail that has lost more than
 * SPLIT of its area so splits from head to foot and draws no more. A sail draws nothing either once its sheet or
 * halliard is cut, or the spar or stay it is set on is down.
 */
export const RENT_AREA = 0.5;
export const SPLIT = 0.6;

// ---- Fire (N6.2) ----

/**
 * Fire (design decisions for N6: it reaches the magazine only if left unfought for three minutes or more). A fire burns
 * in one of the plan's spaces (the weather deck is one); its size is the share of the space alight, `start` where a
 * ball starts it. Unfought it doubles every `doubling` s up to the whole space; at `spread` it catches the spaces the
 * plan's ways join it to (doors, ladders, openings) at `start`; each man fighting it puts out `put` of the space a
 * second. Powder catches when the magazine's own fire reaches `catch`: from `start` that takes log₂(catch / start)
 * doublings, about 3 min (tested). Out below `out`. A contest (N7.5a): a fresh fire outgrows the `FIGHT_AT_HAND` men
 * beating at it, so a fire party must come within a minute or two or it takes hold.
 */
export const FIRE = { start: 0.05, doubling: 50, spread: 0.5, catch: 0.65, put: 0.0003, out: 0.005 } as const;
/** The space the powder is kept in (the plan's). */
export const MAGAZINE = 'magazine';
/** Until a fire party comes (N6.3), the men in a burning space and the spaces joined to it beat at it, at most this many. */
export const FIGHT_AT_HAND = 2;
/**
 * The chance a ball that holes her timber, lodges in it or dismounts a gun sets her afire: `wad` when it was fired from
 * within WAD_RANGE (m, the burning wads and the flash reach her), else `ball` (a lantern, the galley fire, powder
 * by the guns).
 */
export const FIRE_CHANCE = { wad: 0.05, ball: 0.03 } as const;
export const WAD_RANGE = 40;

// ---- Steering (N6.2) ----

/**
 * Her steering gear: the wheel on the weather deck and the tiller ropes from its drum down and aft to the rudder head.
 * A ball passing within STEERING_REACH (m) of that line shoots her steering away: her rudder trails amidships and she
 * answers no helm until it is mended (N6.3). WHEEL_HIGH: the wheel's middle over her deck, m.
 */
export const STEERING_REACH = 0.4;
export const WHEEL_HIGH = 1.1;

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
