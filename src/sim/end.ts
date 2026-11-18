/**
 * How the fight ends (pure, implementation plan N6.4, design decisions for N6): the one owner of `SimState.fight`
 * (rules.json `owners`). Each step, after the ships have moved, a ship is lost when she has sunk (her water at what
 * founders her), burnt out, blown up or struck her colours; the first step any ship is lost ends the fight, kept as one
 * record (who lost, how, when; both lost in one step is a draw). With neither lost when the match's time runs out, it is
 * drawn: they part at nightfall, the master warning five minutes before.
 *
 * Beaten (`beaten`) is what makes a computer captain strike (N7.1) and his first lieutenant say "We must strike, sir"
 * to a player, who is never made to: it is told as an event the step it comes true.
 *
 * The simulation goes on after the end (the ship is seen going down, N6.7); step.ts refuses every order then.
 */
import { outOf, standingNow, type Damage } from './damage';
import { founderTonnes } from './damage/flood';
import { pairOf } from './crew/roster';
import { battery, gunAt, handsAtGuns } from './guns/guns';
import { COMPLEMENT } from './rules/crew';
import { BEATEN, BURNT, LIGHT_WARNING_MINUTES, MATCH_MINUTES } from './rules/end';
import { FEWEST_AT_GUN } from './rules/guns';
import { shipPlan } from './ship/plan';
import type { SimShip } from './state';
import { SECONDS_PER_MINUTE, STEPS_PER_SECOND } from './units';

/** How a ship was lost. */
export type LostHow = 'sunk' | 'burnt' | 'blew up' | 'struck';

/** The end of the fight: the step it ended in and how each ship was lost (null: not lost; none lost: drawn). */
export interface FightEnd {
  readonly tick: number;
  readonly lost: readonly (LostHow | null)[];
}

/** How the fight stands (`SimState.fight`, changed only here): when the light fails, which ships are beaten, and its end. */
export interface Fight {
  /** The tick the match's time runs out (the match setting, `MATCH_MINUTES` by default). */
  readonly nightfall: number;
  /** Each ship beaten now (her first lieutenant has said so). */
  readonly beaten: readonly boolean[];
  /** The end, once the fight is over; null while it goes on. */
  readonly end: FightEnd | null;
}

/** What the fight did in a step, for the drawing, the sound and the interface. */
export type FightEvent =
  /** A ship is beaten: her first lieutenant says "We must strike, sir". */
  | { readonly kind: 'beaten'; readonly tick: number; readonly ship: number }
  /** The master: the light is failing, sir (five minutes to nightfall). */
  | { readonly kind: 'light'; readonly tick: number }
  /** The fight is over. */
  | { readonly kind: 'end'; readonly tick: number; readonly lost: readonly (LostHow | null)[] };

const ticksOf = (minutes: number): number => Math.round(minutes * SECONDS_PER_MINUTE * STEPS_PER_SECOND);

/** A fight at its start for `ships` ships, its time `minutes` long. */
export function startFight(ships: number, minutes: number = MATCH_MINUTES): Fight {
  return { nightfall: ticksOf(minutes), beaten: Array.from({ length: ships }, () => false), end: null };
}

/** The water in her, t. */
export const waterIn = (d: Damage): number => d.flooded[0] + d.flooded[1];

/** The spaces below her weather deck (plan places) and the room by the magazine. */
let below: { readonly spaces: ReadonlySet<number>; readonly room: number } | null = null;
function burningRooms(): NonNullable<typeof below> {
  if (below) return below;
  const spaces = shipPlan().spaces;
  below = { spaces: new Set(spaces.flatMap((s, i) => (s.level === 'weather' ? [] : [i]))), room: spaces.findIndex((s) => s.id === BURNT.room) };
  return below;
}

/** Whether her fire is past saving: three or more spaces below at over half, or the room by the magazine wholly alight. */
export function burntOut(d: Damage): boolean {
  if (d.fires.length === 0) return false;
  const b = burningRooms();
  return d.fires.filter((f) => b.spaces.has(f.space) && f.size > BURNT.size).length >= BURNT.spaces || d.fires.some((f) => f.space === b.room && f.size >= BURNT.whole);
}

/** How a ship is lost now, or null: blown up, sunk, burnt out, struck (in that order, if more than one holds). */
export function lostHow(ship: SimShip): LostHow | null {
  const d = ship.damage;
  if (d.blownUp) return 'blew up';
  if (waterIn(d) >= founderTonnes()) return 'sunk';
  if (burntOut(d)) return 'burnt';
  return ship.told.struck ? 'struck' : null;
}

/** How many gun crews can fire: pairs with a mounted gun and at least `FEWEST_AT_GUN` of their men there and fit. */
function crewsAble(ship: SimShip): number {
  const places = battery(), men = handsAtGuns(ship.crew, undefined, outOf(ship.damage)), pairs = new Map<string, { mounted: boolean; men: number }>();
  places.forEach((g, i) => {
    const p = pairs.get(pairOf(g.id)) ?? { mounted: false, men: 0 };
    pairs.set(pairOf(g.id), { mounted: p.mounted || !gunAt(ship.guns, i).dismounted, men: p.men + men[i]! });
  });
  return [...pairs.values()].filter((p) => p.mounted && p.men >= FEWEST_AT_GUN).length;
}

/**
 * Whether a ship is beaten (design decisions for N6): half her men killed or badly hurt; she cannot sail and fewer than
 * four gun crews can fire; or her water over two thirds of what founders her and still gaining (`was`: her damage a step
 * before).
 */
export function beaten(ship: SimShip, was: Damage): boolean {
  const d = ship.damage;
  if (outOf(d).size >= BEATEN.out * COMPLEMENT) return true;
  if (waterIn(d) > BEATEN.water * founderTonnes() && waterIn(d) > waterIn(was)) return true;
  const sails = standingNow(d).draws.every((x) => x === 0);
  return sails && crewsAble(ship) < BEATEN.crews;
}

/**
 * The fight one step on: `before` the ships at the step's start, `after` at its end, `tick` the step's. Each ship's
 * beaten told the step it comes true; the fight ends the first step a ship is lost, or at nightfall, the master
 * warning before. Once ended it stays as it ended.
 */
export function stepFight(f: Fight, before: readonly SimShip[], after: readonly SimShip[], tick: number): { fight: Fight; events: FightEvent[] } {
  if (f.end) return { fight: f, events: [] };
  const events: FightEvent[] = [];
  const now = after.map((s, i) => beaten(s, before[i]!.damage));
  now.forEach((b, i) => { if (b && !f.beaten[i]) events.push({ kind: 'beaten', tick, ship: i }); });
  const lost = after.map(lostHow);
  let end: FightEnd | null = null;
  if (lost.some((l) => l !== null) || tick + 1 >= f.nightfall) end = { tick, lost };
  else if (tick + 1 === f.nightfall - ticksOf(LIGHT_WARNING_MINUTES)) events.push({ kind: 'light', tick });
  if (end) events.push({ kind: 'end', tick, lost });
  const changed = end !== null || now.some((b, i) => b !== f.beaten[i]);
  return { fight: changed ? { ...f, beaten: now, end } : f, events };
}

/** The winner of an ended fight (the one ship not lost), or null: drawn, or not over. */
export function winner(f: Fight): number | null {
  if (!f.end) return null;
  const standing = f.end.lost.flatMap((l, i) => (l === null ? [i] : []));
  return standing.length === 1 && f.end.lost.some((l) => l !== null) ? standing[0]! : null;
}
