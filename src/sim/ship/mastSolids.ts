/**
 * The masts' timber a sail must hang clear of (pure, plan N3.10): for each mast, the boxes its shaft, masthead, cap,
 * top, topmast, crosstrees and topgallant mast fill, each as the width it spans across her, the heights it spans, and
 * the planes of its forward and after faces (ship space, z = a + k·y: the masts rake, so a face leans with height).
 * Read from the same spar table and timber rules the drawing builds the masts from (render/ship/masts.ts), so what
 * the sails keep clear of is what is drawn; render/ship/sailClear.ts turns them into the cloth's drape.
 */
import {
  CAP_RIM, CAP_THICK, CROSSTREES_DEPTH, MAST_SPARS, MASTHEAD_SIDE, TOP_RIM, TOPMAST_TRESTLE_REACH, type MastName,
} from '../rules/rig';
import { shipY, shipZ } from './section';
import type { MastGeometry } from './spars';

/** A plane across her, z = a + k·y (ship space). */
export interface FacePlane {
  readonly a: number;
  readonly k: number;
}

/** A box of a mast's timber: its half width across her, the heights (ship y) it spans, and its forward (smaller z) and after faces. */
export interface MastSolid {
  readonly name: string;
  readonly mast: MastName;
  readonly half: number;
  readonly y0: number;
  readonly y1: number;
  readonly front: FacePlane;
  readonly back: FacePlane;
}

/** How many segments a lower mast's shaft is taken in (it tapers from the partners to the hounds). */
const SHAFT_PARTS = 2;

/** The plane of an axis `at` (along her, from a height above her base) shifted `along` m forward (+) of it, over heights `h0` to `h1`. */
function facePlane(at: (h: number) => number, along: number, h0: number, h1: number): FacePlane {
  const z0 = shipZ(at(h0) + along), z1 = shipZ(at(h1) + along), y0 = shipY(h0), y1 = shipY(h1);
  const k = (z1 - z0) / (y1 - y0);
  return { a: z0 - k * y0, k };
}

/** The timber of a mast, from her rig plan's mast geometry. */
export function mastSolids(g: MastGeometry): MastSolid[] {
  const row = MAST_SPARS[g.mast], mast = g.mast, out: MastSolid[] = [];
  const piece = (name: string, half: number, h0: number, h1: number, front: FacePlane, back: FacePlane) =>
    out.push({ name: `${mast} ${name}`, mast, half, y0: shipY(h0), y1: shipY(h1), front, back });
  // A piece standing on an axis: `fore` m ahead of it and `aft` m behind (along her).
  const on = (name: string, half: number, h0: number, h1: number, at: (h: number) => number, fore: number, aft: number) =>
    piece(name, half, h0, h1, facePlane(at, fore, h0, h1), facePlane(at, -aft, h0, h1));
  const r0 = row.lower.partners / 2, r1 = row.lower.hounds / 2;
  for (let i = 0; i < SHAFT_PARTS; i++) {
    const h0 = g.deck + ((g.lowerHounds - g.deck) * i) / SHAFT_PARTS, h1 = g.deck + ((g.lowerHounds - g.deck) * (i + 1)) / SHAFT_PARTS;
    // The widest the shaft is within the part (its lower end).
    const r = r0 + ((r1 - r0) * (h0 - g.deck)) / (g.lowerHounds - g.deck);
    on(`shaft ${i + 1}`, r, h0, h1, g.lowerAt, r, r);
  }
  on('masthead', MASTHEAD_SIDE / 2, g.lowerHounds, g.lowerHead, g.lowerAt, MASTHEAD_SIDE / 2, MASTHEAD_SIDE / 2);
  // The cap on the masthead: from its after side to the front of the topmast it holds.
  const topmastAhead = row.topmast.diameter / 2 + CAP_RIM;
  piece('cap', MASTHEAD_SIDE / 2 + CAP_RIM, g.lowerHead - CAP_THICK, g.lowerHead,
    facePlane(g.topmastAt, topmastAhead, g.lowerHead - CAP_THICK, g.lowerHead), facePlane(g.lowerAt, -(MASTHEAD_SIDE / 2 + CAP_RIM), g.lowerHead - CAP_THICK, g.lowerHead));
  // The top: the trestle trees under it to its rim over its floor.
  on('top', row.top.breadth / 2, g.lowerHounds, g.topFloor + TOP_RIM, g.lowerAt, row.top.length / 2, row.top.length / 2);
  on('topmast', row.topmast.diameter / 2, g.lowerHounds, g.topmastHead, g.topmastAt, row.topmast.diameter / 2, row.topmast.diameter / 2);
  on('crosstrees', row.crosstrees, g.crosstrees - CROSSTREES_DEPTH, g.crosstrees, g.topmastAt, TOPMAST_TRESTLE_REACH, TOPMAST_TRESTLE_REACH);
  on('topgallant mast', row.topgallant.diameter / 2, g.topmastHounds, g.truck, g.topgallantAt, row.topgallant.diameter / 2, row.topgallant.diameter / 2);
  return out;
}
