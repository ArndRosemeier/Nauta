/**
 * The brig's cross-section and ship space (pure). The midship section of the draught (rules/ships.ts) as a smooth
 * curve, and the frame every part of her is placed in.
 *
 * **Ship space:** metres; the origin on the centreline at the mainmast, at the load waterline; +x to starboard, +y up,
 * -z forward (her bow points where an unturned look looks, compass north at heading 0, units.ts).
 */
import { DECK_AT_SIDE, DECK_CAMBER, KEEL_HALF_SIDING, LOAD_WATERLINE, MIDSHIP_SECTION } from '../rules/ships';
import { monotoneCurve } from '../curve';

/** A point of a section: across (half-breadth, m, from the centreline), up (ship-space y, m), and the girth to it from the keel (m). */
export interface SectionPoint {
  readonly x: number;
  readonly y: number;
  readonly girth: number;
}

/** A height above the base as ship-space y. */
export const shipY = (aboveBase: number): number => aboveBase - LOAD_WATERLINE;
/** A position forward of the mainmast as ship-space z. */
export const shipZ = (forward: number): number => -forward;

/** Samples of the outline before it is walked by girth. */
const FINE = 400;
const HEIGHTS = MIDSHIP_SECTION.map((p) => p[0]);
const MIDSHIP = monotoneCurve(HEIGHTS, MIDSHIP_SECTION.map((p) => p[1]));

/** The moulded half-breadth of the midship section at a height above the base, m (held at its ends outside the readings). */
export function halfBreadth(aboveBase: number): number {
  return MIDSHIP(aboveBase);
}

/**
 * The section's outline from the rabbet (where her bottom meets the keel) up to a height, as points about `step`
 * metres of girth apart, pushed `outward` metres along the outline's normal (the outside planking: its thickness;
 * the ceiling inside: minus the frames). Girth is measured along the moulded line, so planking strakes and damage
 * panels stay at the same girth whichever surface they are on.
 */
export function sectionOutline(topAboveBase: number, step: number, outward = 0): SectionPoint[] {
  // Sample finely, then walk the girth.
  const fine: [number, number][] = [];
  const bottom = HEIGHTS[0]!;
  for (let i = 0; i <= FINE; i++) {
    const h = bottom + ((topAboveBase - bottom) * i) / FINE;
    fine.push([Math.max(KEEL_HALF_SIDING, halfBreadth(h)), h]);
  }
  const girths = [0];
  for (let i = 1; i <= FINE; i++) girths.push(girths[i - 1]! + Math.hypot(fine[i]![0] - fine[i - 1]![0], fine[i]![1] - fine[i - 1]![1]));
  const total = girths[FINE]!, count = Math.max(1, Math.round(total / step));
  const out: SectionPoint[] = [];
  let j = 0;
  for (let k = 0; k <= count; k++) {
    const g = (total * k) / count;
    while (j < FINE - 1 && girths[j + 1]! < g) j++;
    const a = fine[j]!, b = fine[j + 1]!, t = (g - girths[j]!) / (girths[j + 1]! - girths[j]!);
    const x = a[0] + (b[0] - a[0]) * t, h = a[1] + (b[1] - a[1]) * t;
    // The normal points out of the hull: the tangent (dx, dh) turned a quarter toward +x.
    const dx = b[0] - a[0], dh = b[1] - a[1], len = Math.hypot(dx, dh);
    out.push({ x: x + (outward * dh) / len, y: shipY(h - (outward * dx) / len), girth: g });
  }
  return out;
}

/** The weather deck's upper side at `x` m from the centreline, as ship-space y: the side's height plus the beams' round. */
export function deckY(x: number): number {
  const half = halfBreadth(DECK_AT_SIDE), f = Math.min(1, Math.abs(x) / half);
  return shipY(DECK_AT_SIDE + DECK_CAMBER * (1 - f * f));
}
