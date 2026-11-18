/**
 * What the crew does for her life (pure, implementation plan N6.3, design decisions for N6): from her damage, what she
 * has been told and where her men are, the repairs wanted now, in the order they are manned. The crew (crew.ts) makes
 * a task of each, keeps it while it is still wanted and gives back the ones finished; damage.ts mends them. Nothing
 * here changes anything.
 *
 * **Unasked**, the carpenter and his mate plug the holes near or under the water, the deepest first (the rest of his
 * crew pumps, being at the pumps by the quarter bill), and when nothing leaks fish the spar part with the most wounds;
 * the boatswain and his mates knot and splice cut lines, the standing rigging that holds a spar first; the
 * quartermasters rig the relieving tackles when her steering is shot away; and each badly wounded man is carried below
 * by the two nearest waisters, at most `CARRY_PARTIES` at once, the rest waiting where they lie. The killed stay where
 * they fell.
 *
 * **On order**, once the order has come down to the men (rules/crew.ts `PASSED`): hands to the pumps (eight men from
 * the guns while there is water in her or a hole leaks; it frees the carpenter's whole crew to plug), fire party
 * (eight men a fire, the fire nearest the magazine first), clear the wreckage (six forecastle men, one fall at a
 * time). The carpenter's orders set whether all his crew plugs first or pumps first.
 *
 * A repair under way is kept before a new one of its kind is chosen, so men are not sent from one hole to the next.
 */
import { openHoles, standingNow, type Damage } from '../damage';
import { lostWith, sparOfPart } from '../damage/fall';
import { magazineSpace, spaceAt } from '../damage/fire';
import { sparParts } from '../damage/meet';
import type { ShipOrders } from '../orders';
import { CARRY_PARTIES, PASSED, PLUG_ABOVE, PLUG_PARTIES, SURGEON, TILLER_SPACE, type OrderTaker, type RepairName } from '../rules/crew';
import { HARMS, PUMPING, PUMP_POST } from '../rules/damage';
import { LOAD_WATERLINE } from '../rules/ships';
import { rectCentre, shipPlan, spacesById, type Spot } from '../ship/plan';
import { rigPlan } from '../ship/rig';
import { STEPS_PER_SECOND } from '../units';
import { manAt, NO_ACT, sameSpot, type Crew, type Repair } from './crew';
import { nodeOfSpot, routeNetwork } from './network';
import { brigRoster, crewPlaces, placeSpot, type Man } from './roster';

/** Nothing wanted. */
const NONE: readonly Repair[] = Object.freeze([]);

/** How far in from a space's sides a repair's spot is put (m); from there the nearest spot a man can stand on is looked for, this far apart and at most this far off (m). */
const INSET = 0.4;
const SEARCH_STEP = 0.5;
const SEARCH_REACH = 3;
/** A hole's space is looked for this share of the way in from her side (the spaces stop at her inside). */
const HOLE_INWARD = 0.8;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** The offsets tried round a spot, nearest first (along, across, m). */
const OFFSETS: readonly (readonly [number, number])[] = (() => {
  const n = Math.round(SEARCH_REACH / SEARCH_STEP), out: [number, number][] = [];
  for (let a = -n; a <= n; a++) for (let x = -n; x <= n; x++) out.push([a * SEARCH_STEP, x * SEARCH_STEP]);
  return out.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]) || p[0] - q[0] || p[1] - q[1]);
})();

/** A spot in a space where a man can stand, as near as may be to `along`, `across` (kept inside its sides); its middle if none is near. */
function reach(id: string, along: number, across: number): Spot {
  const space = spacesById(shipPlan()).get(id)!, net = routeNetwork();
  const a = clamp(along, space.aft + INSET, space.fore - INSET), x = clamp(across, space.port + INSET, space.starboard - INSET);
  for (const [da, dx] of OFFSETS) {
    const spot = { space: id, along: clamp(a + da, space.aft, space.fore), across: clamp(x + dx, space.port, space.starboard) };
    if (nodeOfSpot(net, spot, []) >= 0) return spot;
  }
  return { space: id, ...rectCentre(space) };
}

/** Spots worked out once each (they follow from the hole, the space, the spar part, the line alone). */
const spots = new Map<string, Spot>();
const kept = (key: string, find: () => Spot): Spot => {
  let s = spots.get(key);
  if (!s) { s = find(); spots.set(key, s); }
  return s;
};

/** Where a hole is plugged: inside her by it, in the space it opens into. */
function holeSpot(code: number, at: readonly [number, number, number]): Spot {
  return kept(`hole:${code}`, () => {
    let space = spaceAt([at[0], at[1] * HOLE_INWARD, at[2]]);
    if (space < 0) space = spaceAt([at[0], 0, at[2]]);
    return reach(space < 0 ? 'deck' : shipPlan().spaces[space]!.id, at[0], at[1]);
  });
}
/** Where a fire is fought: in the middle of its space. */
const fireSpot = (space: number): Spot => kept(`fire:${space}`, () => {
  const s = shipPlan().spaces[space]!, c = rectCentre(s);
  return reach(s.id, c.along, c.across);
});
/** Where a spar is fished: on deck at its heel. */
const fishSpot = (part: number): Spot => kept(`fish:${part}`, () => reach('deck', sparParts()[part]!.from[0], 0));
/** Where a line is spliced: at its pin, or on deck under its lower end. */
const spliceSpot = (line: number): Spot => kept(`splice:${line}`, () => {
  const l = rigPlan().lines[line]!, pin = l.belay ? `pin-${l.belay}` : null;
  if (pin && crewPlaces().has(pin)) return placeSpot(pin);
  return reach('deck', l.ends[1].along, l.ends[1].across);
});
/** Where wreckage is cut away: at her rail over the side it lies on, by where it broke. */
const cutSpot = (code: number): Spot => kept(`cut:${code}`, () => {
  const part = Math.floor(code / 2), side = code % 2 === 1 ? 1 : -1, s = spacesById(shipPlan()).get('deck')!;
  return reach('deck', sparParts()[part]!.from[0], side * Math.max(-s.port, s.starboard));
});
/** Where the relieving tackles are rigged: at the tiller. */
const tillerSpot = (): Spot => kept('tiller', () => {
  const s = spacesById(shipPlan()).get(TILLER_SPACE)!, c = rectCentre(s);
  return reach(TILLER_SPACE, c.along, c.across);
});

/** Whether an order given in tick `given` (null: never) has come down to the men by `tick`. */
const passed = (given: number | null, taker: OrderTaker, tick: number): boolean => given !== null && tick >= given + Math.round(PASSED[taker] * STEPS_PER_SECOND);

/** The things of a kind wanted, at most `limit`: those under way first (in the order wanted), then the next in order. */
function pick(crew: Crew, jobs: readonly RepairName[], ordered: readonly number[], limit: number): number[] {
  const under = new Set(crew.tasks.flatMap((t) => (t.act === NO_ACT && jobs.includes(t.job as RepairName) ? [t.on] : [])));
  return [...ordered.filter((x) => under.has(x)), ...ordered.filter((x) => !under.has(x))].slice(0, limit);
}

/** Whether a man lies below with the surgeon: carried there, or posted there. */
function below(crew: Crew, man: number, roster: readonly Man[]): boolean {
  const h = crew.men[man]!;
  return !h.going && sameSpot(h.stands ?? placeSpot(roster[man]!.home), placeSpot(SURGEON));
}

/** A ship nothing has struck: nothing to repair. */
const unhurt = (d: Damage): boolean => d.holes.length === 0 && d.cut.length === 0 && d.wounds.length === 0 && d.steering && d.alongside.length === 0
  && d.fires.length === 0 && d.hurt.length === 0 && d.flooded[0] + d.flooded[1] === 0;

/** The repairs wanted now on a ship with damage `d`, told `told`, her crew as it stands, in the order they are manned. */
export function repairsDue(d: Damage, told: ShipOrders, crew: Crew, tick: number, roster: readonly Man[] = brigRoster()): readonly Repair[] {
  if (unhurt(d)) return NONE;
  const out: Repair[] = [];

  // Her steering shot away: the relieving tackles.
  if (!d.steering) out.push({ job: 'tackle', on: 0, at: tillerSpot() });

  // The holes near and under the water, deepest first, by as many parties of the carpenter's crew as he can spare.
  const leaking = openHoles(d).filter((h) => h.at[2] < LOAD_WATERLINE + PLUG_ABOVE).sort((p, q) => p.at[2] - q.at[2] || p.code - q.code);
  const pumpsManned = passed(told.pumps, 'first lieutenant', tick);
  const parties = told.carpenter === 'pump' && !pumpsManned ? 0 : told.carpenter === 'plug' || pumpsManned ? PLUG_PARTIES.all : PLUG_PARTIES.unasked;
  const byCode = new Map(leaking.map((h) => [h.code, h]));
  for (const code of pick(crew, ['plug'], leaking.map((h) => h.code), parties)) out.push({ job: 'plug', on: code, at: holeSpot(code, byCode.get(code)!.at) });

  // The first lieutenant's parties.
  if (pumpsManned && (d.flooded[0] + d.flooded[1] > PUMPING.least || leaking.length > 0)) out.push({ job: 'pump', on: 0, at: placeSpot(PUMP_POST) });
  if (passed(told.fires, 'first lieutenant', tick) && d.fires.length > 0) {
    // One fire party: at the fire it fights until that is out, then the fire nearest the magazine fore and aft (the
    // spaces round it burn toward it). A fire it cannot beat down holds it there while the fires it spreads to grow,
    // the magazine's too (N7.5a: a fire that takes hold burns her, or blows her up).
    const spaces = shipPlan().spaces, magazine = rectCentre(spaces[magazineSpace()]!).along;
    const far = (space: number) => Math.abs(rectCentre(spaces[space]!).along - magazine);
    const burning = d.fires.map((f) => f.space).sort((p, q) => far(p) - far(q) || p - q);
    for (const space of pick(crew, ['fight'], burning, 1)) out.push({ job: 'fight', on: space, at: fireSpot(space) });
  }
  if (passed(told.wreckage, 'first lieutenant', tick)) for (const code of pick(crew, ['cut'], d.alongside, 1)) out.push({ job: 'cut', on: code, at: cutSpot(code) });

  // Cut lines that would hold something again, the standing rigging that holds a spar first.
  if (d.cut.length > 0) {
    const standing = standingNow(d), lines = rigPlan().lines;
    const holding = (l: number) => (lines[l]!.standing && lines[l]!.act === 'holds' ? 0 : 1);
    const worth = d.cut.filter((l) => !lostWith(standing, l)).sort((p, q) => holding(p) - holding(q) || p - q);
    for (const line of pick(crew, ['splice'], worth, 1)) out.push({ job: 'splice', on: line, at: spliceSpot(line) });
  }

  // Nothing leaking: the spar part nearest to breaking fished.
  if (leaking.length === 0 && d.wounds.length > 0) {
    const down = standingNow(d).down, count = new Map<number, number>();
    for (const w of d.wounds) if (!down[sparOfPart(w)]) count.set(w, (count.get(w) ?? 0) + 1);
    const worst = [...count].sort((p, q) => q[1] - p[1] || p[0] - q[0]).map(([part]) => part);
    for (const part of pick(crew, ['fish'], worst, 1)) out.push({ job: 'fish', on: part, at: fishSpot(part) });
  }

  // The badly wounded carried below, as many at once as there are parties.
  const badly = HARMS.indexOf('badly');
  const wounded = d.hurt.flatMap((h) => { const man = Math.floor(h / HARMS.length); return h % HARMS.length === badly && !below(crew, man, roster) ? [man] : []; });
  for (const man of pick(crew, ['fetch', 'carry'], wounded, CARRY_PARTIES)) out.push({ job: 'fetch', on: man, at: manAt(crew.men[man]!, roster[man]!.home).spot });

  return out.length > 0 ? out : NONE;
}
