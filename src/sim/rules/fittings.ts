/**
 * What stands on the brig and where (plan N2.6, ship.md "How she is made"): the fittings made in AssetGenerator
 * (assets/specs/prop_*.json) and the numbers that set them out on her plan. Places are as in the plan: m forward of
 * the mainmast (`along`), m from the centreline, + to starboard (`across`). sim/ship/furnish.ts reads this table.
 *
 * A model's own frame (the pack's, @futuremagic/props): metres, y up, the origin on the floor under its footprint's
 * middle, its front +z. Each row says which way its front turns on her.
 */

/**
 * The fittings' models: the spec ids in AssetGenerator, packed into public/ship/fittings.fmpk. The carronades, her
 * lanterns and the rig's small parts are drawn with her (render/ship/ship.ts, rooms.ts, rig.ts); the rest stand here.
 */
export const MODEL = {
  long6: 'prop_long_gun_6',
  wheel: 'prop_ship_wheel',
  binnacle: 'prop_binnacle',
  capstan: 'prop_capstan',
  pump: 'prop_chain_pump',
  stove: 'prop_galley_stove',
  chimney: 'prop_galley_chimney',
  bell: 'prop_ship_bell',
  cutter: 'prop_boat_cutter',
  jolly: 'prop_boat_jolly',
  gig: 'prop_boat_gig',
  gallows: 'prop_boat_gallows',
  davits: 'prop_stern_davits',
  anchor: 'prop_anchor_bower',
  garland: 'prop_shot_garland',
  rammer: 'prop_rammer_sponge',
  handspike: 'prop_handspike',
  spongeTub: 'prop_sponge_tub',
  matchTub: 'prop_match_tub',
  bucket: 'prop_fire_bucket',
  netting: 'prop_hammock_netting',
  table: 'prop_mess_table',
  chest: 'prop_sea_chest',
  cot: 'prop_cot',
  butt: 'prop_cask_butt',
  barrel: 'prop_cask_barrel',
  bitts: 'prop_bitts',
  fifeRail: 'prop_fife_rail',
} as const;
export type ModelName = (typeof MODEL)[keyof typeof MODEL];

/** A quarter and a half turn, rad. */
const QUARTER = Math.PI / 2;
const HALF = Math.PI;
/** Which way a model's front (+z) turns on her, rad about her up axis: 0 aft (+z of ship space), HALF forward, QUARTER to starboard. */
export const FACING = { aft: 0, forward: HALF, starboard: QUARTER, port: -QUARTER } as const;

/**
 * The guns stand run out, the carronade's slide pivoting at the port (the model's middle on the bulwark's inside,
 * as in the slice) and the long six's truck carriage with its front axletree against the bulwark: how far inboard
 * of the bulwark's inside each model's origin stands, m.
 */
export const GUN_INBOARD = { carronade: 0, long6: 0.36 } as const;

/**
 * The guns' gear in the gap abaft each gun's next port (ship.md: each gun has its sponge, rammer, handspike, match tub
 * and shot garland): along the bulwark's inside, m forward of the gun's middle, and how far off the bulwark.
 */
export const GUN_GEAR = {
  /** The shot garland on the deck against the waterway. */
  garland: { along: 1.2, off: 0.1 },
  /** A sponge tub or a match tub, by turns, beyond the garland. */
  tub: { along: 2.15, off: 0.32 },
  /** The rammer and sponge and the handspike on hooks on the bulwark: along, height above the deck, off the bulwark. */
  rammer: { along: 1.45, up: 0.98, off: 0.1 },
  handspike: { along: 1.45, up: 0.66, off: 0.06 },
  /** Under a pin rail the coils hang there, so the rammer and handspike lie on the deck instead, this far off the bulwark. */
  onDeck: { rammer: 0.42, handspike: 0.52 },
} as const;

/**
 * Which of the plan's fittings (rules/ships.ts FITTINGS) each model stands in the middle of, so it moves with the
 * plan: the wheel (its drum aft of its standards), the binnacle (its lights toward the helmsman), the capstan, and
 * the Brodie stove on the berth deck (its fire door aft), the galley chimney over its flue on the weather deck.
 */
export const IN_FITTING = { wheel: 'wheel', binnacle: 'binnacle', capstan: 'capstan', stove: 'stove' } as const;
/**
 * The chain pumps either side of the mainmast, in the plan's main bitts and pumps (FITTINGS): their middles, m
 * forward of the mast and from the centreline, the brakes clear of the mast, the dales running outboard.
 */
export const PUMPS = { along: 0.55, across: 0.85 } as const;
/** The bell's belfry on the forecastle, to port of the bowsprit's heel. */
export const BELFRY = { along: 16.3, across: -1.2 } as const;

/** The boats on the skids amidships (ship.md): two gallows over the main hatch's fore and after ends and forward of it, the cutter to port and the jolly boat to starboard on their chocks. */
export const SKIDS = { gallows: [2.55, 6.95], boats: 4.75, across: 0.95, chocks: 2.05 } as const;
/** The gig at the stern davits: the davits on the taffrail this far forward of her after end, the gig hanging this far under the davits' sheaves, athwart her. */
export const STERN_DAVITS = { inFromEnd: 0.32, reach: 1.87, gigBelow: 1.32 } as const;

/**
 * The bower anchors catted and fished at the catheads: the ring at the cathead's end, the shank laid aft and down
 * along her bow (lean, rad from upright), the arms athwart with the inner one on the bill board against her side:
 * where the ring hangs (m forward, m below the rail), how far the shank stands off her side (an arm's span, so the
 * inner arm just reaches her), and the anchor's own height (its ring's top above its crown).
 */
export const CATTED = { along: 18.2, out: 1.18, below: 0.28, lean: 1.2, height: 3.85 } as const;

/** Hammock nettings along her rails, both sides: from and to (m forward of the mainmast), and the length of one netting tile. */
export const NETTINGS = { aft: -11.2, fore: 16.6, tile: 2 } as const;

/** Fire buckets either side of the companion (FITTINGS: the companion, -6.65..-5.62), m across. */
export const BUCKETS = { along: -6.12, across: [0.72, 1.02] } as const;

/** The mess tables on the messdeck, athwart her between the side and the middle, slung from the beams: along her, and how far their inner ends stand from the middle. */
export const MESS_TABLES = { along: [6.85, 7.95, 9.85, 10.65], inner: 0.85 } as const;
/** How far a table's outboard end stands off her side's inside, m, at the height of its top. */
export const TABLE_OFF_SIDE = 0.12;
/** A mess table's top above the deck, m (prop_mess_table). */
export const TABLE_TOP = 0.74;

/** The officers sleep in cots slung fore and aft along the ship's side in their cabins, a sea chest under each: the cabins. */
export const COT_CABINS = ['cabin', 'master', 'surgeon', 'purser', 'lieutenant', 'second', 'gunner', 'boatswain', 'carpenter'] as const;
/** A cot's middle off her side's inside, m (half its width and a hand). */
export const COT_OFF_SIDE = 0.48;
/** The midshipmen's chests in the cockpit, m forward of the mainmast. */
export const COCKPIT_CHESTS = [4.6, 5.5] as const;

/**
 * The bitts and the fore fife rail carry the plan's fife rails (rules/ships.ts RAILS): each model's origin is under
 * the middle of its rail's front face, the side the men haul from. The rig sets the pins in them (N3.6).
 */
export const FIFE_MODELS: Readonly<Record<string, ModelName>> = { 'main-fife': 'prop_bitts', 'fore-fife': 'prop_bitts', 'fore-fife-fore': 'prop_fife_rail' };

/** The water butts in the main hold on the shingle, lying fore and aft in tiers: from and to along her, the room each takes along and across, and the tiers. */
export const HOLD_BUTTS = { aft: 1.65, fore: 11.3, along: 1.38, across: 0.9, tiers: 2 } as const;
/** The provision barrels in the fore hold, standing: from and to along her and the room each takes. */
export const HOLD_BARRELS = { aft: 11.6, fore: 14.4, pitch: 0.62 } as const;
/** A cask's height and its widest radius, m (prop_cask_butt, prop_cask_barrel). */
export const CASK = { butt: { length: 1.3, radius: 0.44 }, barrel: { length: 0.78, radius: 0.3 } } as const;
/** Casks stand clear of her inside by this much, m. */
export const CASK_CLEAR = 0.04;
/**
 * The way through the hold stays clear (N2.3, N4.2 walk there): half the width of the passage down her middle, m
 * (a man's breadth, rules/ships.ts BODY, and a hand either side), and how far the casks keep from what is in the
 * way there (a ladder's foot).
 */
export const HOLD_PASSAGE = { half: 0.4, clear: 0.1 } as const;
