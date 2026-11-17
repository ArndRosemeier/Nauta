// @ts-nocheck -- three's TSL typings infer vector widths poorly for shader math; checked by rendering it (npm run shot).
/**
 * Her midship section for shaders: the moulded half-breadth at a ship-space height, read from a table of the section
 * (sim/ship/section.ts) and interpolated. The ship's kinds use it to know what lies inside her below the deck (no
 * open sky there), and the sea's cut uses it to leave out the water inside her hull (seaCut.ts).
 */
import { abs, clamp, float, floor, int, min, mix, uniformArray } from 'three/tsl';
import { DECK_AT_SIDE, DECK_CAMBER, RAIL_TOP } from '../../sim/rules/ships';
import { halfBreadth, shipY } from '../../sim/ship/section';

/** Readings of the table, from her keel's bottom to the rail. */
const READINGS = 48;
const LOWEST = shipY(0);
const HIGHEST = shipY(RAIL_TOP);
/** The top reading is read a hair below, so its pair is still in the table. */
const SHY_OF_TOP = 1e-3;
const STEP = (HIGHEST - LOWEST) / (READINGS - 1);
const TABLE = uniformArray(Array.from({ length: READINGS }, (_, i) => halfBreadth(i * STEP)), 'float');

/** The deck's height at her side, ship space. */
export const DECK_SIDE_Y = shipY(DECK_AT_SIDE);

/** Her half-breadth at the deck, m. */
const DECK_HALF = halfBreadth(DECK_AT_SIDE);

/** The weather deck's top at ship-space `x` (a float node): cambered, highest on the centreline (section.ts deckY). */
export function deckTopY(x) {
  const f = min(abs(x).div(DECK_HALF), 1);
  return float(DECK_SIDE_Y).add(float(DECK_CAMBER).mul(float(1).sub(f.mul(f))));
}

/** The moulded half-breadth (to the outside of her frames) at ship-space height `y` (a float node). */
export function hullHalfBreadth(y) {
  const f = clamp(y.sub(LOWEST).div(STEP), 0, READINGS - 1 - SHY_OF_TOP);
  const i = int(floor(f));
  return mix(TABLE.element(i), TABLE.element(i.add(1)), f.sub(float(i)));
}
