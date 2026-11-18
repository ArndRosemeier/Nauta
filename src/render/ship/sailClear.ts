/**
 * Cloth that hangs clear of the masts (plan N3.10): a sail is a sheet of cloth bent by numbers (sailForm.ts `clothAt`),
 * and a belly pressed aft, a sail aback or a bunt rolled up would put it through the mast, the top, the cap or the
 * crosstrees behind it. So each sail is told the timber it must keep to the right side of (sim/ship/mastSolids.ts),
 * and the cloth is pushed out of it: forward of a mast's forward faces (a square sail, which hangs before its mast) or
 * aft of its after faces (the boom sail, which hangs abaft it), by a margin. Beside and above the timber the cloth
 * drapes over its edge: it may lie no farther aft than a slope `CLEAR_DRAPE` falls away from it, and the push fades out
 * within `CLEAR_REACH`; cloth that already lies behind a piece (a yardarm braced aft, gone round it) is left where it is.
 *
 * The table is made once from the rig plan and lies at the end of each sail's row (sailForm.ts `ROW.clear`): the sail
 * kind's vertex stage reads it with the rest of the row (sailMaterial.ts, the same function line for line) and
 * `cleared` here is its CPU copy, which places the lines made fast to the cloth where the GPU draws it.
 */
import type { RigPlan } from '../../sim/ship/rig';
import { mastSolids, type MastSolid } from '../../sim/ship/mastSolids';

/** The most timber a sail keeps clear of (a mast's shaft in two parts, masthead, cap, top, topmast, crosstrees, topgallant mast: eight). */
export const CLEAR_SOLIDS = 8;
/** Numbers per piece of timber (`AT`). */
export const CLEAR_STRIDE = 8;
/** Numbers per sail. */
export const CLEAR_FLOATS = CLEAR_SOLIDS * CLEAR_STRIDE;
/** How far cloth stays from the timber's faces, m. */
export const CLEAR_MARGIN = 0.04;
/** Cloth may lie this far back from the timber's face for each m it is from the timber's edge across her and above or below it (a slope), and the push falls to nothing this far (m) from the edge. */
export const CLEAR_DRAPE = 1;
export const CLEAR_REACH = 1;
/** Cloth deeper than the timber's whole thickness is pushed less and less, to nothing this many thicknesses beyond (it lies behind the piece). */
export const CLEAR_FADE = 1 / 2;
/**
 * Where each number of a piece of timber sits (offsets): the half width across her, the heights it spans, the side the
 * cloth keeps to (1 forward of it, −1 abaft it, 0 no timber here), its forward plane's z at y 0 and slope, its after plane's.
 */
export const AT = { half: 0, low: 1, high: 2, side: 3, front: 4, frontSlope: 5, back: 6, backSlope: 7 } as const;

/** A point of cloth (ship space); `cleared` moves its z. */
export interface ClothPoint {
  x: number;
  y: number;
  z: number;
}

/** Each sail's table, in the rig plan's order: a square sail's forward planes (its mast's timber), the boom sail's after planes (the main mast's), the rest none. */
export function clearTable(rig: RigPlan): Float32Array {
  const table = new Float32Array(rig.sails.length * CLEAR_FLOATS);
  rig.sails.forEach((sail, i) => {
    const side = sail.kind === 'square' ? 1 : sail.kind === 'boom' ? -1 : 0;
    const solids: MastSolid[] = side === 0 || sail.mast === 'bowsprit' ? [] : mastSolids(rig.masts[sail.mast]);
    if (solids.length > CLEAR_SOLIDS) throw new Error(`${sail.id} keeps clear of ${solids.length} pieces of timber, room for ${CLEAR_SOLIDS}`);
    solids.forEach((q, s) => {
      const at = (i * CLEAR_SOLIDS + s) * CLEAR_STRIDE;
      table[at + AT.half] = q.half;
      table[at + AT.low] = q.y0;
      table[at + AT.high] = q.y1;
      table[at + AT.side] = side;
      table[at + AT.front] = q.front.a - CLEAR_MARGIN;
      table[at + AT.frontSlope] = q.front.k;
      table[at + AT.back] = q.back.a + CLEAR_MARGIN;
      table[at + AT.backSlope] = q.back.k;
    });
  });
  return table;
}

/** GLSL's smoothstep from 0 to 1 (the shader's `smoothstep(0, 1, x)`). */
const smooth = (x: number): number => {
  const t = Math.min(Math.max(x, 0), 1);
  return t * t * (1 + 2 * (1 - t));
};

/** The point `p` of a sail's cloth (ship space) pushed out of the timber in `row` from float `from` on (its clearance table): its z moved forward of, or abaft, the pieces it lies in. */
export function cleared(row: ArrayLike<number>, from: number, p: ClothPoint): ClothPoint {
  let ahead = 0, abaft = 0;
  for (let s = 0; s < CLEAR_SOLIDS; s++) {
    const at = from + s * CLEAR_STRIDE, side = row[at + AT.side]!;
    if (side === 0) continue;
    // How far the point lies from the timber in her cross section (0 within it): the push is full there and falls off beside and above it.
    const across = Math.max(Math.abs(p.x) - row[at + AT.half]!, 0), up = Math.max(row[at + AT.low]! - p.y, p.y - row[at + AT.high]!, 0);
    const edge = Math.hypot(across, up), reach = 1 - smooth(edge / CLEAR_REACH);
    const front = row[at + AT.front]! + row[at + AT.frontSlope]! * p.y, back = row[at + AT.back]! + row[at + AT.backSlope]! * p.y;
    // How far past the face it keeps to the cloth lies, and as a share of the timber's thickness; then how far past the draped slope.
    const depth = side > 0 ? p.z - front : back - p.z;
    const over = depth - edge * CLEAR_DRAPE;
    const push = Math.max(over, 0) * (1 - smooth((depth / Math.max(back - front, CLEAR_MARGIN) - 1) / CLEAR_FADE)) * reach;
    if (side > 0) ahead = Math.max(ahead, push);
    else abaft = Math.max(abaft, push);
  }
  p.z += abaft - ahead;
  return p;
}
