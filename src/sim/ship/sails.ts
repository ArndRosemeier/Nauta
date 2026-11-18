/**
 * The brig's sails (pure, N3.2): each sail's corners in her, its area and the ways it can stand (furled, reefed,
 * set), from rules/rig.ts. The sailing model (N3.3) takes the area of each sail as it stands; the drawing (N3.10)
 * shapes the cloth between the corners.
 */
import { BOOM_SAIL, COURSE_CLEW, COURSE_GORE, SAILS, type ForeAftSailRow, type MastName, type SailRow } from '../rules/rig';
import { between, distance, named, onSpar, point, type MastGeometry, type RigPoint, type Spar } from './spars';

/** How a sail's area is reckoned: a square sail as a trapezium (its head, foot and drop, m), the others from their corners, m². */
export type SailShape =
  | { readonly kind: 'trapezium'; readonly head: number; readonly foot: number; readonly drop: number }
  | { readonly kind: 'flat'; readonly area: number };

export interface Sail {
  readonly id: string;
  readonly name: string;
  readonly kind: SailRow['kind'];
  readonly mast: MastName | 'bowsprit';
  /** Its corners by name: a square sail's `head-p`, `head-s`, `clew-p`, `clew-s`; the boom sail's `tack`, `throat`, `peak`, `clew`; a headsail's or staysail's `tack`, `head`, `clew`. In order round its edge. */
  readonly corners: readonly { readonly name: string; readonly at: RigPoint }[];
  /** The spars it is bent to (its yard, or the boom and gaff), or the stay it is hanked to. */
  readonly on: readonly string[];
  readonly shape: SailShape;
  readonly reefs: number;
  readonly reefShare: number;
}

/** How a sail stands: furled, or set with so many reefs taken in. */
export interface SailSetting {
  readonly set: boolean;
  readonly reefs: number;
}

/** The ways a sail can stand: furled, then set with every reef in down to none (full sail last). */
export function sailSettings(sail: Sail): SailSetting[] {
  const out: SailSetting[] = [{ set: false, reefs: 0 }];
  for (let r = sail.reefs; r >= 0; r--) out.push({ set: true, reefs: r });
  return out;
}

/** A sail's area as it stands, m². A reef takes its share of the drop off a square sail's head; off a fore-and-aft sail's area. */
export function sailArea(sail: Sail, setting: SailSetting = { set: true, reefs: 0 }): number {
  if (!setting.set) return 0;
  if (setting.reefs < 0 || setting.reefs > sail.reefs) throw new Error(`${sail.id} has ${sail.reefs} reefs, not ${setting.reefs}`);
  const taken = setting.reefs * sail.reefShare;
  const s = sail.shape;
  if (s.kind === 'flat') return s.area * (1 - taken);
  const head = s.head + (s.foot - s.head) * taken;
  return ((head + s.foot) / 2) * s.drop * (1 - taken);
}

/** The area inside a ring of corners, as they lie in her centreline plane (along, height) or square across her (across, height). */
function ringArea(points: readonly RigPoint[]): number {
  const flatAcross = points.every((p) => Math.abs(p.across - points[0]!.across) < SAME);
  const u = (p: RigPoint) => (flatAcross ? p.along : p.across);
  let twice = 0;
  points.forEach((p, i) => {
    const q = points[(i + 1) % points.length]!;
    twice += u(p) * q.height - u(q) * p.height;
  });
  return Math.abs(twice) / 2;
}
/** Two coordinates this close are one, m. */
const SAME = 1e-9;

/** Where a sail's foot and leech meet below its luff, in her centreline plane: the clew of a headsail or staysail. */
function clewBelow(tack: RigPoint, head: RigPoint, foot: number, leech: number, id: string): RigPoint {
  const d = distance(tack, head);
  if (!(foot + leech > d && foot + d > leech && leech + d > foot)) throw new Error(`${id}: its foot and leech cannot meet`);
  const x = (foot * foot - leech * leech + d * d) / (2 * d), h = Math.sqrt(foot * foot - x * x);
  const ua = (head.along - tack.along) / d, uh = (head.height - tack.height) / d;
  // Of the two places either side of the luff, the one under it.
  const at = (sign: number) => point(tack.along + ua * x + sign * uh * h, 0, tack.height + uh * x - sign * ua * h);
  const under = (p: RigPoint) => p.height - (tack.height + ((p.along - tack.along) * uh) / ua);
  const a = at(1), b = at(-1);
  return under(a) < under(b) ? a : b;
}

/** Her sails, from the spars, the masts' heights and the stays (by line id: its upper and lower end). */
export function buildSails(spars: ReadonlyMap<string, Spar>, geometry: Readonly<Record<MastName, MastGeometry>>, stays: ReadonlyMap<string, readonly [RigPoint, RigPoint]>): Sail[] {
  return SAILS.map((row): Sail => {
    const common = { id: row.id, name: row.name, kind: row.kind, reefs: row.reefs, reefShare: row.reefShare };
    if (row.kind === 'square') {
      const yard = spars.get(row.yard)!, y = yard.yard!, mast = yard.mast as MastName;
      const half = yard.length / 2 - y.arm;
      const headAt = (side: number) => point(yard.heel.along, side * half, y.hoisted);
      let clewHalf: number, clewHeight: number, clewAlong: number;
      if (row.sheetedTo) {
        const below = spars.get(row.sheetedTo)!;
        clewHalf = below.length / 2 - below.yard!.arm;
        clewHeight = below.yard!.hoisted;
        clewAlong = below.heel.along;
      } else {
        const g = geometry[mast];
        clewHalf = half + COURSE_GORE;
        clewHeight = g.deck + COURSE_CLEW[mast];
        clewAlong = g.lowerAt(clewHeight) + (yard.heel.along - g.lowerAt(y.hoisted));
      }
      const clewAt = (side: number) => point(clewAlong, side * clewHalf, clewHeight);
      return {
        ...common, mast, on: [yard.id],
        corners: [
          { name: 'head-p', at: headAt(-1) }, { name: 'head-s', at: headAt(1) }, { name: 'clew-s', at: clewAt(1) }, { name: 'clew-p', at: clewAt(-1) },
        ],
        shape: { kind: 'trapezium', head: 2 * half, foot: 2 * clewHalf, drop: y.hoisted - clewHeight },
      };
    }
    if (row.kind === 'boom') {
      const boom = spars.get('boom')!, gaff = spars.get('gaff')!;
      const corners = [
        { name: 'tack', at: point(boom.heel.along, 0, boom.heel.height + BOOM_SAIL.tack) },
        { name: 'throat', at: gaff.heel },
        { name: 'peak', at: onSpar(gaff, gaff.length - BOOM_SAIL.peakShort) },
        { name: 'clew', at: onSpar(boom, boom.length - BOOM_SAIL.clewShort) },
      ];
      return { ...common, mast: 'main', on: [boom.id, gaff.id], corners, shape: { kind: 'flat', area: ringArea(corners.map((c) => c.at)) } };
    }
    const r = row as ForeAftSailRow, [upper, lower] = stays.get(r.stay!)!;
    const tack = between(lower, upper, r.luff![0]), head = between(lower, upper, r.luff![1]);
    const clew = clewBelow(tack, head, r.foot!, r.leech!, r.id);
    const corners = [{ name: 'tack', at: tack }, { name: 'head', at: head }, { name: 'clew', at: clew }];
    return { ...common, mast: r.kind === 'head' ? 'bowsprit' : 'main', on: [r.stay!], corners, shape: { kind: 'flat', area: ringArea([tack, head, clew]) } };
  });
}

/** A named corner of a sail. */
export const corner = (sail: Sail, name: string): RigPoint => named(sail.corners, name, sail.id).at;

/** A point on a sail's edge: a share of the way from one corner to the next (a leech's middle, a reef cringle). */
export const edgePoint = (sail: Sail, from: string, to: string, t: number): RigPoint => between(corner(sail, from), corner(sail, to), t);

