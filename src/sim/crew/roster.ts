/**
 * The brig's people and the quarter bill (pure, N4.1): every man aboard, what he is, the part of the ship he works,
 * his skill and his post (where he stands at his quarters when nothing is ordered), built once from rules/crew.ts and
 * the plan's crew places, and frozen. A man is known by his place in the roster; the crew's state (crew.ts) holds what
 * changes. The seamen of every part are shared out among the guns, pair by pair (each pair of guns, larboard and
 * starboard, has one crew, as on a ship that fights one side at a time; until she beats to quarters, N5, it stands half
 * at each gun), so a gun crew is a mix of topmen,
 * forecastle men, afterguard and waisters, and sail work takes men from the guns.
 */
import { ROSTER, type Part } from '../rules/crew';
import { deepFreeze, shipPlan, bareSpot, type CrewPlace, type Spot } from '../ship/plan';
import { rigPlan } from '../ship/rig';

/** One man of the roster. */
export interface Man {
  readonly rank: string;
  readonly part: Part;
  readonly skill: number;
  /** His post: the crew place he stands at when he has no task. */
  readonly post: string;
  /** The gun he is stationed at (its plan id), or null. */
  readonly gun: string | null;
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
  let next = 0;
  for (const row of ROSTER) {
    for (let k = 0; k < row.count; k++) {
      if (row.posts !== 'guns') {
        men.push({ rank: row.rank, part: row.part, skill: row.skill, post: row.posts[k % row.posts.length]!, gun: null });
        continue;
      }
      // Round the pairs, skipping any whose places are all taken.
      let pair = pairs[next % pairs.length]!;
      for (let tries = 0; free.get(pair)!.length === 0 && tries < pairs.length; tries++) pair = pairs[++next % pairs.length]!;
      const place = free.get(pair)!.shift();
      if (!place) throw new Error('more men posted at the guns than the guns have places');
      next++;
      men.push({ rank: row.rank, part: row.part, skill: row.skill, post: place.place, gun: place.gun });
    }
  }
  for (const m of men) placeSpot(m.post);
  built = deepFreeze(men);
  return built;
}

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
