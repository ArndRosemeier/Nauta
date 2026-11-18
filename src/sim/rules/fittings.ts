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
  /**
   * A sponge tub or a match tub, by turns, beyond the garland. Where it would stand on a pin rail's hauling place
   * (rules/ships.ts RAILS: the men stand a stride inboard of the pins), it stands `inboard` off the bulwark in the
   * middle of the gap instead, between the two guns' crews, its narrow side along her.
   */
  tub: { along: 2.15, off: 0.32, inboard: 1.35 },
  /** The rammer and sponge and the handspike on hooks on the bulwark: along, height above the deck, off the bulwark. */
  rammer: { along: 1.45, up: 0.98, off: 0.1 },
  handspike: { along: 1.45, up: 0.66, off: 0.06 },
  /** Under a pin rail the coils hang there, so the rammer and handspike lie on the deck instead, this far off the bulwark. */
  onDeck: { rammer: 0.42, handspike: 0.52 },
} as const;

/**
 * Where the helm, the capstan and the galley stand on her centreline, m forward of the mainmast: the wheel (its drum
 * aft of its standards), the binnacle (its lights toward the helmsman), the capstan, and the Brodie stove on the berth
 * deck (its fire door aft) with the galley chimney over its flue on the weather deck. What is in the way there is the
 * models' own room (SOLID), so the plan keeps no oblong for them.
 */
export const ON_CENTRELINE = { wheel: -8.65, binnacle: -7.95, capstan: -3.775, stove: 12.1 } as const;
/**
 * The chain pumps side by side just forward of the mainmast's partners: their middles, m forward of the mast and from
 * the centreline, the dales running outboard. Here they leave the gangway between them and the guns at the D ports a
 * man's passage (ship.md "Fittings are solid too"); abreast the mast they closed it.
 */
export const PUMPS = { along: 1.05, across: 0.7 } as const;
/**
 * The bell's belfry on the forecastle, to port of the bowsprit's heel, turned athwart with its face inboard: so it
 * leaves the way beside the bowsprit and the long six's crew their places (m forward, m across).
 */
export const BELFRY = { along: 16.32, across: -1.15 } as const;

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
/**
 * The hammocks in the nettings (Arnd, 2026-11-18: the view from her deck comes first): the nettings stand empty, the
 * cranes and their ropes only, and the men's hammocks are stowed in them when she beats to quarters, a breastwork
 * against small shot. The netting model's material slot that is the stowed hammocks under their cloth.
 */
export const HAMMOCK_SLOT = 'cloth';
/**
 * The waist's nettings, where the hammocks are stowed at quarters to shelter the gun crews, m forward of the mainmast:
 * between the quarterdeck's break and the forecastle's (ship.md, "The view from the deck"). The rails of the raised
 * decks stay open at all times, so the captain's view from where he commands is never walled in.
 */
export const HAMMOCK_WAIST = { aft: -1.3, fore: 13.9 } as const;

/** Fire buckets either side of the companion (FITTINGS: the companion, -6.65..-5.62), m across. */
export const BUCKETS = { along: -6.45, across: [0.72, 1.02] } as const;

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

/** A box a model fills, in its own frame (m; y up from its origin on the floor, its front +z): from and to on each axis. */
export interface SolidPart {
  readonly x: readonly [number, number];
  readonly y: readonly [number, number];
  readonly z: readonly [number, number];
}
/** A model that is one box from its origin's floor: as wide (x), high (y) and deep (z) as given, from and to. */
const box = (x: number, y: number, z0: number, z1 = -z0, y0 = 0): readonly SolidPart[] => [{ x: [-x, x], y: [y0, y], z: [z0, z1] }];

/**
 * The room each model takes where it stands (ship.md "Fittings are solid too"), so the walk graph and the crew's
 * routes know it without the models: boxes in the model's frame, held to the built models' bounds by
 * test/furnish.test.ts. furnish.ts turns them with the fitting and sorts them by height over the floor: under
 * BODY.stepUp stepped over, from the floor up into a man's way walked round, over the least headroom stooped under.
 * The boat gallows is three parts: its feet on the deck, its two posts, and its cross-piece with the arms the boats'
 * chocks rest on, which a man passes under. The anchors hang outside her and take no room in her.
 */
export const SOLID: Readonly<Record<ModelName, readonly SolidPart[]>> = {
  prop_long_gun_6: box(0.44, 0.92, -1.17),
  prop_ship_wheel: box(0.71, 1.7, -0.38),
  prop_binnacle: box(0.31, 1.11, -0.18),
  prop_capstan: box(0.52, 1.03, -0.52),
  prop_chain_pump: box(0.63, 1.18, -0.62),
  prop_galley_stove: box(0.6, 1.92, -0.44),
  prop_galley_chimney: box(0.3, 1.11, -0.31),
  prop_ship_bell: box(0.38, 1.18, -0.15),
  prop_boat_cutter: box(0.93, 1.05, -2.81),
  prop_boat_jolly: box(0.88, 0.98, -2.5),
  prop_boat_gig: box(0.75, 0.9, -3.11),
  prop_boat_gallows: [
    { x: [-1.44, 1.44], y: [0, 0.2], z: [-0.08, 0.08] },
    { x: [-1.26, -0.98], y: [0, 1.7], z: [-0.12, 0.12] },
    { x: [0.98, 1.26], y: [0, 1.7], z: [-0.12, 0.12] },
    { x: [-1.9, 1.9], y: [1.7, 2.19], z: [-0.12, 0.12] },
  ],
  prop_stern_davits: box(1.44, 0.76, -0.62, 1.9, -0.28),
  // Catted and fished outboard of her bow: in no one's way (its box, turned, would reach in over the forecastle).
  prop_anchor_bower: [],
  prop_shot_garland: box(0.62, 0.2, -0.08),
  prop_rammer_sponge: box(0.08, 0.16, -1),
  prop_handspike: box(0.03, 0.07, -0.77),
  prop_sponge_tub: box(0.29, 0.46, -0.24),
  prop_match_tub: box(0.2, 0.58, -0.2),
  prop_fire_bucket: box(0.14, 0.48, -0.14),
  prop_hammock_netting: box(0.2, 0.53, -1),
  prop_mess_table: box(0.63, 1.6, -0.75),
  prop_sea_chest: box(0.52, 0.46, -0.25),
  prop_cot: box(0.38, 1.6, -0.99, 0.99, 0.55),
  prop_cask_butt: box(0.44, 1.3, -0.43),
  prop_cask_barrel: box(0.3, 0.78, -0.29),
  prop_bitts: box(1.2, 1.12, -0.37, 0.01),
  prop_fife_rail: box(0.8, 0.9, -0.14, 0.01),
};
/** Gear keeps this much more than half a man's passage (rules/ships.ts LEAST_PASSAGE) from where a man stands to work, m. */
export const GEAR_CLEAR = 0.1;
/** Casks stowed this close together are one stow in the way, m (they touch, in their tiers and rows). */
export const STOW_GAP = 0.05;
