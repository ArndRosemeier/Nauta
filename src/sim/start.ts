/**
 * Where a duel starts (implementation plan N3, design decision "The start", by time since N7.5a): the two ships as far
 * apart as they close in three minutes in that wind (rules/start.ts), with the wind on the beam of the line between them, each under battle sail and steering at the other, so neither has the weather
 * position. The match's seed turns the whole picture round the compass and picks the force (2 to 6). Pure: the same
 * seed gives the same start on every machine.
 */
import { deriveSeed, Rng } from '@futuremagic/core';
import { START_CANVAS } from './rules/sailing';
import { START_CLOSING, START_MINUTES, START_WAY, WEATHER_TURN_DEGREES, WIND_CHOICES } from './rules/start';
import { DUEL_FORCES } from './rules/wind';
import type { MatchSetup } from './state';
import { bearingDir, DEGREE, KNOT, SECONDS_PER_MINUTE, wrapBearing } from './units';

/** A quarter turn, rad: the wind stands square to the line between the ships. */
const QUARTER = Math.PI / 2;

/** How far apart the ships start in a wind of `force`, m: what they close in `START_MINUTES` under battle sail. */
export const startApart = (force: number): number => START_CLOSING[force]! * START_MINUTES * SECONDS_PER_MINUTE;

/** The wind a match is set to (menu.md): as the seed draws it, or a force drawn within a named range. */
export type WindChoice = 'drawn' | keyof typeof WIND_CHOICES;
export const WIND_CHOICE_NAMES: readonly WindChoice[] = ['drawn', 'light', 'fresh', 'strong'];
/** How the ships meet (menu.md): on even terms, the first ship holding the weather position, or the second. */
export type Meeting = 'even' | 'weather' | 'lee';
export const MEETINGS: readonly Meeting[] = ['even', 'weather', 'lee'];

/**
 * Where a ship is put by hand (the scenario's placement map): her centre in metres (x east, z south) and her heading
 * (compass bearing, rad) in the wind's frame, the picture with the wind coming from the north. The match turns the
 * whole picture round to the wind its seed blows, so a placement keeps its place against the wind.
 */
export interface Placed {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

/** The terms a duel's start is made with besides its seed; each missing one is the duel's own. */
export interface StartTerms {
  readonly wind?: WindChoice;
  readonly meet?: Meeting;
  /** Ships put by hand, by the match's ship order (null: where the start puts her). */
  readonly placed?: readonly (Placed | null)[];
}

/** The wind's force for `choice`, drawn from the seed within its range; `drawn`: the start's own. */
function forceFor(seed: number, choice: WindChoice, drawn: number): number {
  if (choice === 'drawn') return drawn;
  const range = WIND_CHOICES[choice];
  return new Rng(deriveSeed(seed, 'start-wind')).int(range.least, range.most);
}

/** The picture a start is made in: the wind, and the line between the first two sides (bearing, with the unit steps along it and half the distance they start apart). */
function frameAt(square: number, windForce: number, terms: StartTerms) {
  // The line from the first ship to the second, square to the seed's wind: each heads at the other with the wind abeam.
  const line = wrapBearing(square - QUARTER), [dx, dz] = bearingDir(line), half = startApart(windForce) / 2;
  // Turned toward the first ship (from behind her beam) when she holds the weather position, toward the second when she does.
  const turn = terms.meet === 'weather' ? WEATHER_TURN_DEGREES * DEGREE : terms.meet === 'lee' ? -WEATHER_TURN_DEGREES * DEGREE : 0;
  return { windForce, windFrom: turn === 0 ? square : wrapBearing(square + turn), line, dx, dz, half };
}

function startFrame(seed: number, terms: StartTerms) {
  const rng = new Rng(deriveSeed(seed, 'start'));
  const square = rng.range(0, 2 * Math.PI), windForce = forceFor(seed, terms.wind ?? 'drawn', rng.int(DUEL_FORCES.least, DUEL_FORCES.most));
  return frameAt(square, windForce, terms);
}

const underWay = (x: number, z: number, heading: number) => ({ x, z, heading: wrapBearing(heading), speed: START_WAY * KNOT, canvas: START_CANVAS });
type Under = ReturnType<typeof underWay>;

/** A point turned about the middle by `turn` rad of bearing (a bearing grows clockwise: x east, z south). */
function turned(x: number, z: number, turn: number): [number, number] {
  const c = Math.cos(turn), s = Math.sin(turn);
  return [x * c - z * s, z * c + x * s];
}

/** The ships as the placement map put them (wind frame) turned round to the wind the match has; ships it left alone stay where the start put them. */
function placedBy(ships: readonly Under[], windFrom: number, placed: StartTerms['placed']): Under[] {
  if (!placed || placed.every((p) => p === null || p === undefined)) return [...ships];
  return ships.map((s, i) => {
    const p = placed[i];
    if (!p) return s;
    const [x, z] = turned(p.x, p.z, windFrom);
    return underWay(x, z, p.heading + windFrom);
  });
}

/**
 * The setup of a duel from its seed: the wind's bearing and force, and the two ships on the line square to it. With
 * `terms`, the force drawn within the chosen wind's range, and the wind turned toward the ship that holds the weather
 * position (the line between them stays where the seed put it, so the ships still close), and ships put by hand where
 * they were put.
 */
export function duelStart(seed: number, terms: StartTerms = {}): MatchSetup {
  const f = startFrame(seed, terms);
  const ships = [underWay(-f.dx * f.half, -f.dz * f.half, f.line), underWay(f.dx * f.half, f.dz * f.half, f.line + Math.PI)];
  return { seed, windForce: f.windForce, windFrom: f.windFrom, ships: placedBy(ships, f.windFrom, terms.placed) };
}

/** How far apart the ships of one side lie, abreast of each other, m (design thread, scenarios 2026-11-18). */
export const ABREAST = 150;

/** The ships of `sides` laid out in a frame (see `fleetStart`). */
function layFleet(f: ReturnType<typeof frameAt>, sides: readonly number[]): Under[] {
  const order = [...new Set(sides)], count = order.length;
  if (count < 2) throw new RangeError('a fleet action needs at least two sides');
  return sides.map((side, i) => {
    const group = order.indexOf(side), mates = sides.flatMap((s, k) => (s === side ? [k] : [])), n = mates.length;
    // The side lies at its bearing from the middle: the first where the duel's first ship lies, the rest at equal angles.
    const at = f.line + Math.PI + (group * 2 * Math.PI) / count, [ux, uz] = bearingDir(at);
    const two = count === 2, sign = group === 0 ? -1 : 1;
    const x = two ? sign * f.dx * f.half : ux * f.half, z = two ? sign * f.dz * f.half : uz * f.half;
    const heading = two ? (group === 0 ? f.line : f.line + Math.PI) : at + Math.PI;
    if (n === 1) return underWay(x, z, heading);
    const along = (mates.indexOf(i) - (n - 1) / 2) * ABREAST, [bx, bz] = bearingDir(heading + Math.PI / 2);
    return underWay(x + bx * along, z + bz * along, heading);
  });
}

/**
 * The setup of a scenario's fleets from its seed (docs/design/scenarios.md): `sides` names the side of each ship, in
 * the match's order. The sides, in the order they first appear, start on the duel's line (two sides: opposite each
 * other, as `duelStart` has them: one ship of each is exactly that duel) or at equal angles round the middle (three or
 * four), every side's ships abreast of one another `ABREAST` apart and all heading at the middle with the same way on.
 * The wind is the duel's, so "how you meet" turns it between the first two sides and leaves the others where it lies.
 * Ships put by hand (`terms.placed`) are where they were put.
 */
export function fleetStart(seed: number, sides: readonly number[], terms: StartTerms = {}): MatchSetup {
  const f = startFrame(seed, terms);
  return { seed, windForce: f.windForce, windFrom: f.windFrom, ships: placedBy(layFleet(f, sides), f.windFrom, terms.placed) };
}

/** `setup` with each ship on the side `sides` names (the scenario's; `fleetStart` only places them by it). */
export function withSides(setup: MatchSetup, sides: readonly number[]): MatchSetup {
  return { ...setup, ships: setup.ships.map((s, i) => (sides[i] === undefined ? s : { ...s, side: sides[i]! })) };
}

/** The wind the placement map pictures when the force is not yet drawn: the middle of the range chosen (as it comes: the duel's middle). */
export function previewForce(choice: WindChoice): number {
  const range = choice === 'drawn' ? DUEL_FORCES : WIND_CHOICES[choice];
  return Math.round((range.least + range.most) / 2);
}

/**
 * Where the start puts the ships of `sides` in the placement map's frame (the wind from the north), for the wind chosen
 * and how they meet: what the map shows until a ship is moved by hand, and what "reset" brings back. The force is the
 * range's middle (`previewForce`); the match draws its own from the seed and moves the ships in or out with it.
 */
export function defaultPlaces(sides: readonly number[], terms: StartTerms = {}): Placed[] {
  const f = frameAt(0, previewForce(terms.wind ?? 'drawn'), terms);
  return layFleet(f, sides).map((s) => {
    const [x, z] = turned(s.x, s.z, -f.windFrom);
    return { x, z, heading: wrapBearing(s.heading - f.windFrom) };
  });
}

/**
 * One ship alone at sea (menu.md, "Walk the ship", and the quiet sea behind the main screen): where the first ship of
 * the duel from the same seed and terms starts, the wind on her beam, under battle sail with way on, no enemy.
 */
export function aloneStart(seed: number, terms: StartTerms = {}): MatchSetup {
  const duel = duelStart(seed, { wind: terms.wind ?? 'drawn' });
  return { ...duel, ships: [{ ...duel.ships[0]!, x: 0, z: 0 }] };
}
