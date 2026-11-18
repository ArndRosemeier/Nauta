/**
 * How the fight ends (pure, implementation plan N6.4, design decisions for N6): the one owner of `SimState.fight`
 * (rules.json `owners`). Each step, after the ships have moved, a ship is lost when she has sunk (her water at what
 * founders her), burnt out, blown up or struck her colours; the first step any ship is lost ends the fight, kept as one
 * record (who lost, how, when; both lost in one step is a draw). With neither lost when the match's time runs out, it is
 * drawn: they part at nightfall, the master warning five minutes before. Sailing out of the fight ends it too (menu.md):
 * past `PARTING.losing` apart the master says they are losing her, and `PARTING.gone` apart for a minute the ship that
 * opened the distance has broken off the action and loses, or it is drawn when both sailed apart.
 *
 * Beaten (`beaten`, with N7.5a's helpless ship) is what makes a computer captain strike (N7.1) and his first lieutenant say "We must strike, sir"
 * to a player, who is never made to: it is told as an event the step it comes true.
 *
 * The simulation goes on after the end (the ship is seen going down, N6.7); step.ts refuses every order then.
 */
import { outOf, standingNow, type Damage } from './damage';
import { founderTonnes } from './damage/flood';
import { pairOf } from './crew/roster';
import { battery, gunAt, gunCount, handsAtGuns } from './guns/guns';
import { COMPLEMENT } from './rules/crew';
import { BEATEN, BURNT, LIGHT_WARNING_MINUTES, MATCH_MINUTES, PARTING } from './rules/end';
import { FEWEST_AT_GUN } from './rules/guns';
import { shipPlan } from './ship/plan';
import type { ShipPose } from './ship/motion';
import type { SimShip } from './state';
import { apartOnWater, SECONDS_PER_MINUTE, STEPS_PER_SECOND } from './units';

/** How a ship was lost. */
export type LostHow = 'sunk' | 'burnt' | 'blew up' | 'struck' | 'broke off';

/** The end of the fight: the step it ended in and how each ship was lost (null: not lost; none lost: drawn), and whether it ended by the ships sailing apart. */
export interface FightEnd {
  readonly tick: number;
  readonly lost: readonly (LostHow | null)[];
  readonly apart: boolean;
}

/** How the fight stands (`SimState.fight`, changed only here): when the light fails, which ships are beaten, and its end. */
export interface Fight {
  /** The tick the match's time runs out (the match setting, `MATCH_MINUTES` by default). */
  readonly nightfall: number;
  /** Each ship beaten now (her first lieutenant has said so). */
  readonly beaten: readonly boolean[];
  /** The tick each ship became beaten, while she is (null: not beaten): a better computer captain fights on a little past it (N7.5a). */
  readonly beatenAt: readonly (number | null)[];
  /** Since the ships were last within `PARTING.losing` of each other: how far each has sailed away from the other, m; null while within it. */
  readonly opened: readonly number[] | null;
  /** The tick from which they have been more than `PARTING.gone` apart, or null. */
  readonly goneSince: number | null;
  /** The end, once the fight is over; null while it goes on. */
  readonly end: FightEnd | null;
}

/** What the fight did in a step, for the drawing, the sound and the interface. */
export type FightEvent =
  /** A ship is beaten: her first lieutenant says "We must strike, sir". */
  | { readonly kind: 'beaten'; readonly tick: number; readonly ship: number }
  /** The master: the light is failing, sir (five minutes to nightfall). */
  | { readonly kind: 'light'; readonly tick: number }
  /** The master: we are losing her, sir (the ships past `PARTING.losing` apart). */
  | { readonly kind: 'losing'; readonly tick: number }
  /** The fight is over. */
  | { readonly kind: 'end'; readonly tick: number; readonly lost: readonly (LostHow | null)[]; readonly apart: boolean };

const ticksOf = (minutes: number): number => Math.round(minutes * SECONDS_PER_MINUTE * STEPS_PER_SECOND);

/** A fight at its start for `ships` ships, its time `minutes` long. */
export function startFight(ships: number, minutes: number = MATCH_MINUTES): Fight {
  return {
    nightfall: ticksOf(minutes), beaten: Array.from({ length: ships }, () => false), beatenAt: Array.from({ length: ships }, () => null),
    opened: null, goneSince: null, end: null,
  };
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

/** Whether a ship can sail: some sail of hers can still draw. */
const canSail = (ship: SimShip): boolean => standingNow(ship.damage).draws.some((x) => x > 0);

/** Whether an enemy can still punish a ship that cannot sail: she can sail and has at least `BEATEN.guns` of her guns mounted. */
function canRake(enemy: SimShip): boolean {
  let mounted = 0;
  for (let i = 0; i < gunCount(enemy.guns); i++) if (!gunAt(enemy.guns, i).dismounted) mounted++;
  return mounted >= BEATEN.guns * gunCount(enemy.guns) && canSail(enemy);
}

/**
 * Whether a ship is beaten (design decisions for N6, N7.5a): `BEATEN.out` of her men killed or badly hurt; she cannot sail and
 * fewer than four gun crews can fire, or she cannot sail facing an enemy that can and has half her guns (`enemies`: the
 * other ships); or her water over two thirds of what founders her and still gaining (`was`: her damage a step before).
 */
export function beaten(ship: SimShip, was: Damage, enemies: readonly SimShip[] = []): boolean {
  const d = ship.damage;
  if (outOf(d).size >= BEATEN.out * COMPLEMENT) return true;
  if (waterIn(d) > BEATEN.water * founderTonnes() && waterIn(d) > waterIn(was)) return true;
  if (canSail(ship)) return false;
  return enemies.some(canRake) || crewsAble(ship) < BEATEN.crews;
}

/** How far a ship sailed away from the other in a step, m: her way along the line from the other to her (less than 0: toward her). */
function sailedAway(was: ShipPose, now: ShipPose, other: ShipPose): number {
  const dx = was.x - other.x, dz = was.z - other.z, d = Math.hypot(dx, dz);
  return d > 0 ? ((now.x - was.x) * dx + (now.z - was.z) * dz) / d : 0;
}

/**
 * Sailing out of the fight, one step on (two ships): what each has opened since they were last within
 * `PARTING.losing`, since when they have been past `PARTING.gone`, and, after a minute past it, how each is lost: the
 * ship that opened at least `PARTING.share` of the distance has broken off the action; none: both sailed apart.
 */
export function parting(f: Fight, before: readonly SimShip[], after: readonly SimShip[], tick: number, events: FightEvent[]): Pick<Fight, 'opened' | 'goneSince'> & { lost: (LostHow | null)[] | null } {
  if (after.length !== 2) return { opened: null, goneSince: null, lost: null };
  const was = before.map((s) => s.motion.pose), now = after.map((s) => s.motion.pose), apart = apartOnWater(now[0]!, now[1]!);
  if (apart <= PARTING.losing) return { opened: null, goneSince: null, lost: null };
  if (f.opened === null) events.push({ kind: 'losing', tick });
  const opened = now.map((p, i) => (f.opened?.[i] ?? 0) + sailedAway(was[i]!, p, was[1 - i]!));
  const goneSince = apart > PARTING.gone ? f.goneSince ?? tick : null;
  if (goneSince === null || tick - goneSince < PARTING.seconds * STEPS_PER_SECOND) return { opened, goneSince, lost: null };
  const total = opened.reduce((sum, o) => sum + Math.max(0, o), 0);
  return { opened, goneSince, lost: opened.map((o) => (o >= PARTING.share * total ? 'broke off' : null)) };
}

/**
 * The fight one step on: `before` the ships at the step's start, `after` at its end, `tick` the step's. Each ship's
 * beaten told the step it comes true; the fight ends the first step a ship is lost, when they have sailed out of the
 * fight, or at nightfall, the master warning before. Once ended it stays as it ended.
 */
export function stepFight(f: Fight, before: readonly SimShip[], after: readonly SimShip[], tick: number): { fight: Fight; events: FightEvent[] } {
  if (f.end) return { fight: f, events: [] };
  const events: FightEvent[] = [];
  const now = after.map((s, i) => beaten(s, before[i]!.damage, after.filter((_, j) => j !== i)));
  now.forEach((b, i) => { if (b && !f.beaten[i]) events.push({ kind: 'beaten', tick, ship: i }); });
  const lost = after.map(lostHow);
  const parted = parting(f, before, after, tick, events);
  let end: FightEnd | null = null;
  if (lost.some((l) => l !== null)) end = { tick, lost, apart: false };
  else if (parted.lost) end = { tick, lost: parted.lost, apart: true };
  else if (tick + 1 >= f.nightfall) end = { tick, lost, apart: false };
  else if (tick + 1 === f.nightfall - ticksOf(LIGHT_WARNING_MINUTES)) events.push({ kind: 'light', tick });
  if (end) events.push({ kind: 'end', tick, lost: end.lost, apart: end.apart });
  const changed = end !== null || now.some((b, i) => b !== f.beaten[i]) || parted.opened !== f.opened || parted.goneSince !== f.goneSince;
  const beatenAt = now.map((b, i) => (b ? (f.beaten[i] ? f.beatenAt[i] ?? tick : tick) : null));
  return { fight: changed ? { ...f, beaten: now, beatenAt, opened: parted.opened, goneSince: parted.goneSince, end } : f, events };
}

/** Whether ship `ship` was lost blown up or burnt out, in a fight that is over: she breaks up and goes down like a foundered ship (N6.7). */
export function bottomGone(f: Fight, ship: number): boolean {
  const how = f.end?.lost[ship];
  return how === 'blew up' || how === 'burnt';
}

/** The winner of an ended fight (the one ship not lost), or null: drawn, or not over. */
export function winner(f: Fight): number | null {
  if (!f.end) return null;
  const standing = f.end.lost.flatMap((l, i) => (l === null ? [i] : []));
  return standing.length === 1 && f.end.lost.some((l) => l !== null) ? standing[0]! : null;
}
