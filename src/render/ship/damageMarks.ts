/**
 * What a ship's damage leaves on her (plan N6.5, ship.md "What can be damaged, and how it shows"): the marks drawn
 * into her damage map (damageMap.ts) for every hole in her timber, every panel stove in and every bulwark section
 * smashed out, and into her sails' hole map (sailGrid.ts `sailAtlas`) for every shot hole and split in her canvas.
 * Read from the simulation's damage alone (sim/damage.ts), so both ships, near and far, show what was done to them.
 *
 * A map's texel has four marks: the hole's opening (`HOLE`: light beyond it, or dark), scorch (`SCORCH`, fire's: N6.5
 * part 3), the splintered rim of fresh wood or frayed canvas round it (`RIM`), and whether the surface is cut away
 * there (`CUT`: a bulwark shot through or smashed out, a hole in a sail; drawn through by the holed kinds). The hull
 * and decks are not cut: what lies behind them is dark, so a hole is drawn as one, and from inside as the light that
 * comes through it.
 *
 * Pure (no three.js): the page writes the bytes into the textures (damageView.ts).
 */
import { hash2f } from '@futuremagic/core';
import { holeAt, cellState, type Damage, type Hole } from '../../sim/damage';
import { girthTo, plankingPlace } from '../../sim/damage/meet';
import { RAGGED } from '../../sim/rules/damage';
import { SHOT } from '../../sim/rules/guns';
import { designWaterline, sheer } from '../../sim/ship/hull';
import { shipPlan, type Cell } from '../../sim/ship/plan';
import { rigPlan } from '../../sim/ship/rig';
import { sailArea } from '../../sim/ship/sails';
import { RENT_AREA, SPLIT } from '../../sim/rules/damage';
import { shipZ } from '../../sim/ship/section';
import { DAMAGE, DAMAGE_MAP_SIZE, DAMAGE_REGIONS, DAMAGE_TEXEL, SIDE_REGIONS, damageTexel } from './damageMap';

/** A texel's four marks, in the order the map keeps them (RGBA). */
export const MARK = { hole: 0, scorch: 1, rim: 2, cut: 3 } as const;
/** Bytes per texel. */
const TEXEL_BYTES = 4;
/** The most a mark holds. */
const FULL = 255;
/** A hole's mark: the open air (or a lit room) beyond it, or the dark (her inside, the sea). The shader reads above `LIGHT_FROM` as light. */
export const HOLE_LIGHT = FULL;
export const HOLE_DARK = 128;
/** A lodged ball is a dark disc of its own size, not a hole. */
const LODGED = 1;
/** The splintered wood round a hole reaches this many of its opening's radius beyond it, outside and (thrown inward) inside. */
const RIM_OUT = 0.8;
const RIM_IN = 1.6;
/** How ragged a hole's edge is: its radius wanders by this share. */
const JAG = 0.35;
/** A panel stove in or a section smashed out has an edge this ragged, m. */
const JAG_EDGE = 0.12;
/** Its splintered rim, m. */
const RIM_EDGE = 0.1;
/** Harmonics of a hole's ragged edge. */
const JAG_WAVES = 5;
/** A turn, rad. */
const TURN = 2 * Math.PI;
/** Seeds of the holes' edges and of the sails' holes. */
const EDGE_SEED = 6211;
const SAIL_SEED = 4447;

/** One ship's block of rows in a texture shared by both ships (each ship's map stacked over the other's). */
export interface MapBlock {
  readonly data: Uint8Array;
  /** The texture's width, texels. */
  readonly width: number;
  /** The first row of this ship's block. */
  readonly row: number;
  /** Rows in a block. */
  readonly rows: number;
}

/** A disc stamped in a region at (u, v) m: its opening's radius, what the opening is, the rim's reach, whether it cuts the surface through. */
interface Disc {
  readonly region: number;
  readonly u: number;
  readonly v: number;
  readonly open: number;
  readonly hole: number;
  readonly rim: number;
  readonly cut: boolean;
  readonly seed: number;
}

/** Writes `value` into a texel's mark, keeping the larger. */
function raise(b: MapBlock, x: number, y: number, mark: number, value: number): void {
  if (x < 0 || y < 0 || x >= b.width || y >= b.rows) return;
  const i = ((b.row + y) * b.width + x) * TEXEL_BYTES + mark;
  if (value > b.data[i]!) b.data[i] = Math.min(FULL, Math.round(value));
}

/** A ragged disc: its opening and its rim, its radius wandering round it by the seed. */
function disc(b: MapBlock, d: Disc): void {
  const at = damageTexel(d.region, d.u, d.v);
  if (!at) return;
  const reach = d.open * (1 + JAG) + d.rim, n = Math.ceil(reach / DAMAGE_TEXEL);
  const phase = Array.from({ length: JAG_WAVES }, (_, k) => hash2f(d.seed, k, 0) * TURN);
  const size = Array.from({ length: JAG_WAVES }, (_, k) => hash2f(d.seed, k, 1) / (k + 1));
  const wander = (a: number) => 1 + JAG * size.reduce((s, w, k) => s + w * Math.sin((k + 1) * a + phase[k]!), 0) / JAG_WAVES * 2;
  const cx = Math.floor(at[0]), cy = Math.floor(at[1]);
  for (let y = cy - n; y <= cy + n; y++) {
    for (let x = cx - n; x <= cx + n; x++) {
      const dx = (x + 1 / 2 - at[0]) * DAMAGE_TEXEL, dy = (y + 1 / 2 - at[1]) * DAMAGE_TEXEL, r = Math.hypot(dx, dy);
      const edge = d.open * wander(Math.atan2(dy, dx));
      if (r <= edge) {
        raise(b, x, y, MARK.hole, d.hole);
        if (d.cut) raise(b, x, y, MARK.cut, FULL);
      }
      // The rim: fresh wood thinning out from the edge, in splinters (the hash breaks it up).
      const out = (r - edge) / Math.max(d.rim, DAMAGE_TEXEL);
      if (out < 1) raise(b, x, y, MARK.rim, FULL * (1 - Math.max(0, out)) * (1 / 2 + hash2f(d.seed, x, y) / 2));
    }
  }
}

/** A ragged rectangle over a region from (u0, v0) to (u1, v1) m: a panel stove in or a bulwark section smashed out. */
function patch(b: MapBlock, region: number, u0: number, u1: number, v0: number, v1: number, hole: number, cut: boolean, seed: number): void {
  const r = DAMAGE_REGIONS.find((x) => x.id === region)!;
  const vMid = r.byPlace ? r.v + r.height / 2 : 0;
  const a = damageTexel(region, Math.min(u0, u1), r.byPlace ? vMid : Math.min(v0, v1)), c = damageTexel(region, Math.max(u0, u1), r.byPlace ? vMid : Math.max(v0, v1));
  if (!a || !c) return;
  const m = Math.ceil((JAG_EDGE + RIM_EDGE) / DAMAGE_TEXEL);
  const x0 = Math.floor(a[0]) - m, x1 = Math.ceil(c[0]) + m, y0 = r.byPlace ? Math.floor(a[1]) : Math.floor(a[1]) - m, y1 = r.byPlace ? Math.floor(a[1]) : Math.ceil(c[1]) + m;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // Distance inside the rectangle's edge (m; along a rail only its ends count), less a ragged bite out of it.
      const inX = Math.min(x + 1 / 2 - a[0], c[0] - x - 1 / 2), inY = r.byPlace ? inX : Math.min(y + 1 / 2 - a[1], c[1] - y - 1 / 2);
      const inside = Math.min(inX, inY) * DAMAGE_TEXEL - JAG_EDGE * hash2f(seed, x, y >> 1);
      if (inside >= 0) {
        raise(b, x, y, MARK.hole, hole);
        if (cut) raise(b, x, y, MARK.cut, FULL);
      } else if (-inside < RIM_EDGE) raise(b, x, y, MARK.rim, FULL * (1 + inside / RIM_EDGE));
    }
  }
}

/** Her cells by id. */
let cellsById: ReadonlyMap<number, Cell> | null = null;
const cellOf = (id: number): Cell | undefined => (cellsById ??= new Map(shipPlan().cells.map((c) => [c.id, c]))).get(id);

/** Whether a height above her base at a place along her is under her waterline as she floats (the sea is beyond a hole there). */
const underWater = (along: number, h: number): boolean => h < designWaterline(along);

/** A hole's opening radius (m): RAGGED times its ball across (as the sea sees it, damage/flood.ts), a lodged ball its own. */
function openingOf(h: Hole): number {
  const ball = SHOT[h.shot].diameter[h.gun] / 2;
  return h.lodged ? ball * LODGED : ball * RAGGED;
}

/** Every mark one hole leaves, inside and out. `plugged`: the carpenter has stopped it (no light, no sea, through it). */
function holeMarks(b: MapBlock, code: number, h: Hole, cell: Cell, plugged: boolean): void {
  const open = openingOf(h), seed = code ^ EDGE_SEED, along = cell.aft + h.u, z = shipZ(along);
  const outside = (region: number, v: number, cut: boolean) => disc(b, { region, u: z, v, open, hole: HOLE_DARK, rim: open * RIM_OUT, cut: cut && !h.lodged, seed });
  const inside = (region: number, v: number, hole: number, cut: boolean) => disc(b, { region, u: z, v, open: h.lodged ? 0 : open, hole, rim: open * RIM_IN, cut: cut && !h.lodged, seed: seed + 1 });
  if (cell.kind === 'planking') {
    const [, , height] = plankingPlace(cell, h.u, h.v);
    outside(SIDE_REGIONS.side(cell.side), cell.from + h.v, false);
    inside(SIDE_REGIONS.ceiling(cell.side), height, plugged || underWater(along, height) ? HOLE_DARK : HOLE_LIGHT, false);
  } else if (cell.kind === 'bulwark') {
    const height = cell.from + h.v;
    outside(SIDE_REGIONS.side(cell.side), girthTo(along, height), true);
    inside(SIDE_REGIONS.bulwark(cell.side), height - sheer(along), HOLE_LIGHT, true);
  } else if (cell.kind === 'deck') {
    // One region for a deck's top and its underside: the shader shows the light only to an eye below the weather deck.
    const across = cell.side * (cell.from + h.v);
    disc(b, { region: cell.level === 'berth' ? DAMAGE.berthDeck : DAMAGE.weatherDeck, u: z, v: across, open, hole: cell.level === 'berth' ? HOLE_DARK : HOLE_LIGHT, rim: open * RIM_IN, cut: false, seed });
  }
}

/** A panel stove in, or a bulwark section smashed out with its rail (damage.ts `cellState`). */
function cellMarks(b: MapBlock, cell: Cell): void {
  const z0 = shipZ(cell.aft), z1 = shipZ(cell.fore), mid = (cell.aft + cell.fore) / 2, seed = cell.id ^ EDGE_SEED;
  if (cell.kind === 'planking') {
    patch(b, SIDE_REGIONS.side(cell.side), z0, z1, cell.from, cell.to, HOLE_DARK, false, seed);
    const lo = plankingPlace(cell, (cell.fore - cell.aft) / 2, 0)[2], hi = plankingPlace(cell, (cell.fore - cell.aft) / 2, cell.to - cell.from)[2];
    patch(b, SIDE_REGIONS.ceiling(cell.side), z0, z1, lo, hi, underWater(mid, (lo + hi) / 2) ? HOLE_DARK : HOLE_LIGHT, false, seed + 1);
  } else if (cell.kind === 'bulwark') {
    patch(b, SIDE_REGIONS.side(cell.side), z0, z1, girthTo(mid, cell.from), girthTo(mid, cell.to), HOLE_DARK, true, seed);
    patch(b, SIDE_REGIONS.bulwark(cell.side), z0, z1, 0, cell.to - cell.from, HOLE_LIGHT, true, seed + 1);
    patch(b, SIDE_REGIONS.rail(cell.side), z0, z1, 0, 0, HOLE_LIGHT, true, seed + 2);
  }
}

/** Clears one ship's block. */
function clear(b: MapBlock): void {
  b.data.fill(0, b.row * b.width * TEXEL_BYTES, (b.row + b.rows) * b.width * TEXEL_BYTES);
}

/**
 * One ship's marks on her damage map, kept up with her damage: a new hole is stamped on what is there; anything
 * taken back (a hole plugged, a hole gone) redraws her block from nothing.
 */
export class HullMarks {
  private drawn = new Set<number>();
  private stopped = new Set<number>();
  private stove = new Set<number>();
  private was: Damage | null = null;

  constructor(private readonly block: MapBlock) {}

  /** Brings the marks up to `d`; true if any byte changed. */
  bringUpTo(d: Damage): boolean {
    if (d === this.was) return false;
    this.was = d;
    const now = new Set(d.holes), plugged = new Set(d.plugged);
    const lost = [...this.drawn].some((c) => !now.has(c)) || [...plugged].some((c) => !this.stopped.has(c));
    if (lost) { clear(this.block); this.drawn = new Set(); this.stove = new Set(); }
    this.stopped = plugged;
    let changed = lost;
    for (const code of d.holes) {
      if (this.drawn.has(code)) continue;
      this.drawn.add(code);
      const h = holeAt(code), cell = cellOf(h.cell);
      if (!cell) continue;
      holeMarks(this.block, code, h, cell, plugged.has(code));
      changed = true;
      if (!this.stove.has(cell.id) && cellState(d, cell) === 'stove in') { this.stove.add(cell.id); cellMarks(this.block, cell); }
    }
    return changed;
  }

  /** Whether any of her surface is cut through (the holed kinds must draw her). */
  get cut(): boolean {
    const b = this.block;
    for (let i = b.row * b.width * TEXEL_BYTES + MARK.cut; i < (b.row + b.rows) * b.width * TEXEL_BYTES; i += TEXEL_BYTES) if (b.data[i]) return true;
    return false;
  }
}

/** The rows of one ship's block in the damage map. */
export const HULL_BLOCK_ROWS = DAMAGE_MAP_SIZE.height;

// ---- Her sails ----

/** A sail's rectangle in the hole map, texels (sailGrid.ts `sailAtlas`): x across its cloths, y down from its head. */
export interface SailRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
/** The hole map's texel, m (sailGrid.ts SAIL_TEXEL). */
export interface SailMap extends MapBlock {
  readonly texel: number;
}
/** A shot hole tears the canvas this many times the ball's radius, and it frays this far beyond, m; holes keep this far from the sail's edges (a share of it). */
const SAIL_TEAR = 2.2;
const SAIL_FRAY = 0.08;
const SAIL_MARGIN = 0.08;
/** A sail split from head to foot is torn this wide, m, wandering across by this much. */
const SPLIT_WIDTH = 0.18;
const SPLIT_WANDER = 0.35;
/** The ball a sail hole is drawn for: the rent counts holes, not their balls. */
const SAIL_BALL = SHOT.round.diameter.carronade / 2;
/** What each of a sail hole's hashes picks (the hash's x): where across, where down, how big, how drawn out. */
const PICK = { across: 0, down: 1, size: 2, stretch: 3 } as const;

/** One ship's holes in her sails, kept up with `rent` (holes per sail, rig plan order). */
export class SailMarks {
  private shown: readonly number[] = [];

  constructor(private readonly map: SailMap, private readonly rects: readonly SailRect[]) {}

  /** Brings the holes up to `rent`; true if any byte changed. */
  bringUpTo(rent: readonly number[]): boolean {
    if (rent === this.shown) return false;
    const was = this.shown;
    this.shown = rent;
    let changed = false;
    const sails = rigPlan().sails;
    rent.forEach((n, s) => {
      const r = this.rects[s], had = was[s] ?? 0;
      if (!r || n <= had) return;
      for (let k = had; k < n; k++) this.hole(r, s, k);
      const split = (n * RENT_AREA) / sailArea(sails[s]!) > SPLIT, wasSplit = (had * RENT_AREA) / sailArea(sails[s]!) > SPLIT;
      if (split && !wasSplit) this.split(r, s);
      changed = true;
    });
    return changed;
  }

  /** Hole `k` of sail `s`: a ragged tear where the seed puts it, away from the edges. */
  private hole(r: SailRect, s: number, k: number): void {
    const m = this.map, t = m.texel, seed = (s * SAIL_SEED) ^ k;
    const cx = r.x + r.width * (SAIL_MARGIN + (1 - 2 * SAIL_MARGIN) * hash2f(seed, PICK.across, 0)), cy = r.y + r.height * (SAIL_MARGIN + (1 - 2 * SAIL_MARGIN) * hash2f(seed, PICK.down, 0));
    const open = SAIL_BALL * SAIL_TEAR * (1 / 2 + hash2f(seed, PICK.size, 0)), n = Math.ceil((open * (1 + JAG) + SAIL_FRAY) / t);
    // Canvas tears along its threads: the hole is drawn out up and down the cloth.
    const stretch = 1 + hash2f(seed, PICK.stretch, 0);
    for (let y = Math.floor(cy) - Math.ceil(n * stretch); y <= Math.ceil(cy) + Math.ceil(n * stretch); y++) {
      for (let x = Math.floor(cx) - n; x <= Math.ceil(cx) + n; x++) {
        if (x < r.x || x >= r.x + r.width || y < r.y || y >= r.y + r.height) continue;
        const dx = (x + 1 / 2 - cx) * t, dy = (y + 1 / 2 - cy) * t / stretch, d = Math.hypot(dx, dy);
        const edge = open * (1 + JAG * (hash2f(seed, x, y) - 1 / 2));
        if (d <= edge) { raise(m, x, y, MARK.hole, FULL); raise(m, x, y, MARK.cut, FULL); }
        else if (d < edge + SAIL_FRAY) raise(m, x, y, MARK.rim, FULL * (1 - (d - edge) / SAIL_FRAY));
      }
    }
  }

  /** Sail `s` split from head to foot down its middle, the tear wandering across. */
  private split(r: SailRect, s: number): void {
    const m = this.map, t = m.texel, seed = (s * SAIL_SEED) ^ EDGE_SEED, half = SPLIT_WIDTH / 2 / t, fray = SAIL_FRAY / t;
    for (let y = r.y; y < r.y + r.height; y++) {
      const f = (y - r.y) / r.height, mid = r.x + r.width / 2 + (SPLIT_WANDER / t) * Math.sin(f * TURN * (1 + hash2f(seed, 0, 0)) + hash2f(seed, 1, 0) * TURN);
      for (let x = Math.floor(mid - half - fray); x <= Math.ceil(mid + half + fray); x++) {
        if (x < r.x || x >= r.x + r.width) continue;
        const d = Math.abs(x + 1 / 2 - mid) - half * (1 / 2 + hash2f(seed, x, y));
        if (d <= 0) { raise(m, x, y, MARK.hole, FULL); raise(m, x, y, MARK.cut, FULL); }
        else if (d < fray) raise(m, x, y, MARK.rim, FULL * (1 - d / fray));
      }
    }
  }
}
