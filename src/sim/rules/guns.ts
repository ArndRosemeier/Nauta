/**
 * The guns' rules (implementation plan N5.1 and N5.2; docs/ARCHITECTURE.md: rules as data): each kind of gun's arcs,
 * its drill and its reload, how laying goes, and what short hands do to it. Read by src/sim/guns/.
 *
 * **First proposals** (design thread, "Design decisions for N5", 2026-11-18), tuned at gate G5 and in N7.5. The
 * muzzle speeds, arcs and reloads are the design thread's; how a reload is shared out over the drill and how fast a
 * gun is laid are this file's own, from the drill books of the time (a carronade's crew could fire about once a
 * minute and better, a long gun about as often), shortened for pace. Pure.
 */
import { DEGREE } from '../units';
import type { GunKind } from './ships';

/**
 * The drill, in order (the drill books' words): sponge out the bore after a round, load (cartridge, wad, shot, wad),
 * ram it home, run her out to the port, then she stands ready; fired, she leaps back on her breeching (the recoil) and
 * stands run in, foul, to be sponged. A loaded gun can be run in again without firing (she then stands loaded).
 * `housed` is run in, empty and clean: how she stands at the start and after sponging.
 * The working steps take the crew's hands; the waiting steps wait for an order (to load, to run out) or to be fired.
 */
export type DrillStep = 'housed' | 'loading' | 'ramming' | 'loaded' | 'running-out' | 'ready' | 'running-in' | 'recoil' | 'sponging';

/** The steps worked by the crew's hands, and the share of a reload's handwork each takes (they add up to one, tested). */
export type HandStep = 'sponging' | 'loading' | 'ramming' | 'running-out';
export const DRILL_SHARES: Readonly<Record<HandStep, number>> = {
  sponging: 0.25,
  loading: 0.3,
  ramming: 0.15,
  'running-out': 0.3,
};

/** One kind of gun. */
export interface GunRow {
  readonly what: string;
  /** How far she trains either way of square to her side, rad (at her port, on her slide or with handspikes). */
  readonly train: number;
  /** How far she depresses below and elevates above her deck's level, rad (the elevating screw or the quoin). */
  readonly depress: number;
  readonly elevate: number;
  /** Seconds from firing to standing ready again (run out, loaded) with her full crew: the recoil and the handwork. */
  readonly reload: number;
  /** Seconds she takes to leap back on her breeching and come to rest; no hands are needed for it. */
  readonly recoil: number;
  /** Seconds of full-crew work to run her in again without firing. */
  readonly runIn: number;
  /** How fast her full crew trains her and elevates her, rad/s (train tackles or handspikes; the screw or the quoin). */
  readonly trainRate: number;
  readonly elevateRate: number;
}

/**
 * The brig's two kinds (ship.md; design decisions for N5): the 32-pounder carronade on its slide, 8 a side, and the
 * long 6-pounder on its truck carriage, one a side in the foremost ports. Both elevate from 5° down to 11° up. The
 * carronade's slide pivots at the port and trains with its tackles, so it slews faster than the long gun, which is
 * levered round by handspikes. Their reloads are the crew of four's (design ruling 2026-11-18, the reduced complement: about
 * 15 % slower than the crew of six, 35 and 30 s).
 */
export const GUNS: Readonly<Record<GunKind, GunRow>> = {
  carronade: {
    what: '32-pounder carronade', train: 30 * DEGREE, depress: 5 * DEGREE, elevate: 11 * DEGREE,
    reload: 40, recoil: 1.5, runIn: 6, trainRate: 5 * DEGREE, elevateRate: 2 * DEGREE,
  },
  long6: {
    what: 'long 6-pounder', train: 20 * DEGREE, depress: 5 * DEGREE, elevate: 11 * DEGREE,
    reload: 35, recoil: 1.5, runIn: 6, trainRate: 3 * DEGREE, elevateRate: 2 * DEGREE,
  },
};

/**
 * Short hands (the design decision): a gun's full crew is a man at each of her crew places (the plan's `crew`); with
 * men missing, her handwork (the drill's hand steps, and laying her) stretches in proportion to the hands missing: each
 * missing share of her crew adds that share of the time, times STRETCH. So with one of four men missing a reload's
 * handwork takes 1.33 times as long. More men than her places do not hurry her.
 */
export const STRETCH = 1;
/** With fewer men than this at a gun she stops: no drill, no laying, no firing (one man cannot run out a gun). */
export const FEWEST_AT_GUN = 2;

/**
 * One crew serves a pair of guns (orders.md, design thread 2026-11-18). At quarters each pair's crew stands to the gun of
 * its pair on the engaged side and crosses the deck when the other side comes to bear. Split between the pair (fought on
 * both sides at once, or both sides made ready before either bears), the whole crew serves both guns in turn and each is
 * worked at a little over half the pace the crew would give one gun alone.
 */
export const SPLIT_SHARE = 0.55;

/** What a gun is loaded with (orders.md: the gunner's "Shot: Round, Chain, Grape"); its flight is N5.2's. */
export type ShotKind = 'round' | 'chain' | 'grape';

// ---- Shot in flight (N5.2) ----

/** Speed of sound in air at sea level, m/s: a ball's drag rises steeply as it nears it. */
export const SPEED_OF_SOUND = 340;

/**
 * A sphere's drag coefficient by its Mach number (wind-tunnel results for smooth spheres, Miller and Bailey 1979,
 * rounded): about 0.47 slow, rising through the speed of sound to near 1 and easing after. A long six's ball leaves at
 * Mach 1.4 and loses a third of its speed in the first 200 m; a carronade's leaves below Mach 0.7.
 */
export const SPHERE_DRAG: { readonly mach: readonly number[]; readonly drag: readonly number[] } = {
  mach: [0, 0.5, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.5, 2],
  drag: [0.47, 0.48, 0.52, 0.6, 0.72, 0.85, 0.94, 0.97, 0.96, 0.92],
};

/** Each kind's muzzle speed with round shot, m/s (design decisions for N5). */
export const MUZZLE_SPEED: Readonly<Record<GunKind, number>> = { carronade: 230, long6: 480 };

/**
 * One kind of shot as each gun fires it: how many balls leave the muzzle, each ball's mass (kg) and diameter (m),
 * its muzzle speed as a share of round shot's, its drag as a multiple of a sphere's (chain tumbles), the spread of the
 * balls' directions (rad, the half-angle most of a grape round falls within) and the span a ball sweeps (m: chain's
 * two halves and their chain whirling; 0 for a ball), and whether it skips off the water.
 * Round: the solid ball. Chain: two half-balls joined by a fathom of chain, slower, tumbling, for her rigging out to
 * about 250 m. Grape: nine balls in a canvas stand, scattering from the muzzle, for her men inside about 100 m.
 */
export interface ShotRow {
  readonly balls: number;
  readonly mass: Readonly<Record<GunKind, number>>;
  readonly diameter: Readonly<Record<GunKind, number>>;
  readonly speed: number;
  readonly drag: number;
  readonly spread: number;
  readonly span: number;
  readonly skips: boolean;
}
export const SHOT: Readonly<Record<ShotKind, ShotRow>> = {
  round: { balls: 1, mass: { carronade: 14.5, long6: 2.72 }, diameter: { carronade: 0.155, long6: 0.089 }, speed: 1, drag: 1, spread: 0, span: 0, skips: true },
  chain: { balls: 1, mass: { carronade: 14, long6: 2.6 }, diameter: { carronade: 0.155, long6: 0.089 }, speed: 0.8, drag: 4, spread: 0, span: 1.8, skips: false },
  grape: { balls: 9, mass: { carronade: 1.5, long6: 0.3 }, diameter: { carronade: 0.071, long6: 0.042 }, speed: 0.9, drag: 1, spread: 2.5 * DEGREE, span: 0, skips: true },
};

/**
 * Powder smoke about a ship (N7.5a, "the weather position must pay"; guns/smoke.ts): each gun fired by either ship lays
 * `gun` of thick smoke on the ship to leeward (in full dead to leeward, less as the wind draws abeam); it clears as the
 * wind carries it `clears` m off (half a minute in a light breeze, a few seconds in a strong one); while it hangs her gun
 * captains lay and time their guns `spoils` times as badly again at the thickest. Between equal captains the weather
 * position then won about 51 % of the fights at 1.5, 53 % at 2, 60 % at 3 and 67 % at 4 (120 seasoned duels each, N7.5, 121 men
 * and no planning); with the crews of 80 and the captains' manoeuvring it won 54 % at 3 and 54 % at 4 (120 duels each, the noise
 * about 5 points), so it was set to 4 on the design thread's rule (below 58 % use 3 to 4) and left there until the planner
 * settles: the sheet wants more than 55 % and the design thread no more than 70 %.
 */
export const SMOKE = { gun: 0.06, clears: 60, spoils: 4 } as const;

/**
 * Scatter (seeded; tuned so that against a brig broadside on in a force 4 sea, fired as they bear, about three round
 * shot in four strike her hull at 100 m, half at 200 m and one in five at 400 m: design decisions for N5; checked by
 * `npm run check:gunnery`):
 * - DISPERSION: the spread of a gun's shot about her bore, rad (one standard deviation, up-down and side to side):
 *   loose-fitting balls and powder. Chain wanders more (CHAIN_WANDER times).
 * - SPEED_SPREAD: the muzzle speed's standard deviation, a share of it (the powder).
 * - TIMING: the gun captain's error in picking his moment of the roll, s (one standard deviation, a full crew). The
 *   barrel's aim moves with her roll, so the same error throws the shot further off the faster she rolls: it grows
 *   with the sea. Short hands stretch it like the drill (rules above, `STRETCH`).
 * - JUDGING: his error in judging the range he lays for, a share of it (one standard deviation).
 */
export const DISPERSION = 0.4 * DEGREE;
export const CHAIN_WANDER = 2;
export const SPEED_SPREAD = 0.02;
export const TIMING = 0.35;
export const JUDGING = 0.6;
/** How often he judges the range afresh, s (his error holds meanwhile, so he lays steadily). */
export const JUDGE_SECONDS = 10;

/**
 * The water: a ball meeting it at less than RICOCHET_ANGLE (rad) and faster than RICOCHET_SPEED (m/s) skips, keeping
 * SKIP_KEEP of its speed along the water and leaving at SKIP_LIFT of the angle it came in at; at most SKIPS_MOST
 * times. Otherwise it plunges and is spent. The gunners of the time counted on round shot's first grazes.
 */
export const RICOCHET_ANGLE = 6 * DEGREE;
export const RICOCHET_SPEED = 100;
export const SKIP_KEEP = 0.45;
export const SKIP_LIFT = 1;
export const SKIPS_MOST = 3;

/** The flight is worked out every FLIGHT_STEP s (a carronade's ball moves about 4 m in one, a long six's 8 m), and a point of its path kept every PATH_STEP s; no flight lasts beyond FLIGHT_LONGEST s. */
export const FLIGHT_STEP = 1 / 60;
export const PATH_STEP = 0.05;
export const FLIGHT_LONGEST = 15;

/**
 * The range table the flight is held to (round shot from her port, about 2.2 m above the water, calm, to the first
 * graze), m, at point blank (the line of metal, about 1° up) and at 5° up. First proposals from the design's muzzle
 * speeds: the gunnery tables of the time give a 32-pounder carronade about 300 yd at point blank, as here, but about
 * 1,090 yd at 5°, which a 230 m/s ball cannot reach (the real charge drove it faster); kept short, the carronade is
 * poor beyond 400 m as the design wants. The long six reaches about 1,300 m at 5°, as the tables give. Tested within
 * RANGE_TOLERANCE, so a change of drag or speed that moves them shows.
 */
export const POINT_BLANK = 1 * DEGREE;
export const RANGE_TABLE: Readonly<Record<GunKind, { readonly pointBlank: number; readonly five: number }>> = {
  carronade: { pointBlank: 260, five: 780 },
  long6: { pointBlank: 575, five: 1335 },
};
export const RANGE_TOLERANCE = 0.05;

// ---- Gunnery orders (N5.3a) ----

/** Where the gun captains lay their guns on her (orders.md: the gunner's "Aim: Hull, Rigging, Deck"). */
export type AimName = 'hull' | 'rigging' | 'deck';
/**
 * The point each aim lays on, m above the calm water at her middle, on her side toward the guns: the hull at her
 * waterline, "between wind and water" as gunners laid it (N7.5a: with her roll and the waves a fair share strike where
 * the sea comes in; the design's shares of balls that strike her, N5, are of balls laid on her side's middle, 1.25 m
 * up, and `check:gunnery` measures them so); the rigging about her lower yards (her lower masts' hounds); the deck a
 * man's chest above her rail. First proposals, judged at G5.
 */
export const AIM_HEIGHT: Readonly<Record<AimName, number>> = { hull: 0, rigging: 13, deck: 4 };
/**
 * The most guns of one ship that fire in a step: a broadside ripples down her side over a few steps, as a real one
 * did, and so a whole side of grape (about 6.5 ms of flights, N5.2) is spread over steps of 2 ms.
 */
export const RIPPLE = 3;
/** Fired as they bear, a gun captain fires only once his gun is laid within this of what he wants, rad. */
export const LAID_WITHIN = 0.1 * DEGREE;
