/**
 * Where a duel starts (implementation plan N3, design decision "The start"): the two ships 1,500 m apart with the wind
 * on the beam of the line between them, each under battle sail and steering at the other, so neither has the weather
 * position. The match's seed turns the whole picture round the compass and picks the force (2 to 6). Pure: the same
 * seed gives the same start on every machine.
 */
import { deriveSeed, Rng } from '@futuremagic/core';
import { START_CANVAS } from './rules/sailing';
import { START_APART, START_WAY } from './rules/start';
import { DUEL_FORCES } from './rules/wind';
import type { MatchSetup } from './state';
import { bearingDir, KNOT, wrapBearing } from './units';

/** A quarter turn, rad: the wind stands square to the line between the ships. */
const QUARTER = Math.PI / 2;

/** The setup of a duel from its seed: the wind's bearing and force, and the two ships on the line square to it. */
export function duelStart(seed: number): MatchSetup {
  const rng = new Rng(deriveSeed(seed, 'start'));
  const windFrom = rng.range(0, 2 * Math.PI), windForce = rng.int(DUEL_FORCES.least, DUEL_FORCES.most);
  // The line from the first ship to the second, square to the wind: each heads at the other with the wind abeam.
  const line = wrapBearing(windFrom - QUARTER), [dx, dz] = bearingDir(line), half = START_APART / 2;
  const ship = (side: number, heading: number) => ({ x: side * dx * half, z: side * dz * half, heading: wrapBearing(heading), speed: START_WAY * KNOT, canvas: START_CANVAS });
  return { seed, windForce, windFrom, ships: [ship(-1, line), ship(1, line + Math.PI)] };
}
