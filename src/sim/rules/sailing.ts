/**
 * The sailing model's rules (implementation plan N3.3; docs/ARCHITECTURE.md: rules as data): how hard the wind
 * presses a sail at each angle, how the hull resists going ahead and sideways, the rudder, the helmsman, how fast
 * the crew braces the yards round, which sails each setting carries and how they are reefed for the wind, and the
 * table of speeds the brig is tuned to. Pure.
 *
 * **Tuned for pace, not measured.** Fun before realism (nauta-plan.md): the speeds are a brig sloop's logged ones,
 * rounded up a little, and her turning is quicker than a real brig's so that a tack takes well under a minute. The
 * sail polars are the shape of wind-tunnel results for square and fore-and-aft canvas (Marchaj, "Aero-hydrodynamics
 * of sailing"), scaled; every number below can be changed to tune her feel.
 */
import { DEGREE, KNOT } from '../units';

/** Air's density at sea level, t/m³ (so a force from it comes out in kN with speeds in m/s). */
export const AIR = 1.225e-3;

/**
 * A sail's lift and drag coefficients by its angle of attack (the angle between the wind across it and its cloth),
 * degrees: lift across the wind, drag along it. A square sail peaks at about 30° and stalls slowly; a fore-and-aft
 * sail, cut flatter and set on a stay or a gaff, peaks earlier and higher. At 90° both are a plate square to the wind.
 */
export interface Polar {
  readonly angle: readonly number[];
  readonly lift: readonly number[];
  readonly drag: readonly number[];
}
export const SQUARE_POLAR: Polar = {
  angle: [0, 5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 70, 80, 90],
  lift: [0, 0.2, 0.45, 0.65, 0.8, 0.9, 0.94, 0.94, 0.9, 0.78, 0.62, 0.43, 0.22, 0],
  drag: [0.08, 0.09, 0.12, 0.17, 0.23, 0.3, 0.38, 0.48, 0.58, 0.8, 1.04, 1.25, 1.39, 1.45],
};
export const FORE_AFT_POLAR: Polar = {
  angle: [0, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90],
  lift: [0, 0.16, 0.36, 0.52, 0.62, 0.66, 0.66, 0.62, 0.55, 0.45, 0.32, 0.16, 0],
  drag: [0.05, 0.06, 0.09, 0.14, 0.21, 0.29, 0.38, 0.57, 0.77, 0.94, 1.1, 1.2, 1.25],
};
/**
 * How hard a sail presses against her roll, per rad of the angle her roll swings it across the wind: the lift slope of
 * cambered canvas in attached flow (thin-wing theory gives about π for a sail's low aspect). A sail aloft swinging
 * across the wind at her roll's speed meets it at a changing angle; the change of pressure on it opposes the swing.
 * This is what steadies a ship under sail: under battle sail in a beam sea at force 5 she rolls about half as much as
 * under bare poles.
 */
export const SAIL_ROLL_SLOPE = 3;
/** Below this angle of attack a sail shivers (its luff lifts and the cloth ripples): for the drawing and the sound, rad. */
export const SHIVER_ANGLE = 6 * DEGREE;

/**
 * How far a fore-and-aft sail's sheet lets it swing off her centre line to leeward, rad: least (sheeted flat) and
 * most. The boom sail's most is the boom's swing (rules/rig.ts BOOM.swing).
 */
export const HEADSAIL_SHEET = { least: 12 * DEGREE, most: 70 * DEGREE } as const;
export const BOOM_SHEET_LEAST = 5 * DEGREE;
/**
 * How the crew picks a trim: it tries this many brace settings across a yard's range (and this many sheet settings
 * across a sheet's) and takes the one that drives her best. Eleven is a setting every 4°, finer than the yards can be
 * laid by eye.
 */
export const TRIM_TRIES = 11;

/**
 * How fast the crew braces a mast's yards round, as a share of their whole range from square to braced up, per
 * second: braced from sharp up on one tack to sharp up on the other (twice the range) in about 8 s, a smart crew's
 * "mainsail haul" with the wind helping. Until the crew exists (N4) every yard swings at this rate.
 */
export const BRACE_RATE = 0.25;

/**
 * When the yards of each mast are swung over in a tack, by the wind's angle past her bow on the new side, rad: the
 * main yards as she comes head to wind ("mainsail haul"), the fore yards held aback to push her bow round until the
 * wind is well on the new bow ("let go and haul"). In a wear, by the wind's angle past her stern, the main (the boom
 * sail gybing over) and fore.
 */
export const HAUL = { main: 10 * DEGREE, fore: 40 * DEGREE } as const;
export const GYBE = { main: 10 * DEGREE, fore: 5 * DEGREE } as const;
/**
 * "Helm's a-lee": as she comes up into the wind in a tack, the head sheets are let fly within this angle of the wind,
 * so the headsails flog instead of holding her bow off; what they still pull, as a share.
 */
export const LET_FLY_ANGLE = 50 * DEGREE;
export const LET_FLY_SHARE = 0.1;

/**
 * The bare rig's windage (masts, yards, tops and rigging, and her hull above water) as one flat area by where the
 * air comes from, m²: seen from ahead (masts in line, yards and hull end on) and from abeam (her whole profile), blended
 * between; its height above her base, m, and its drag coefficient. What pushes her with no sail set.
 */
export const WINDAGE = { ahead: 60, abeam: 170, height: 12, drag: 1 } as const;

/**
 * Her hull going ahead, kN at a speed in m/s: `ahead` × u² × (1 + (u / hull speed)^`wave`), friction and the eddies
 * behind her growing with the square of her speed, and the waves she makes rising steeply toward `hullSpeed` (a
 * little under the 1.34 √(waterline in feet) = 13 knots of a fine hull of her 30.6 m: a full-bodied brig climbs her own
 * bow wave sooner), so in the strongest winds she tops out at 12 to 13 knots. Going astern her square stern and rudder
 * resist `astern` times as much.
 */
export const HULL_AHEAD = { ahead: 0.36, hullSpeed: 11.5 * KNOT, wave: 6, astern: 2.5 } as const;
/**
 * Her hull going sideways, kN: `linear` × |u| × v, the keel and her deep hull meeting the water at the leeway angle
 * like a low wing, and `square` × v|v|, the water's drag across her when she has no way (her lateral plane, about
 * 30 m by 3.5 m, at a drag coefficient of one). `along`: where it acts, m forward of the mainmast: a little forward of
 * her middle, where the forefoot and the leeway put a hull's centre of lateral resistance. `height`: how high, m above
 * her base (about the middle of her draught), what the sails heel her about.
 */
export const HULL_SIDEWAYS = { linear: 40, square: 55, along: 6.2, height: 2.0 } as const;
/** Her hull resisting turning, kN·m: `linear` × |u| × r and `square` × r|r| (r in rad/s), the water swept by her ends. */
export const HULL_TURNING = { linear: 3500, square: 40000 } as const;
/**
 * The water that moves with her, as a share of her mass, going ahead, sideways and turning (strip theory: a few per
 * cent ahead, near her own mass sideways); her radius of gyration in turning, a share of her waterline's length.
 */
export const ADDED_MASS = { ahead: 0.05, sideways: 0.8, turning: 0.6 } as const;
export const TURN_GYRATION = 0.25;
/**
 * How much of a real hull's skid in a turn she keeps, a share: a hull turned this tightly would slide outward and lose
 * most of her way to it. Her turns are about three times as tight as a real brig's (for pace: a tack well under a
 * minute), so the skid and the way it costs her are scaled down to what a brig's wider turn would cost.
 */
export const TURN_SKID = 0.35;

/**
 * The rudder: kN of side force per (m/s)² of her speed through the water and rad of helm, the drag it adds per
 * (m/s)² and rad², where it stands (m forward of the mainmast: her sternpost), and the most it is put over, rad
 * (beyond about 35° a rudder stalls). A rudder works only with water past it, so without way she does not answer.
 */
export const RUDDER = { lift: 18, drag: 6, along: -10.2, most: 35 * DEGREE } as const;
/** How fast the helmsman puts the helm over, rad/s (hard over from amidships in about 4 s at the wheel). */
export const HELM_RATE = 9 * DEGREE;
/**
 * The helmsman: helm in rad for each rad of heading still to go, and for each rad/s she is turning (he meets her
 * swing so she does not overshoot); within `settled` of an ordered heading a turn ordered one way is done and he
 * holds it the short way.
 */
export const HELMSMAN = { heading: 1.6, turning: 9, settled: 8 * DEGREE } as const;

/**
 * Missing stays: she is in a tack (her turn takes her through the wind's eye) and has lost her way (her speed ahead
 * down to `way`, m/s) or has begun to fall back (turning the other way faster than `rate`, rad/s). The helmsman then
 * gives up and bears away onto her old tack, `bearAway` off the wind, rad, to gather way again; with sternway he
 * shifts his helm, so she falls back the faster.
 */
export const MISSED_STAYS = { way: 0, rate: 0.2 * DEGREE, bearAway: 80 * DEGREE } as const;

/** Close-hauled: as near the wind as she sails, rad (six points: square-riggers lay about 6 points off the wind). */
export const CLOSE_HAULED = 67.5 * DEGREE;

/**
 * The ways her canvas is set for a duel, by the sails each carries (rules/rig.ts SAILS ids). Battle sail is what a
 * brig fought under: topsails, jib, fore topmast staysail and the boom sail, the courses clewed up out of the way of
 * the guns and fire. Plain sail adds the courses and topgallants; all sail sets every sail she has.
 */
export type CanvasName = 'bare' | 'battle' | 'plain' | 'all';
/** The canvas a ship starts a match under (design decision for N3: both under battle sail). */
export const START_CANVAS: CanvasName = 'battle';
export const CANVAS: Readonly<Record<CanvasName, readonly string[]>> = {
  bare: [],
  battle: ['fore-topsail', 'main-topsail', 'jib', 'fore-topmast-staysail', 'boom-sail'],
  plain: ['fore-course', 'main-course', 'fore-topsail', 'main-topsail', 'fore-topgallant', 'main-topgallant', 'jib', 'fore-topmast-staysail', 'boom-sail'],
  all: [
    'fore-course', 'main-course', 'fore-topsail', 'main-topsail', 'fore-topgallant', 'main-topgallant', 'boom-sail',
    'fore-topmast-staysail', 'jib', 'flying-jib', 'main-staysail', 'main-topmast-staysail',
  ],
};
/**
 * The crew sets canvas for the wind (seamanship about 1805): the strongest force each sail is carried in (stronger,
 * it stays furled whatever the setting), and the forces at which each of its reefs goes in. In a gale (force 8) a
 * brig lies under close-reefed topsails, the fore topmast staysail and a reefed boom sail.
 */
export const CARRIED_UP_TO: Readonly<Record<string, number>> = {
  'fore-course': 7, 'main-course': 7, 'fore-topsail': 8, 'main-topsail': 8, 'fore-topgallant': 6, 'main-topgallant': 6,
  'boom-sail': 8, 'fore-topmast-staysail': 8, 'jib': 7, 'flying-jib': 5, 'main-staysail': 7, 'main-topmast-staysail': 6,
};
export const REEF_AT: Readonly<Record<string, readonly number[]>> = {
  'fore-course': [7], 'main-course': [7], 'fore-topsail': [6, 7, 8], 'main-topsail': [6, 7, 8], 'boom-sail': [6, 7],
};

/**
 * The most she may heel from her sails, steady (averaged over the waves), rad: her lee gun ports' sills are 1.76 m
 * over the waterline (rules/ships.ts PORT), under water at about 20°; 15° keeps them clear in the roll and her lee
 * guns fighting. The sail settings and reefs above keep her within it in every preset.
 */
export const HEEL_LIMIT = 15 * DEGREE;

/**
 * The speeds she is tuned to, knots, under plain sail in a fresh breeze (force 5): by the true wind's angle off her
 * bow, degrees. Within about 60° of the wind she makes no way (55°: her sails aback, she falls astern); close-hauled,
 * six points off, about 5 knots; fastest with the wind abaft the beam on the quarter, about 11.5 knots, where the
 * apparent wind is strongest and every sail draws; running before it about 10. A first proposal for the design thread
 * ("how much pace", implementation plan N3): a brig sloop logged 10 to 11 knots at her best, so this is a little
 * quicker than she was, for pace.
 */
export const SPEED_WIND_FORCE = 5;
export const SPEED_CANVAS: CanvasName = 'plain';
export const SPEED_TABLE: readonly (readonly [angle: number, knots: number])[] = [
  [55, 0], [60, 2.5], [67.5, 5], [90, 10.2], [110, 11.5], [135, 11], [160, 10.2], [180, 10],
];
/** How far her speed may lie from the table, knots (a tuned game number, not a measurement); at no way, the most she may make. */
export const SPEED_TOLERANCE = 1;
