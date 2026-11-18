/**
 * The brig's people and the quarter bill (pure, N4.1): every man aboard, what he is, the part of the ship he works,
 * his skill and his post (where he stands at his quarters when nothing is ordered), built once from rules/crew.ts and
 * the plan's crew places, and frozen. A man is known by his place in the roster; the crew's state (crew.ts) holds what
 * changes. The seamen of every part are shared out among the guns, pair by pair (each pair of guns, larboard and
 * starboard, has one crew, as on a ship that fights one side at a time; it stands half at each gun until a side comes
 * to bear at quarters, `quartersPlace`), so a gun crew is a mix of topmen,
 * forecastle men, afterguard and waisters, and sail work takes men from the guns.
 */
import { BUNK_PLACE, BUNK_PRIORITY, ROSTER, type Part } from '../rules/crew';
import { BUNKS, type Bunk } from '../rules/bunks';
import { deepFreeze, shipPlan, bareSpot, type CrewPlace, type Spot } from '../ship/plan';
import { rigPlan } from '../ship/rig';
import { SIDES, sideLetter } from '../ship/spars';

/** One man of the roster. */
export interface Man {
  readonly rank: string;
  readonly part: Part;
  readonly skill: number;
  /** His post: the crew place he stands at when he has no task. */
  readonly post: string;
  /** The gun he is stationed at (its plan id), or null. */
  readonly gun: string | null;
  /** Where he goes at quarters when he is at no gun (rules/crew.ts `quarters`; `*` the side she fights), or null: his post. */
  readonly quarters: string | null;
  /** The crew place he stands by at while she is not at quarters, and where he is when he has nothing to do: his post unless his row gives him `idle`. */
  readonly home: string;
  /** His bunk, where he sleeps while he stands by (his `home` is its station), or null: he is at a post. */
  readonly bunk: Bunk | null;
  /** The two places he paces between while she is not at quarters (his `home` is the first), or null. */
  readonly paces: readonly [string, string] | null;
  /** A powder boy's number among the boys (0 up), or null: he carries cartridges to the guns at quarters (`restPlace`). */
  readonly powderBoy: number | null;
}

let places: ReadonlyMap<string, CrewPlace> | null = null;

/** Every crew place of the plan and the rig, by id. */
export function crewPlaces(): ReadonlyMap<string, CrewPlace> {
  places ??= new Map([...shipPlan().places, ...rigPlan().places].map((p) => [p.id, p]));
  return places;
}

/** A crew place's spot by id; throws for a place that does not exist (a mistake in the rules). */
export function placeSpot(id: string): Spot {
  const p = crewPlaces().get(id);
  if (!p) throw new Error(`no crew place ${id}`);
  return bareSpot(p);
}

/** The pair a gun is of (her plan id less its side's letter): each pair of guns, larboard and starboard, has one crew. */
export const pairOf = (id: string): string => id.slice(0, -1);

/**
 * The gun places in the order the quarter bill fills them: pair by pair from aft (the chase guns' pair last), each
 * pair's places taken starboard and larboard in turn, so its crew stands half at each gun.
 */
function gunPlaces(): { place: string; gun: string; pair: string }[] {
  const plan = shipPlan();
  const pairs = [...new Set(plan.guns.map((g) => pairOf(g.id)))];
  return pairs.flatMap((pair) => {
    const guns = plan.guns.filter((g) => pairOf(g.id) === pair).sort((a, b) => b.side - a.side);
    const most = Math.max(...guns.map((g) => g.crew.length));
    return Array.from({ length: most }, (_, k) => guns.flatMap((g) => (k < g.crew.length ? [{ place: `gun-${g.id}-${k + 1}`, gun: g.id, pair }] : []))).flat();
  });
}

let built: readonly Man[] | null = null;

/**
 * The brig's roster with its quarter bill, built once and frozen: every rank's men in the rules' order, each posted
 * by his row (in turn through its places), the men posted at the guns shared out among the gun pairs round and round.
 */
export function brigRoster(): readonly Man[] {
  if (built) return built;
  const atGuns = gunPlaces(), pairs = [...new Set(atGuns.map((g) => g.pair))];
  const free = new Map(pairs.map((p) => [p, atGuns.filter((g) => g.pair === p)]));
  const men: Man[] = [];
  let next = 0, boys = 0;
  // His home: the row's `idle` place in turn; a man who sleeps below has the placeholder until the bunks are shared out.
  const homeOf = (row: (typeof ROSTER)[number], k: number, post: string): { home: string; bunk: Bunk | null; paces: readonly [string, string] | null; powderBoy: number | null } => ({ home: row.paces ? row.paces[0] : row.idle ? row.idle[k % row.idle.length]! : post, bunk: null, paces: row.paces ?? null, powderBoy: row.part === 'boys' ? boys++ : null });
  for (const row of ROSTER) {
    for (let k = 0; k < row.count; k++) {
      if (row.posts !== 'guns') {
        const quarters = row.quarters ? row.quarters[k % row.quarters.length]! : null, post = row.posts[k % row.posts.length]!;
        men.push({ rank: row.rank, part: row.part, skill: row.skill, post, gun: null, quarters, ...homeOf(row, k, post) });
        continue;
      }
      // Round the pairs, skipping any whose places are all taken.
      let pair = pairs[next % pairs.length]!;
      for (let tries = 0; free.get(pair)!.length === 0 && tries < pairs.length; tries++) pair = pairs[++next % pairs.length]!;
      const place = free.get(pair)!.shift();
      if (!place) throw new Error('more men posted at the guns than the guns have places');
      next++;
      men.push({ rank: row.rank, part: row.part, skill: row.skill, post: place.place, gun: place.gun, quarters: null, ...homeOf(row, k, place.place) });
    }
  }
  // The men who sleep below take the bunks, the sail hands and the guns' men the ones nearest the ladders, then in roster order.
  const sleepers = men.flatMap((m, i) => (m.home === BUNK_PLACE ? [i] : []))
    .sort((a, b) => BUNK_PRIORITY.indexOf(men[a]!.part) - BUNK_PRIORITY.indexOf(men[b]!.part) || a - b);
  if (sleepers.length > BUNKS.length) throw new Error('more men sleep below than there are bunks');
  sleepers.forEach((i, k) => { men[i] = { ...men[i]!, home: BUNKS[k]!.station, bunk: BUNKS[k]! }; });
  for (const m of men) {
    placeSpot(m.post);
    placeSpot(m.home);
    for (const place of m.paces ?? []) placeSpot(place);
    for (const side of SIDES) if (m.quarters) placeSpot(atQuartersOf(m.quarters, side));
  }
  built = deepFreeze(men);
  return built;
}

/** A man's place at quarters at no gun (`Man.quarters`) with her fighting `side` (+1 starboard, -1 larboard). */
export const atQuartersOf = (quarters: string, side: number): string => quarters.replace('*', sideLetter(side));

/** A man's place in his gun's crew (1 the gun captain), from his post `gun-<gun>-<k>`; 0 for a man not at a gun. */
const gunPlace = (m: Man): number => (m.gun === null ? 0 : Number(m.post.slice(m.post.lastIndexOf('-') + 1)));

const bills = new WeakMap<readonly Man[], readonly number[]>();
/**
 * The men the first lieutenant takes from the guns for her life (N6.3, design decisions for N6), in the order he takes
 * them: the waisters first, then the last places of each gun's crew, the gun captains last (roster places).
 */
export function billOrder(roster: readonly Man[] = brigRoster()): readonly number[] {
  let out = bills.get(roster);
  if (out) return out;
  out = roster.flatMap((m, i) => (m.gun === null ? [] : [i]))
    .sort((a, b) => Number(roster[b]!.part === 'waist') - Number(roster[a]!.part === 'waist') || gunPlace(roster[b]!) - gunPlace(roster[a]!) || a - b);
  bills.set(roster, out);
  return out;
}

const atQuarters = new WeakMap<readonly Man[], Map<string, string | null>>();
/**
 * Where a gun's man stands at quarters with his pair's crew all on `side` (+1 starboard, -1 larboard): one crew serves
 * a pair of guns (orders.md). The men posted at that side's gun stay at their posts; the men posted at the other gun
 * take that gun's places after theirs in turn (more men than places double up from the first). Null for a man at no
 * gun, or at a chase port's (it serves no gun).
 */
export function quartersPlace(man: number, side: number, roster: readonly Man[] = brigRoster()): string | null {
  let kept = atQuarters.get(roster);
  if (!kept) { kept = new Map(); atQuarters.set(roster, kept); }
  const key = `${man}${sideLetter(side)}`;
  let out = kept.get(key);
  if (out !== undefined) return out;
  out = null;
  const m = roster[man]!;
  const id = m.gun === null ? '' : `${pairOf(m.gun)}${sideLetter(side)}`, gun = shipPlan().guns.find((g) => g.id === id);
  if (gun && !gun.chase) {
    if (m.gun === id) out = m.post;
    else {
      const here = roster.filter((o) => o.gun === id).length;
      const crossing = roster.flatMap((o, i) => (o.gun !== null && o.gun !== id && pairOf(o.gun) === pairOf(id) ? [i] : []));
      out = `gun-${id}-${((here + crossing.indexOf(man)) % gun.crew.length) + 1}`;
    }
  }
  kept.set(key, out);
  return out;
}
