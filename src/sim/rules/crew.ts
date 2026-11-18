/**
 * The crew's rules (implementation plan N4.1; docs/ARCHITECTURE.md: rules as data): who is aboard a brig, the quarter
 * bill that tells each man where he stands and what part of the ship he works, the jobs an order comes to (the hands
 * each needs, the work it takes, where it is done) and how an order travels down to the men. Read by src/sim/crew/.
 *
 * **First proposals for gate G4.** The complement is the Cruizer class's 121 (ship.md); how it is split follows the
 * usual establishment of an 18-gun brig-sloop about 1805 (a commander, two lieutenants, a master, the warrant officers,
 * about twenty marines, eight boys, the rest seamen and landsmen), not one ship's muster book. The hands and seconds of
 * each job are tuned for pace (fun before realism, nauta-plan.md), so that a full crew takes about the times N3.4's
 * table gave plus the walk to the place; Arnd judges the feel at G4. Pure.
 */
import type { LineKind, YardLevel } from './rig';

/**
 * The parts a man belongs to for the ship's work: the topmen of each mast go aloft, the forecastle men work the
 * headsails and the fore braces and sheets, the afterguard the main braces, the boom sail and the staysails, the
 * waisters (landsmen) tail on wherever they are sent; the quartermasters steer; the marines haul aft. Officers,
 * idlers and boys are not sent to the ropes.
 */
export type Part = 'officers' | 'helm' | 'foretop' | 'maintop' | 'forecastle' | 'afterguard' | 'waist' | 'marines' | 'idlers' | 'boys';

/**
 * One line of the roster: a rank, how many of it, the part of the ship he works, his skill and where he stands at his
 * quarters (his post: a crew place id of the plan or the rig, the list taken in turn; `guns` gives each man his place
 * at a gun by the quarter bill, crew/roster.ts).
 */
export interface RankRow {
  readonly rank: string;
  readonly count: number;
  readonly part: Part;
  /** How much of a hand he is at the ropes: an able seaman is one, a landsman less, a boy less still. */
  readonly skill: number;
  readonly posts: readonly string[] | 'guns';
  /**
   * Where a man at no gun goes when she beats to quarters (the list taken in turn, as `posts`); `*` in a place stands
   * for the side she fights (`s` or `p`; while neither or both sides bear, the men take the sides in turn). None: his post.
   */
  readonly quarters?: readonly string[];
  /**
   * Where a man stands by while she is not at quarters, when that is not his post (the list taken in turn; design ruling
   * 2026-11-18: the quarterdeck at ease holds only the wheel, the officers, the midshipman and the sentries). None: his post.
   */
  readonly idle?: readonly string[];
}

/** A man's skill at the ropes, by what he is (hands: an able seaman is 1). */
const PETTY = 1.2;
const ABLE = 1;
const ORDINARY = 0.85;
const LANDSMAN = 0.7;
const MARINE = 0.7;
const IDLER = 0.6;
const BOY = 0.4;

/**
 * The brig's people, 121 officers, men and boys (ship.md). The captain is the player: he is on the roster and stands
 * on the quarterdeck, and is never sent. Topmen: the captain of each top and three men have their post in their top
 * (a lookout and the first to lay out), the rest stand at the guns. Marines stand along the quarterdeck rails, the
 * boys by the magazine and the hatches the powder comes up.
 */
export const ROSTER: readonly RankRow[] = [
  { rank: 'captain', count: 1, part: 'officers', skill: ABLE, posts: ['station-quarterdeck'] },
  { rank: 'first lieutenant', count: 1, part: 'officers', skill: ABLE, posts: ['station-quarterdeck'] },
  { rank: 'second lieutenant', count: 1, part: 'officers', skill: ABLE, posts: ['station-waist'], idle: ['station-bunk'] },
  { rank: 'master', count: 1, part: 'officers', skill: ABLE, posts: ['station-wheel'] },
  { rank: "master's mate", count: 1, part: 'officers', skill: ABLE, posts: ['station-wheel'], idle: ['station-bunk'] },
  { rank: 'midshipman', count: 2, part: 'officers', skill: ABLE, posts: ['station-quarterdeck', 'station-waist'], idle: ['station-quarterdeck', 'station-bunk'] },
  { rank: 'surgeon', count: 1, part: 'officers', skill: IDLER, posts: ['station-surgeon'] },
  { rank: "surgeon's mate", count: 1, part: 'officers', skill: IDLER, posts: ['station-surgeon'] },
  { rank: 'purser', count: 1, part: 'officers', skill: IDLER, posts: ['station-surgeon'] },
  { rank: "captain's clerk", count: 1, part: 'officers', skill: IDLER, posts: ['station-quarterdeck'], idle: ['station-bunk'] },
  { rank: 'gunner', count: 1, part: 'officers', skill: ABLE, posts: ['station-waist'], idle: ['station-bunk'] },
  { rank: 'boatswain', count: 1, part: 'officers', skill: ABLE, posts: ['station-quarterdeck'] },
  { rank: 'carpenter', count: 1, part: 'officers', skill: ABLE, posts: ['station-pumps'], idle: ['station-bunk'] },
  { rank: "boatswain's mate", count: 2, part: 'officers', skill: ABLE, posts: ['station-waist', 'pin-bow-pins-s6'], idle: ['station-bunk'] },
  { rank: "gunner's mate", count: 1, part: 'officers', skill: ABLE, posts: ['station-magazine'] },
  { rank: "carpenter's mate", count: 1, part: 'idlers', skill: IDLER, posts: ['station-pumps'], idle: ['station-bunk'] },
  { rank: 'quartermaster', count: 4, part: 'helm', skill: ABLE, posts: ['station-wheel'], idle: ['station-wheel', 'station-wheel', 'station-bunk'] },
  { rank: 'cook', count: 1, part: 'idlers', skill: IDLER, posts: ['ladder-fore-ladder-foot'] },
  { rank: "captain's steward", count: 1, part: 'idlers', skill: IDLER, posts: ['ladder-companion-ladder-foot'] },
  { rank: 'sailmaker', count: 1, part: 'idlers', skill: IDLER, posts: ['station-pumps'], idle: ['station-bunk'] },
  { rank: 'armourer', count: 1, part: 'idlers', skill: IDLER, posts: ['station-pumps'], idle: ['station-bunk'] },
  { rank: "carpenter's crew", count: 2, part: 'idlers', skill: IDLER, posts: ['station-pumps'], idle: ['station-bunk'] },
  // The marines (design ruling 2026-11-18: the quarterdeck is the captain's). Before quarters two sentries aft by the
  // taffrail, one at the cabin door, the rest in the waist or below on the berth deck; at quarters the two stay aft,
  // six go to the tops, six to the forecastle and five line the waist's engaged side.
  { rank: 'sergeant of marines', count: 1, part: 'marines', skill: MARINE, posts: ['station-marines-waist'], quarters: ['station-marines-*'], idle: ['station-bunk'] },
  { rank: 'corporal of marines', count: 1, part: 'marines', skill: MARINE, posts: ['station-sentries'], quarters: ['station-sentries'] },
  { rank: 'drummer', count: 1, part: 'officers', skill: MARINE, posts: ['station-quarterdeck'], idle: ['station-bunk'] },
  {
    rank: 'private of marines', count: 17, part: 'marines', skill: MARINE,
    posts: ['station-sentries', 'station-cabin-door', ...Array<string>(7).fill('station-marines-waist'), ...Array<string>(8).fill('station-marines-below')],
    idle: ['station-sentries', 'station-cabin-door', ...Array<string>(15).fill('station-bunk')],
    quarters: [
      'station-sentries', ...Array<string>(4).fill('station-marines-*'),
      'top-fore-s', 'top-fore-p', 'top-fore-s', 'top-main-s', 'top-main-p', 'top-main-s', ...Array<string>(6).fill('station-forecastle'),
    ],
  },
  { rank: 'boy', count: 8, part: 'boys', skill: BOY, posts: ['station-magazine', 'ladder-fore-ladder-head', 'ladder-after-ladder-head', 'ladder-magazine-ladder-head'], idle: ['station-magazine', 'station-bunk'] },
  { rank: 'captain of the foretop', count: 1, part: 'foretop', skill: PETTY, posts: ['top-fore-s'] },
  { rank: 'fore topman', count: 3, part: 'foretop', skill: ABLE, posts: ['top-fore-p', 'top-fore-s', 'top-fore-p'], idle: ['station-bunk'] },
  { rank: 'fore topman', count: 6, part: 'foretop', skill: ABLE, posts: 'guns', idle: ['station-bunk'] },
  { rank: 'captain of the maintop', count: 1, part: 'maintop', skill: PETTY, posts: ['top-main-s'] },
  { rank: 'main topman', count: 3, part: 'maintop', skill: ABLE, posts: ['top-main-p', 'top-main-s', 'top-main-p'], idle: ['station-bunk'] },
  { rank: 'main topman', count: 8, part: 'maintop', skill: ABLE, posts: 'guns', idle: ['station-bunk'] },
  { rank: 'captain of the forecastle', count: 1, part: 'forecastle', skill: PETTY, posts: 'guns', idle: ['station-bunk'] },
  { rank: 'forecastle man', count: 11, part: 'forecastle', skill: ABLE, posts: 'guns', idle: ['station-bunk'] },
  { rank: 'captain of the afterguard', count: 1, part: 'afterguard', skill: PETTY, posts: 'guns', idle: ['station-bunk'] },
  { rank: 'afterguard', count: 11, part: 'afterguard', skill: ORDINARY, posts: 'guns', idle: ['station-bunk'] },
  { rank: 'waister', count: 19, part: 'waist', skill: LANDSMAN, posts: 'guns', idle: ['station-bunk'] },
];

/** How many she carries (ship.md): the roster adds up to it (tested). */
export const COMPLEMENT = 121;

/**
 * The jobs an order comes to (crew/drill.ts): what each is, where it is done, how many hands it needs and how many
 * seconds of work it takes with them all there. A square sail's jobs scale with its yard (a course is the heaviest,
 * a topgallant the lightest); fore-and-aft sails are worked from the deck alone.
 * - helm: the helmsman puts the helm over, at the wheel.
 * - stations: "ready about" or "ready to wear": the hands cast off and man the braces of both masts and the headsail
 *   sheets; the helm goes over when they are ready.
 * - brace: one mast's yards swung aback or filled, at its braces.
 * - loose: a square sail's gaskets cast off by men out on its yard, and it falls to hang in its gear.
 * - sheet: a square sail sheeted home and hoisted, at its sheets, tacks and halliard.
 * - clew: a square sail clewed up, at its clewlines, clewgarnets and buntlines: it hangs in its gear and no longer draws.
 * - furl: a clewed-up square sail rolled up on its yard and its gaskets passed, by men out on the yard.
 * - reef: a reef taken in or shaken out, by men out on the yard, the sail clewed up.
 * - hoist: a headsail, staysail or the boom sail run up and sheeted, at its halliards, sheets and outhauls.
 * - douse: one hauled down or brailed in, at its downhaul or brails.
 * A sail's jobs move how far it is set (rules/rig.ts `HANGING`): loose from furled to hanging, sheet on to sheeted home,
 * clew back to hanging, furl on to furled, hoist and douse the whole way; reef leaves it hanging.
 */
export type DrillJob = 'helm' | 'stations' | 'brace' | 'loose' | 'sheet' | 'clew' | 'furl' | 'reef' | 'hoist' | 'douse';
/** Every job a man can be given: the sailing drill's (`JOBS`) and the repairs (`REPAIRS`). */
export type JobName = DrillJob | RepairName;

/** A job's hands and seconds: one number, or one per yard (a square sail's jobs). */
export type BySail = number | Readonly<Record<YardLevel, number>>;

export interface JobRow {
  readonly what: string;
  /** Hands it needs, in skill (an able seaman is one). */
  readonly hands: BySail;
  /** Seconds of work with all its hands there. */
  readonly work: BySail;
  /** The lines whose pins its men stand at (square-sail and fore-and-aft jobs), or null (helm, loose: other places). */
  readonly lines: readonly LineKind[] | null;
}

export const JOBS: Readonly<Record<DrillJob, JobRow>> = {
  helm: { what: 'the helm put over', hands: 1, work: 1.5, lines: null },
  stations: { what: 'the hands at the braces and headsail sheets', hands: 12, work: 2, lines: ['brace', 'sheet'] },
  brace: { what: "a mast's yards swung round", hands: 8, work: 8, lines: ['brace'] },
  loose: { what: 'a square sail loosed on its yard', hands: { course: 4, topsail: 4, topgallant: 2 }, work: { course: 6, topsail: 8, topgallant: 5 }, lines: null },
  sheet: { what: 'a square sail sheeted home and hoisted', hands: { course: 8, topsail: 10, topgallant: 4 }, work: { course: 6, topsail: 8, topgallant: 5 }, lines: ['sheet', 'tack', 'halliard'] },
  clew: { what: 'a square sail clewed up', hands: { course: 6, topsail: 4, topgallant: 2 }, work: { course: 6, topsail: 6, topgallant: 4 }, lines: ['clewgarnet', 'clewline', 'buntline'] },
  furl: { what: 'a square sail furled on its yard', hands: { course: 4, topsail: 4, topgallant: 2 }, work: { course: 12, topsail: 12, topgallant: 8 }, lines: null },
  reef: { what: 'a reef taken in or shaken out on the yard', hands: { course: 4, topsail: 4, topgallant: 2 }, work: { course: 12, topsail: 14, topgallant: 8 }, lines: null },
  hoist: { what: 'a fore-and-aft sail hoisted and sheeted', hands: 4, work: 5, lines: ['halliard', 'sheet', 'outhaul'] },
  douse: { what: 'a fore-and-aft sail hauled down or brailed', hands: 2, work: 4, lines: ['downhaul', 'brail'] },
};

/**
 * Who works what (the quarter bill's parts of ship), by gang: each mast's square sails and braces, the headsails, the
 * after sails (boom sail and staysails). `aloft` goes out on the yards; `deck` hauls, in the order they are sent.
 * "Ready about" takes the hands of every gang on deck. The helm is the quartermasters'; with them all down or busy the
 * nearest afterguard man takes the wheel (a shot through the wheel once left her with no one to put the helm over).
 */
export type Gang = 'fore' | 'main' | 'head' | 'after';
export const GANGS: Readonly<Record<Gang, { readonly aloft: Part | null; readonly deck: readonly Part[] }>> = {
  fore: { aloft: 'foretop', deck: ['forecastle', 'waist'] },
  main: { aloft: 'maintop', deck: ['afterguard', 'waist', 'marines'] },
  head: { aloft: null, deck: ['forecastle', 'waist'] },
  after: { aloft: null, deck: ['afterguard', 'marines'] },
};
export const STATIONS_PARTS: readonly Part[] = ['afterguard', 'forecastle', 'waist', 'marines'];
export const HELM_PARTS: readonly Part[] = ['helm', 'afterguard'];
/** The crew place a helm job is done at. */
export const WHEEL = 'station-wheel';

/**
 * Short-handed (the rule): work goes at the share of its hands that is there, by skill, and no faster than with all
 * of them (more men than a job needs do not hurry it). With half the hands a job takes twice its seconds. Below
 * FEWEST of its hands it does not move at all (one man cannot sway up a topsail yard): the men there wait for more.
 */
export const FEWEST = 0.25;

/**
 * How an order travels (docs/design/orders.md, "How an order travels"): the man it is given to hears it and passes it
 * on; the master tells the helmsman, the first lieutenant has the boatswain pipe the hands. Seconds from the order to
 * the men being told off, by who takes it (orders.ts VOCABULARY's `to`). The gunner's orders take none of the
 * sailing drill's hands (guns/gunnery.ts has the gun crews carry them out); his time is the first lieutenant's.
 */
export const PASSED: Readonly<Record<OrderTaker, number>> = { master: 1, 'first lieutenant': 2, gunner: 2, carpenter: 2 };
/** Who takes the captain's orders (orders.ts VOCABULARY's `to`). */
export type OrderTaker = 'master' | 'first lieutenant' | 'gunner' | 'carpenter';

/**
 * Choosing the men: the nearest free man of the parts a job is for goes first. Nearness is the distance in plan plus
 * the height between, a metre of height reckoned as CLIMB_METRES metres of deck (a man climbs the ratlines about a
 * third as fast as he walks, rules/routes.ts).
 */
export const CLIMB_METRES = 3;

/**
 * Sending the men: at most this many of a ship's men are sent on their way in one step. A route costs about 0.1 to
 * 0.3 ms once its place has been routed to (the first route to a new place about 1 ms, N4.2), and a duel steps two
 * ships in its 2 ms, so a big order sends its men over a few steps, as their reactions differ anyway: 2 a step is 60
 * men a second.
 */
export const SENT_PER_STEP = 2;

/**
 * The repairs and the hurt (implementation plan N6.3, design decisions for N6; first proposals, balanced in N7.5): the
 * jobs her damage gives the crew (crew/repairs.ts says when), each manned by a count of men, not by skill, and done
 * at a spot of its own (the hole, the fire, where the wounded man lies), not at a crew place.
 * - plug: a shot hole near or under the water plugged, by two of the carpenter's crew, about 45 s.
 * - fish: a wounded spar fished (one wound less), by the carpenter and his mate, when nothing leaks.
 * - splice: a cut line knotted and spliced, by the boatswain and his two mates, about 60 s.
 * - tackle: the relieving tackles rigged on the tiller when her steering is shot away, four of the helm's men (the
 *   quartermasters, the afterguard when they are down: a shot through the wheel once took all four), about 90 s.
 * - cut: a fallen spar cut away from alongside, six forecastle men with axes, about 60 s (the first lieutenant's order).
 * - pump, fight: eight men at the pumps, eight at a fire, for as long as there is water in her or the fire burns (his
 *   orders), taken from the guns by the quarter bill (`bill`: the waisters first, then the last places of each gun).
 * - fetch, carry: a badly wounded man lifted by the two nearest waisters where he lies, then carried below to the surgeon;
 *   a man killed the same, to the hold (`DEAD_ROOM`), after the wounded.
 */
export type RepairName = 'plug' | 'fish' | 'splice' | 'tackle' | 'cut' | 'pump' | 'fight' | 'fetch' | 'carry';

/** Who does a repair: men of these ranks or these parts (the nearest first), or men taken from the guns by the quarter bill. */
export type RepairHands = { readonly ranks: readonly string[] } | { readonly parts: readonly Part[] } | 'bill';

export interface RepairRow {
  readonly what: string;
  /** Men it takes (counted, not by skill), and seconds of work with them all there. */
  readonly men: number;
  readonly work: number;
  readonly who: RepairHands;
}

/** The six the quarter bill posts at the pumps: the carpenter's crew (rules above). */
export const CARPENTERS: readonly string[] = ['carpenter', "carpenter's mate", 'sailmaker', 'armourer', "carpenter's crew"];
/** The work of a job that lasts while it is needed (the pumps, a fire): it is dropped when no longer wanted, not finished. */
export const STANDING_WORK = 3600;

export const REPAIRS: Readonly<Record<RepairName, RepairRow>> = {
  plug: { what: 'a shot hole plugged', men: 2, work: 60, who: { ranks: CARPENTERS } },
  fish: { what: 'a wounded spar fished', men: 2, work: 90, who: { ranks: ['carpenter', "carpenter's mate"] } },
  splice: { what: 'a cut line knotted and spliced', men: 3, work: 60, who: { ranks: ['boatswain', "boatswain's mate"] } },
  tackle: { what: 'the relieving tackles rigged', men: 4, work: 90, who: { parts: HELM_PARTS } },
  cut: { what: 'the wreckage cut away', men: 6, work: 60, who: { parts: ['forecastle'] } },
  pump: { what: 'hands at the pumps', men: 8, work: STANDING_WORK, who: 'bill' },
  fight: { what: 'a fire fought', men: 8, work: STANDING_WORK, who: 'bill' },
  fetch: { what: 'a wounded man lifted', men: 2, work: 3, who: { parts: ['waist'] } },
  carry: { what: 'a wounded man carried below', men: 2, work: 2, who: { parts: ['waist'] } },
};

/**
 * How many plugging parties of two the carpenter's crew makes: one (the carpenter and his mate) unasked, every pair when
 * the carpenter is told to plug first or the first lieutenant's pump hands free them, none when told to pump first.
 */
export const PLUG_PARTIES = { unasked: 1, all: 3 } as const;
/** At most this many parties carry the wounded below at once; the others wait where they lie until one is free. */
export const CARRY_PARTIES = 4;
/** Holes plugged: those in her planking up to this far above her waterline (m), which her roll and the sea bring under. */
export const PLUG_ABOVE = 0.6;
/** Where the badly wounded are carried (the surgeon's station in the cockpit). */
export const SURGEON = 'station-surgeon';
/**
 * Where the killed are carried (design ruling 2026-11-18: the dead are carried below, in the match and not only drawn): to
 * the main hold, each to a place of his own on a grid this far apart (m) starting at this far along it (m, the ladder's foot).
 */
export const DEAD_ROOM = { space: 'hold', along: 3, step: 0.5 } as const;
/** Where the relieving tackles are rigged: the tiller, in the space over the rudder head (the plan's space). */
export const TILLER_SPACE = 'breadroom';

/** The parts of the ship's work in the order they are given the bunks nearest the ladders: the hands sail work and the guns call first. */
export const BUNK_PRIORITY: readonly Part[] = ['forecastle', 'afterguard', 'foretop', 'maintop', 'waist', 'helm', 'marines', 'boys', 'idlers', 'officers'];
/** The placeholder in a row's `idle` list for "a bunk": roster.ts gives each man his own. */
export const BUNK_PLACE = 'station-bunk';
