/**
 * Her spars drawn from the rig plan (plan N3.6, sim/ship/spars.ts): each mast raked as the plan rakes it, the lower
 * mast through her decks with its hoops, square masthead and cap; the trestle trees, crosstrees and top; the topmast
 * through the cap with its own crosstrees and cap; the topgallant mast and its truck; the yards slung before the
 * masts; the bowsprit with its cap, the jib-boom and the dolphin striker; the main boom and gaff. A yard, the boom and
 * the gaff are drawn into their own turning frame's solid (swings.ts), so they brace and swing with the simulation.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import {
  CAP_RIM, CAP_THICK, CROSSTREES_AT, CROSSTREES_DEPTH, CROSSTREES_TIMBERS, MAST_RAKE, MAST_SPARS, MASTHEAD_SIDE, TOP_CROSSTREES_DEEP, TOP_RIM, TOPMAST_TRESTLE_REACH, TRESTLE_DEPTH,
  TRESTLE_SIDED, type MastName,
} from '../../sim/rules/rig';
import { MAIN_TOP, PLANKING } from '../../sim/rules/ships';
import { onSpar, point, topHole, type MastGeometry, type RigPoint, type Spar } from '../../sim/ship/spars';
import { sparOf, type RigPlan } from '../../sim/ship/rig';
import { shipY } from '../../sim/ship/section';
import { box, frameAlong, lathe } from './shapes';
import { BLACK, IRON, MAST, OAK } from './looks';
import type { Solid } from './solid';
import type { ZoneParts } from './parts';
import { BEVEL, SMALL_BEVEL } from './hullSide';
import { shipPoint } from './swings';

/** Sides of a turned lower mast, of the other spars, and of every spar on the far ship. */
const MAST_SIDES = 24;
const SPAR_SIDES = 12;
const FAR_SIDES = 6;
/** Iron hoops on the lower mast: how far apart, their width and thickness, m. */
const HOOP = { pitch: 1.25, width: 0.06, thick: 0.012 } as const;
/** A topmast is square where it stands in the trestle trees and the cap, round above, tapering to this share at its hounds; its head square at this share. */
const TOPMAST_HOUNDS = 0.85;
const TOPMAST_HEAD = 0.8;
/** A topgallant mast tapers to this share at its hounds and its pole to this share at the truck. */
const TOPGALLANT_HOUNDS = 0.75;
const TOPGALLANT_POLE = 0.5;
/** The truck on the topgallant pole: its radius as a share of the mast's diameter, and its thickness, m. */
const TRUCK = { radius: 1.4, thick: 0.07 } as const;
/** The topmast cap is this share of the lower cap's thickness. */
const TOPMAST_CAP = 0.6;
/** A yard's arms are this share of its diameter at the slings; places along a yard (shares of its length) its profile is turned at. */
const YARD_ARM = 0.45;
const YARD_ROWS = [0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9, 1] as const;
/** The bowsprit: its heel and cap as shares of its diameter at the stem; its cap's thickness along it, m. */
const BOWSPRIT_HEEL = 0.85;
const BOWSPRIT_CAP = 0.62;
const BOWSPRIT_CAP_THICK = 0.2;
/** The jib-boom and the boom and gaff taper to these shares at their ends. */
const JIB_END = 0.55;
const BOOM_END = 0.7;
/** The boom's and gaff's jaws: horns either side of the mast, their thickness, m, and how far round the mast they reach (a share of its diameter). */
const JAWS = { thick: 0.08, reach: 1.1 } as const;

/** Where the spars are drawn: her outside, the zones below a place (the lower masts stand through her decks), each turning spar's own parts. */
export interface SparTargets {
  readonly out: ZoneParts;
  readonly below: (along: number, h: number) => ZoneParts | null;
  readonly swung: (id: string) => ZoneParts | null;
  readonly far: boolean;
}

/** Every spar of her rig. */
export function drawSpars(rig: RigPlan, t: SparTargets): void {
  for (const mast of ['fore', 'main'] as const) buildMast(rig, mast, t);
  const sparNamed = (id: string) => sparOf(rig, id);
  const sides = t.far ? FAR_SIDES : SPAR_SIDES;
  for (const s of rig.spars.filter((x) => x.yard)) yard(t.swung(s.id)?.wood ?? t.out.wood, s, sides);
  // The bowsprit, its cap holding the jib-boom, and the dolphin striker under the cap.
  const bowsprit = sparNamed('bowsprit'), jib = sparNamed('jib-boom'), striker = sparNamed('dolphin-striker');
  const stem = bowsprit.marks.find((m) => m.name === 'stem')!.at;
  // Each named for its spar: it can fall (plan N6.5).
  const wood = t.out.wood;
  wood.tagged(bowsprit.id, () => {
    turned(wood, bowsprit, [[0, BOWSPRIT_HEEL], [stem, 1], [bowsprit.length, BOWSPRIT_CAP]], sides, MAST);
    const capFrame = frameAlong(shipPoint(bowsprit.heel), shipPoint(bowsprit.head));
    const capMiddle = shipPoint(bowsprit.head).lerp(shipPoint(onSpar(jib, jib.marks.find((m) => m.name === 'cap')!.at)), 1 / 2);
    capFrame.setPosition(capMiddle);
    box(wood, capFrame, [bowsprit.diameter * BOWSPRIT_CAP + 2 * CAP_RIM, BOWSPRIT_CAP_THICK, bowsprit.diameter * BOWSPRIT_CAP + jib.diameter + 2 * CAP_RIM], BLACK, BEVEL, 1);
  });
  wood.tagged(jib.id, () => turned(wood, jib, [[0, 1], [jib.length, JIB_END]], sides, MAST));
  wood.tagged(striker.id, () => turned(wood, striker, [[0, 1], [striker.length, 1]], sides, BLACK));
  // The boom and the gaff with their jaws round the mainmast.
  for (const [id, mastD] of [['boom', MAST_SPARS.main.lower.partners], ['gaff', MAST_SPARS.main.lower.hounds]] as const) {
    const s = sparNamed(id), solid = t.swung(id)?.wood ?? t.out.wood;
    turned(solid, s, [[0, 1], [s.length, BOOM_END]], sides, MAST);
    const f = frameAlong(shipPoint(s.heel), shipPoint(s.head)), reach = JAWS.reach * mastD;
    for (const side of [1, -1]) {
      const m = f.clone().multiply(new Matrix4().makeTranslation(side * (mastD + JAWS.thick) / 2, -reach / 2, 0));
      box(solid, m, [JAWS.thick, reach, s.diameter], BLACK, SMALL_BEVEL, 1);
    }
  }
}

/** A spar turned along its axis: `radii` are [m from the heel, share of its diameter], heel first. */
function turned(s: Solid, spar: Spar, radii: readonly (readonly [number, number])[], sides: number, finish: typeof MAST): void {
  lathe(s, frameAlong(shipPoint(spar.heel), shipPoint(spar.head)), [[0, 0], ...radii.map(([at, k]) => [k * spar.diameter / 2, at] as [number, number]), [0, spar.length]], sides, finish);
}

/** A yard: round, tapering from the slings to its arms, painted black. */
function yard(s: Solid, spar: Spar, sides: number): void {
  turned(s, spar, YARD_ROWS.map((u) => [u * spar.length, 1 - (1 - YARD_ARM) * (2 * u - 1) ** 2] as const), sides, BLACK);
}

/** A frame on a mast's raked axis at a point (its y up the mast, z aft). */
function raked(mast: MastName, p: RigPoint): Matrix4 {
  return new Matrix4().makeRotationX(Math.atan(MAST_RAKE[mast])).setPosition(shipPoint(p));
}

/** A box on a mast's raked axis from height `h0` to `h1`, `along` the axis function, square `side` (or `breadth` × `length`). */
function mastBox(s: Solid, mast: MastName, at: (h: number) => number, h0: number, h1: number, size: readonly [number, number], f: typeof BLACK, bevel: number): void {
  const h = (h0 + h1) / 2, len = (h1 - h0) * Math.hypot(1, MAST_RAKE[mast]);
  box(s, raked(mast, point(at(h), 0, h)), [size[0], len, size[1]], f, bevel, 1);
}

/** A turned piece on a mast's axis from height `h0` (radius r0) to `h1` (radius r1). */
function mastTurned(s: Solid, at: (h: number) => number, h0: number, r0: number, h1: number, r1: number, sides: number, f: typeof MAST): void {
  const a = shipPoint(point(at(h0), 0, h0)), b = shipPoint(point(at(h1), 0, h1)), len = a.distanceTo(b);
  lathe(s, frameAlong(a, b), [[0, 0], [r0, 0], [r1, len], [0, len]], sides, f);
}

/**
 * One mast: the lower mast, its top, the topmast and its crosstrees, the topgallant mast. What stands above her deck
 * is named for its spar in her outside's solids (`tagged`): each can fall (plan N6.5).
 */
function buildMast(rig: RigPlan, mast: MastName, t: SparTargets): void {
  const { wood, iron } = t.out, forSpar = (id: string, draw: () => void) => wood.tagged(id, () => iron.tagged(id, draw));
  const g: MastGeometry = rig.masts[mast], row = MAST_SPARS[mast];
  const sides = t.far ? FAR_SIDES : MAST_SIDES, small = t.far ? FAR_SIDES : SPAR_SIDES;
  const r0 = row.lower.partners / 2, r1 = row.lower.hounds / 2;
  // --- The lower mast: below the deck in the rooms it stands through, then tapering to the hounds, its masthead square.
  const deckUnder = g.deck - PLANKING.deck, middle = (g.heel + deckUnder) / 2;
  for (const [h0, h1] of [[g.heel, middle], [middle, deckUnder]] as const) {
    const z = t.below(g.lowerAt((h0 + h1) / 2), (h0 + h1) / 2);
    if (z) mastTurned(z.wood, g.lowerAt, h0, r0, h1, r0, sides, MAST);
  }
  const level = (along: number, x: number, y: number) => new Matrix4().makeTranslation(x, shipY(y), -along);
  forSpar(`${mast}-mast`, () => {
    mastTurned(wood, g.lowerAt, g.deck, r0, g.lowerHounds, r1, sides, MAST);
    const radiusAt = (h: number) => r0 + (r1 - r0) * (h - g.deck) / (g.lowerHounds - g.deck);
    for (let h = g.deck + HOOP.pitch; !t.far && h < g.lowerHounds - HOOP.pitch / 2; h += HOOP.pitch) {
      const rr = radiusAt(h) + HOOP.thick;
      lathe(iron, raked(mast, point(g.lowerAt(h), 0, h)), [[rr - HOOP.thick, -HOOP.width / 2], [rr, -HOOP.width / 2], [rr, HOOP.width / 2], [rr - HOOP.thick, HOOP.width / 2]], sides, IRON);
    }
    mastBox(wood, mast, g.lowerAt, g.lowerHounds, g.lowerHead, [MASTHEAD_SIDE, MASTHEAD_SIDE], BLACK, BEVEL);
    // The cap on the masthead, holding the topmast before it.
    cap(wood, mast, g.lowerAt, g.topmastAt, g.lowerHead, MASTHEAD_SIDE, row.topmast.diameter, CAP_THICK);

    // --- The top: trestle trees fore and aft either side of the masthead, crosstrees across, the floor with its hole, the rim.
    const tt = g.lowerHounds + TRESTLE_DEPTH / 2, at = g.lowerAt(tt), top = row.top, hole = topHole(mast) / 2;
    for (const s of [1, -1]) box(wood, level(at, s * (MASTHEAD_SIDE + TRESTLE_SIDED) / 2, tt), [TRESTLE_SIDED, TRESTLE_DEPTH, top.length], OAK, BEVEL, 2);
    for (const s of [1, -1]) box(wood, level(at + s * CROSSTREES_AT * top.length, 0, tt), [top.breadth, TOP_CROSSTREES_DEEP, TRESTLE_SIDED], OAK, BEVEL, 0);
    const floor = g.topFloor - MAIN_TOP.thick / 2, wing = top.breadth / 2 - hole, fa = g.lowerAt(floor);
    for (const s of [1, -1]) {
      box(wood, level(fa, s * (hole + wing / 2), floor), [wing, MAIN_TOP.thick, top.length], BLACK, SMALL_BEVEL, 2);
      box(wood, level(fa + s * (hole + (top.length / 2 - hole) / 2), 0, floor), [2 * hole, MAIN_TOP.thick, top.length / 2 - hole], BLACK, SMALL_BEVEL, 0);
      box(wood, level(fa, s * top.breadth / 2, floor + TOP_RIM / 2), [TRESTLE_SIDED, MAIN_TOP.thick + TOP_RIM, top.length], BLACK, SMALL_BEVEL, 2);
    }
  });

  // --- The topmast: square where it stands in the trestle trees and the cap, round above, its head square; its crosstrees and cap.
  const d = row.topmast.diameter, tg = row.topgallant.diameter;
  forSpar(`${mast}-topmast`, () => {
    mastBox(wood, mast, g.topmastAt, g.lowerHounds, g.lowerHead, [d, d], MAST, SMALL_BEVEL);
    mastTurned(wood, g.topmastAt, g.lowerHead, d / 2, g.topmastHounds, TOPMAST_HOUNDS * d / 2, small, MAST);
    mastBox(wood, mast, g.topmastAt, g.topmastHounds, g.topmastHead, [TOPMAST_HEAD * d, TOPMAST_HEAD * d], BLACK, SMALL_BEVEL);
    const ct = g.crosstrees - CROSSTREES_DEPTH / 2, ca = g.topmastAt(ct);
    for (const s of [1, -1]) box(wood, level(ca, s * (TOPMAST_HEAD * d + TRESTLE_SIDED) / 2, ct), [TRESTLE_SIDED, CROSSTREES_DEPTH, 2 * TOPMAST_TRESTLE_REACH], OAK, SMALL_BEVEL, 2);
    for (const s of [1, -1]) box(wood, level(ca + s * CROSSTREES_TIMBERS.apart / 2, 0, ct), [2 * row.crosstrees, CROSSTREES_DEPTH, CROSSTREES_TIMBERS.sided], OAK, SMALL_BEVEL, 0);
    cap(wood, mast, g.topmastAt, g.topgallantAt, g.topmastHead, TOPMAST_HEAD * d, tg, CAP_THICK * TOPMAST_CAP);
  });

  // --- The topgallant mast, its pole and the truck.
  forSpar(`${mast}-topgallant-mast`, () => {
    mastTurned(wood, g.topgallantAt, g.topmastHounds, tg / 2, g.topgallantHounds, TOPGALLANT_HOUNDS * tg / 2, small, MAST);
    mastTurned(wood, g.topgallantAt, g.topgallantHounds, TOPGALLANT_HOUNDS * tg / 2, g.truck, TOPGALLANT_POLE * tg / 2, small, MAST);
    const tr = TRUCK.radius * tg / 2;
    lathe(wood, raked(mast, point(g.topgallantAt(g.truck), 0, g.truck)), [[0, 0], [tr, 0], [tr, TRUCK.thick], [0, TRUCK.thick]], small, BLACK);
  });
}

/** A cap: on the head of the mast below (`lowerAt`, square `aftSide`), holding the mast before it (`foreAt`, diameter `foreD`), its top at `h`. */
function cap(s: Solid, mast: MastName, lowerAt: (h: number) => number, foreAt: (h: number) => number, h: number, aftSide: number, foreD: number, thick: number): void {
  const y = h - thick / 2, aft = lowerAt(y) - aftSide / 2 - CAP_RIM, fore = foreAt(y) + foreD / 2 + CAP_RIM;
  const m = raked(mast, point((aft + fore) / 2, 0, y));
  box(s, m, [aftSide + 2 * CAP_RIM, thick, fore - aft], BLACK, BEVEL, 2);
}

/** A mast's axis point at a height in ship space (for the rigging's eyes and blocks). */
export const mastPoint = (at: (h: number) => number, h: number): Vector3 => shipPoint(point(at(h), 0, h));
