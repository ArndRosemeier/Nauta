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

/** The terms a duel's start is made with besides its seed; each missing one is the duel's own. */
export interface StartTerms {
  readonly wind?: WindChoice;
  readonly meet?: Meeting;
}

/** The wind's force for `choice`, drawn from the seed within its range; `drawn`: the start's own. */
function forceFor(seed: number, choice: WindChoice, drawn: number): number {
  if (choice === 'drawn') return drawn;
  const range = WIND_CHOICES[choice];
  return new Rng(deriveSeed(seed, 'start-wind')).int(range.least, range.most);
}

/**
 * The setup of a duel from its seed: the wind's bearing and force, and the two ships on the line square to it. With
 * `terms`, the force drawn within the chosen wind's range, and the wind turned toward the ship that holds the weather
 * position (the line between them stays where the seed put it, so the ships still close).
 */
export function duelStart(seed: number, terms: StartTerms = {}): MatchSetup {
  const rng = new Rng(deriveSeed(seed, 'start'));
  const square = rng.range(0, 2 * Math.PI), windForce = forceFor(seed, terms.wind ?? 'drawn', rng.int(DUEL_FORCES.least, DUEL_FORCES.most));
  // The line from the first ship to the second, square to the seed's wind: each heads at the other with the wind abeam.
  const line = wrapBearing(square - QUARTER), [dx, dz] = bearingDir(line), half = startApart(windForce) / 2;
  // Turned toward the first ship (from behind her beam) when she holds the weather position, toward the second when she does.
  const turn = terms.meet === 'weather' ? WEATHER_TURN_DEGREES * DEGREE : terms.meet === 'lee' ? -WEATHER_TURN_DEGREES * DEGREE : 0;
  const ship = (side: number, heading: number) => ({ x: side * dx * half, z: side * dz * half, heading: wrapBearing(heading), speed: START_WAY * KNOT, canvas: START_CANVAS });
  return { seed, windForce, windFrom: turn === 0 ? square : wrapBearing(square + turn), ships: [ship(-1, line), ship(1, line + Math.PI)] };
}

/**
 * One ship alone at sea (menu.md, "Walk the ship", and the quiet sea behind the main screen): where the first ship of
 * the duel from the same seed and terms starts, the wind on her beam, under battle sail with way on, no enemy.
 */
export function aloneStart(seed: number, terms: StartTerms = {}): MatchSetup {
  const duel = duelStart(seed, { wind: terms.wind ?? 'drawn' });
  return { ...duel, ships: [{ ...duel.ships[0]!, x: 0, z: 0 }] };
}
