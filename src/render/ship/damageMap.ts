/**
 * The layout of her damage map (plan N2.4; N6.5 writes into it, damageMarks.ts): one texture over her hull and decks,
 * in which every hole, scorch and stain a shot or a fire leaves is drawn, so there can be hundreds of them without
 * more geometry (ship.md, "What can be damaged"). Each surface laid out for it is a region of the map in its own
 * metres: her planking by place along her and girth up her side (as the plan's planking cells), her decks by place
 * along her and across (as the deck cells; their undersides too), her bulwarks' inside by place along her and height
 * above the deck, the ceiling inside her frames by place along her and height above her base. A vertex names its
 * region (Finish.damage) and its grain coordinates are the region's. Her rails (and what else stands on a bulwark)
 * are one row of the map, read by the vertex's place along her (`byPlace`): a bulwark smashed out takes its rail.
 *
 * Pure: no three.js here, so the plan's tests can check the layout.
 */
import { HULL_AFT, HULL_FORE, HULL_HIGH, sheer, sideTop } from '../../sim/ship/hull';
import { BULWARK } from '../../sim/rules/ships';
import { sectionGirth } from '../../sim/ship/plan';
import { HOLE_GRID } from '../../sim/rules/damage';

/** One texel of the map, m: a 32-pounder's hole is about four across; the grid the simulation keeps holes to (damage.ts). */
export const DAMAGE_TEXEL = HOLE_GRID;

/** The regions, numbered from 1 (0: a surface with no damage drawn). */
export const DAMAGE = {
  starboardSide: 1, portSide: 2, weatherDeck: 3, berthDeck: 4, starboardBulwark: 5, portBulwark: 6,
  starboardCeiling: 7, portCeiling: 8, starboardRail: 9, portRail: 10,
} as const;
/** The regions of each side of her, by `side` (1 starboard, -1 larboard). */
export const SIDE_REGIONS = {
  side: (side: number): number => (side > 0 ? DAMAGE.starboardSide : DAMAGE.portSide),
  bulwark: (side: number): number => (side > 0 ? DAMAGE.starboardBulwark : DAMAGE.portBulwark),
  ceiling: (side: number): number => (side > 0 ? DAMAGE.starboardCeiling : DAMAGE.portCeiling),
  rail: (side: number): number => (side > 0 ? DAMAGE.starboardRail : DAMAGE.portRail),
} as const;

/** How far across her a deck reaches either side, m (wider than her beam). */
const DECK_REACH = 5;
/** Places along her her bulwarks and girth are sampled at, to find the highest and the longest. */
const GIRTH_SAMPLES = 64;
const alongAt = (i: number): number => HULL_AFT + ((HULL_FORE - HULL_AFT) * i) / GIRTH_SAMPLES;
/** The bulwark's inside is mapped up to its highest over the deck at her side, m: where the waist's side rises to a raised deck's (N2.12). */
const BULWARK_REACH = Math.max(...Array.from({ length: GIRTH_SAMPLES + 1 }, (_, i) => sideTop(alongAt(i)) - sheer(alongAt(i)))) + BULWARK.railThick;
/** The ceiling inside her frames is mapped from her base up to her highest side, m. */
const CEILING_REACH = HULL_HIGH;
/** Her longest girth from the bottom of her hull to the top of her side, m. */
const MOST_GIRTH = Math.max(...Array.from({ length: GIRTH_SAMPLES + 1 }, (_, i) => sectionGirth(alongAt(i))));

/** A region: the least u and v it holds (m), its size (m), and where its corner lies in the map (texels). */
export interface DamageRegion {
  readonly id: number;
  readonly u: number;
  readonly v: number;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
  /** Read by the vertex's place along her alone (ship-space z), one row: her rails. */
  readonly byPlace: boolean;
}

/** Ship-space z of her fore and after ends: every region's u runs between them. */
const Z_FORE = -HULL_FORE;
const LENGTH = HULL_FORE - HULL_AFT;

/** The regions stacked one above the other in the map. */
export const DAMAGE_REGIONS: readonly DamageRegion[] = (() => {
  const rows: [number, number, number][] = [
    [DAMAGE.starboardSide, 0, MOST_GIRTH], [DAMAGE.portSide, 0, MOST_GIRTH],
    [DAMAGE.weatherDeck, -DECK_REACH, 2 * DECK_REACH], [DAMAGE.berthDeck, -DECK_REACH, 2 * DECK_REACH],
    [DAMAGE.starboardBulwark, 0, BULWARK_REACH], [DAMAGE.portBulwark, 0, BULWARK_REACH],
    [DAMAGE.starboardCeiling, 0, CEILING_REACH], [DAMAGE.portCeiling, 0, CEILING_REACH],
    [DAMAGE.starboardRail, 0, DAMAGE_TEXEL], [DAMAGE.portRail, 0, DAMAGE_TEXEL],
  ];
  let y = 0;
  return rows.map(([id, v, height]) => {
    const r = { id, u: Z_FORE, v, width: LENGTH, height, x: 0, y, byPlace: id === DAMAGE.starboardRail || id === DAMAGE.portRail };
    y += Math.ceil(height / DAMAGE_TEXEL);
    return r;
  });
})();

/** The map's size in texels. */
export const DAMAGE_MAP_SIZE = {
  width: Math.ceil(LENGTH / DAMAGE_TEXEL),
  height: DAMAGE_REGIONS.reduce((n, r) => n + Math.ceil(r.height / DAMAGE_TEXEL), 0),
} as const;

/** A point this little outside its region (the vertices' single precision) still counts as on its edge, m. */
const EDGE = DAMAGE_TEXEL / 2;

/** Where a point of a region lies in the map, in texels (x along, y up the map); null for no region or outside it. A rail's `v` is its row's. */
export function damageTexel(region: number, u: number, v: number): [number, number] | null {
  const r = DAMAGE_REGIONS.find((d) => d.id === region);
  const vv = r?.byPlace ? r.v + r.height / 2 : v;
  if (!r || u < r.u - EDGE || u > r.u + r.width + EDGE || vv < r.v - EDGE || vv > r.v + r.height + EDGE) return null;
  return [r.x + (u - r.u) / DAMAGE_TEXEL, r.y + (vv - r.v) / DAMAGE_TEXEL];
}
