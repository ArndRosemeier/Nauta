/**
 * The sea's mesh as a quadtree of square tiles around the eye (plan N1.3), the way CDLOD lays out a terrain: every
 * tile is one shared grid of SEA_TILE_CELLS² cells, drawn at the tile's place and size. Tiles of level k are
 * SEA_TILE_CELLS·SEA_FINEST_CELL·2^k m wide and stand on a fixed lattice of their own size, so their vertices sit
 * on fixed points of the calm sea and never swim when the eye moves or turns. Near the eye the tiles are small and
 * dense, far off large and coarse, out past the horizon.
 *
 * No popping, no cracks: in the outer part of its range each tile's vertices slide onto the next coarser grid
 * (`seaMorph`), so where a level meets the next one its edge is already that coarser grid, and a tile that changes
 * level does so when it looks the same either way. The vertex stage (seaMaterial.ts) does the sliding; this file
 * chooses the tiles. Pure.
 */
import { earthDrop, horizonDistance } from './earth';

/**
 * Cells along a tile's side at the densest. Even, so its vertices pair up when they slide onto the coarser grid. A
 * sparser grid (the quality level's `seaCells`, src/app/quality.ts) draws every second or fourth of its vertices.
 */
export const SEA_TILE_CELLS = 16;
/** The finest cell at the densest grid, m: right under the eye. A wave shorter than a few of these is left to the fine sea (N1.2). */
export const SEA_FINEST_CELL = 0.25;
/**
 * How far from the eye a level's tiles reach, as a multiple of their side (the level's range). With it the grid's
 * cells span about 1/80 to 1/40 of their distance from the eye, a degree or less.
 */
export const SEA_LOD_RANGE = 5;
/**
 * Where in its range a level's vertices begin to slide onto the coarser grid, as a share of the range. For no
 * cracks, a level's edge must lie where the next coarser level has not begun to slide:
 * SEA_LOD_RANGE·(2·SEA_MORPH_START − 1) ≥ 2√2 (test/seaGrid.test.ts checks it).
 */
export const SEA_MORPH_START = 0.8;
/**
 * A wave is drawn fully where it spans this many cells of the grid, and not at all where it spans
 * SEA_WAVE_GONE_CELLS or fewer: a wave the grid cannot hold would flicker, so it fades out with distance and the
 * fine sea's normals (N1.2) carry it on.
 */
export const SEA_WAVE_FULL_CELLS = 6;
export const SEA_WAVE_GONE_CELLS = 3;
/**
 * Room for tiles drawn at once. The most `seaTiles` makes without the view's culling is about 1100 (test/seaGrid.test.ts
 * keeps it under this), and the view leaves out about two thirds.
 */
export const SEA_MAX_TILES = 2048;
/** How far past the horizon the sea is drawn, as a share of the horizon's distance, plus a margin in m. */
const BEYOND_HORIZON = 1.25;
const RANGE_MARGIN = 500;

/** The side of a tile of `level`, m. */
export function seaTileSize(level: number): number {
  return SEA_TILE_CELLS * SEA_FINEST_CELL * 2 ** level;
}

/** How far from the eye tiles of `level` are drawn, m. */
export function seaLodRange(level: number): number {
  return SEA_LOD_RANGE * seaTileSize(level);
}

/**
 * How far a vertex of a tile `size` m wide, `distance` m from the eye (through the air, to its calm place), has slid
 * onto the next coarser grid: 0 not at all, 1 fully. The vertex stage computes the same (seaMaterial.ts).
 */
export function seaMorph(distance: number, size: number): number {
  const range = SEA_LOD_RANGE * size;
  return Math.min(1, Math.max(0, (distance - SEA_MORPH_START * range) / ((1 - SEA_MORPH_START) * range)));
}

/** How far out the sea is drawn for an eye `height` m above the calm sea: past the horizon, where it bends out of sight. */
export function seaReach(height: number): number {
  return horizonDistance(height) * BEYOND_HORIZON + RANGE_MARGIN;
}

/** How far the sea has sunk under the earth's curve at the edge of `seaReach`, m (for the tiles' bounds). */
export function seaDropAtReach(height: number): number {
  return earthDrop(seaReach(height));
}

/** Where the eye is: over the calm sea at (x, z), `y` m above its level. */
export interface SeaEye {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** A tile's corner (its smallest x and z), side and level. */
export type TileFn = (x: number, z: number, size: number, level: number) => void;
/** Whether a tile (corner, side) could show. */
export type TileTest = (x: number, z: number, size: number) => boolean;

/** Whether a tile can be drawn with `cells` along its side: a whole share of the densest grid, its vertices pairing up. */
export function seaCellsFit(cells: number): boolean {
  return Number.isInteger(cells) && cells >= 2 && SEA_TILE_CELLS % cells === 0 && cells % 2 === 0;
}

/** Every number of cells a tile's side can be drawn with, densest first (16, 8, 4, 2). */
export function seaCellChoices(): number[] {
  const out: number[] = [];
  for (let cells = SEA_TILE_CELLS; cells >= 2; cells--) if (seaCellsFit(cells)) out.push(cells);
  return out;
}

/**
 * The triangles of one tile's grid with `cells` along its side, as indices into the densest grid's
 * (SEA_TILE_CELLS + 1)² vertices (row by row): every SEA_TILE_CELLS / cells-th vertex, two triangles a cell, every
 * cell split along the same diagonal, so a cell of the coarser grid is two cells' worth of this one.
 */
export function seaTileTriangles(cells: number): number[] {
  if (!seaCellsFit(cells)) throw new Error(`a sea tile cannot have ${cells} cells along its side (SEA_TILE_CELLS is ${SEA_TILE_CELLS})`);
  const side = SEA_TILE_CELLS + 1, step = SEA_TILE_CELLS / cells, idx: number[] = [];
  for (let j = 0; j < SEA_TILE_CELLS; j += step) for (let i = 0; i < SEA_TILE_CELLS; i += step) {
    const a = j * side + i, b = a + step, c = a + step * side, d = c + step;
    idx.push(a, c, d, a, d, b);
  }
  return idx;
}

/** Distance from the eye to the nearest point of a tile, through the air, to its calm place. */
function nearest(eye: SeaEye, x: number, z: number, size: number): number {
  const dx = Math.max(x - eye.x, 0, eye.x - x - size), dz = Math.max(z - eye.z, 0, eye.z - z - size);
  return Math.sqrt(dx * dx + dz * dz + eye.y * eye.y);
}

/**
 * The tiles that draw the sea for `eye` out to `reach` m, each passed to `emit`. `visible` says whether a tile could
 * show (the camera's view, with room for the waves); one that cannot is left out with everything inside it. A tile
 * of level k is split into four of level k − 1 while its nearest point is within the finer level's range.
 */
export function seaTiles(eye: SeaEye, reach: number, visible: TileTest | null, emit: TileFn): void {
  const top = Math.max(0, Math.ceil(Math.log2(reach / seaTileSize(0) / 2)));
  const size = seaTileSize(top);
  const x0 = Math.floor((eye.x - reach) / size), x1 = Math.floor((eye.x + reach) / size);
  const z0 = Math.floor((eye.z - reach) / size), z1 = Math.floor((eye.z + reach) / size);
  const visit = (x: number, z: number, s: number, level: number): void => {
    const d = nearest(eye, x, z, s);
    if (d > reach || (visible && !visible(x, z, s))) return;
    if (level > 0 && d < seaLodRange(level - 1)) {
      const h = s / 2;
      visit(x, z, h, level - 1);
      visit(x + h, z, h, level - 1);
      visit(x, z + h, h, level - 1);
      visit(x + h, z + h, h, level - 1);
    } else emit(x, z, s, level);
  };
  for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) visit(i * size, j * size, size, top);
}
