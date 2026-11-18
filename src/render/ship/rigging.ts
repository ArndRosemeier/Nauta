/**
 * Every line of the rig plan drawn (plan N3.6; ship.md: "every rope is a real line between two real points"): each
 * standing and running line from its upper or working end through its blocks to where it is set up or belayed,
 * each leg sagging by how taut it is, a block at every turn; the ratlines on every set of shrouds at the steps the
 * climb uses (aloft.ts), the futtock staves, each yard's footropes and stirrups and the jib-boom's horses.
 *
 * Lines made fast to a turning spar follow it on the GPU (rope.ts RopeFollow, swings.ts), so a yard braced round
 * carries its braces, lifts, sheets and gear with it. A line made fast to a sail (a sheet, clewline, buntline,
 * bowline, halliard) is laid to its point of the sail set flat and is carried by that point's own frame to wherever
 * the sail is drawn (sailForm.ts `sailPoints`): sheeted home, clewed up, hauled down or furled.
 */
import { Matrix4, Vector3 } from 'three/webgpu';
import { footropeY, yardPoint } from '@futuremagic/figure/rigging';
import type { Ladder } from '@futuremagic/figure/ladder';
import { RATLINE_PITCH, ROPE } from '../../sim/rules/ships';
import type { RigLine } from '../../sim/ship/lines';
import { sparOf, type RigPlan } from '../../sim/ship/rig';
import { between, distance, point, type RigPoint, type Spar } from '../../sim/ship/spars';
import { shipY } from '../../sim/ship/section';
import { lathe } from './shapes';
import { OAK } from './looks';
import type { Solid } from './solid';
import { FEW_SIDES, HEMP, TARRED, legFollow, sagging, type RopeFollow, type Ropes } from './rope';
import { shipPoint, swingOf, type Swing } from './swings';
import { pointOfEnd, sailForms, sailPoints, type SailForm, type SailPoint } from './sailForm';

/** How far a leg sags at its middle, as a share of its length: a taut shroud or stay, a running line, and a leg to a sail (laid with the sail set; it shortens as the sail is clewed up). */
const SAG = { standing: 0.003, stay: 0.005, running: 0.025, toSail: 0.008 } as const;
/** A leg is drawn in pieces this long, m, standing and running, near and far, and at most this many. */
const PIECE = { standing: 3, running: 0.7, far: 3 } as const;
const MOST_PIECES = 28;
const FAR_PIECES = 8;
/** Eyes of standing lines round one masthead are stacked this high a pair, m, and lie this far fore and aft of the middle (for a shroud's thickness). */
const EYE_STACK = 0.05;
const EYE_FORE_AFT = 0.09;
/** Points this close are one (blocks at one place), m; blocks at one place are spread this far apart. */
const SAME_PLACE = 0.02;
const BLOCK_GAP = 0.13;
/** A block's length is this many of its rope's diameters, never under this, m; its half width and half thickness as shares of its length. */
const BLOCK_PER_DIAMETER = 9;
const BLOCK_LEAST = 0.14;
const BLOCK_WIDTH = 0.3;
const BLOCK_THICK = 0.22;
/** The block's shell as a turned profile: [share of its half width, share of its length from the middle]. */
const BLOCK_PROFILE: readonly (readonly [number, number])[] = [[0, -0.5], [0.55, -0.45], [0.9, -0.25], [1, 0], [0.9, 0.25], [0.55, 0.45], [0, 0.5]];
const BLOCK_SIDES = 8;
/** A via within this of a turning spar's axis is on that spar, m (its radius and a block's). */
const ON_SPAR = 0.15;
/** Ratlines start this far over the upper deadeyes, m, and sag this much between two shrouds, m. */
const RATLINE_OVER = 0.3;
const RATLINE_SAG = 0.012;
/** The futtock stave: a served bar across the lower shrouds, its radius, m. */
const STAVE_RADIUS = 0.025;
/** A footrope is drawn every this far along its yard, m; it is made fast this far past the slings on the other side, m. */
const FOOTROPE_STEP = 0.3;
const FOOTROPE_CROSS = 0.3;
/** The figure's footrope defaults (@futuremagic/figure): where it starts from the yard's middle and its stirrups' spacing, m. */
const FOOTROPE_INNER = 0.5;
const STIRRUP_SPACING = 2.4;
/** A footrope's and a stirrup's diameter, m (Steel's brig), and the jib-boom's horses' sag, m. */
const FOOTROPE = 0.024;
const HORSE_SAG = 0.15;

/** Where a line set up to a deadeye leaves it (ship space), from the deadeyes' builder (rig.ts). */
export interface LineFoot {
  readonly at: Vector3;
}

/** What the rigging is drawn into: her ropes, the solid of each moving frame (0 her hull) for its blocks, where lines leave their deadeyes. */
export interface RiggingTargets {
  readonly ropes: Ropes;
  readonly solid: (frame: number) => Solid;
  readonly feet: ReadonlyMap<string, LineFoot>;
  readonly far: boolean;
}

/** A point of a line in ship space and the moving frame that carries it. */
interface Knot {
  readonly at: Vector3;
  readonly frame: number;
}

/** Every line, the ratlines, staves and footropes. */
export function buildRigging(rig: RigPlan, swings: readonly Swing[], t: RiggingTargets): void {
  const ctx = new Rigging(rig, swings, t);
  for (const line of rig.lines) ctx.drawLine(line);
  if (t.far) return;
  for (const c of rig.climbs) {
    const of = (kind: RigLine['kind']) => ctx.drawnOf(rig.lines.filter((l) => l.kind === kind && sparOf(rig, l.serves).mast === c.mast && l.side === c.side));
    const shrouds = of('shroud');
    ctx.ratlines(shrouds, c.shroud, RATLINE_OVER);
    ctx.ratlines(of('futtock shroud'), c.futtock, 0);
    ctx.ratlines(of('topmast shroud'), c.topmast, RATLINE_OVER);
    ctx.ratlines(of('topgallant shroud'), c.topgallant, 0);
    ctx.stave(shrouds, c.futtock.lo);
  }
  ctx.footropes();
}

class Rigging {
  /** Each standing line as drawn, from its foot to its head (ship space): the ratlines are seized across them. */
  private readonly drawn = new Map<string, [Vector3, Vector3]>();
  /** How many blocks are at each place so far, to spread them. */
  private readonly blocksAt = new Map<string, number>();
  /** How many eyes go round each masthead so far, to stack them. */
  private readonly eyesAt = new Map<string, number>();

  private readonly forms: readonly SailForm[];
  private readonly points: readonly SailPoint[];

  constructor(private readonly rig: RigPlan, private readonly swings: readonly Swing[], private readonly t: RiggingTargets) {
    this.forms = sailForms(rig);
    this.points = sailPoints(rig, this.forms, swings.length + 1);
  }

  private frameOfSpar(id: string): number { return swingOf(this.swings, id)?.frame ?? 0; }

  /** The moving frame a point between a line's ends is carried by: the turning spar it lies on, else her hull. */
  private frameNear(p: RigPoint): number {
    for (const w of this.swings) {
      const s = sparOf(this.rig, w.id), len = s.length, u = ((p.along - s.heel.along) * (s.head.along - s.heel.along) + (p.across - s.heel.across) * (s.head.across - s.heel.across) + (p.height - s.heel.height) * (s.head.height - s.heel.height)) / (len * len);
      if (u >= 0 && u <= 1 && distance(p, between(s.heel, s.head, u)) < s.diameter / 2 + ON_SPAR) return w.frame;
    }
    return 0;
  }

  /** Where a line's end is, and what carries it: a sail's point (with the sail set flat) and its own frame, a spar, else her hull. */
  private endKnot(line: RigLine, end: number): Knot {
    const e = line.ends[end]!;
    if (e.on === 'sail') {
      const p = pointOfEnd(this.points, this.forms, line, end);
      return { at: p.rest.clone(), frame: p.frame };
    }
    if (e.on === 'spar') return { at: shipPoint(e), frame: this.frameOfSpar(e.id) };
    return { at: shipPoint(e), frame: 0 };
  }

  /** A line: its knots from the upper or working end to where it is set up or belayed, each leg sagging, a block at each turn. */
  drawLine(line: RigLine): void {
    const knots: Knot[] = [this.endKnot(line, 0)];
    for (const v of line.via) knots.push({ at: shipPoint(v), frame: this.frameNear(v) });
    const foot = this.t.feet.get(line.id);
    const last = line.ends[1];
    if (foot) knots.push({ at: foot.at, frame: 0 });
    else if (last.on === 'belay') knots.push({ at: shipPoint(point(last.along, last.across, last.height + LINE_OFF_PIN)), frame: 0 });
    else knots.push(this.endKnot(line, 1));
    // A futtock shroud hangs from its plate under the top's deadeye.
    if (line.kind === 'futtock shroud') {
      const plate = this.t.feet.get(`${line.ends[0].id}:plate`);
      if (plate) knots[0] = { at: plate.at, frame: 0 };
    }
    if (line.standing && foot) knots[0] = { at: this.eye(knots[0]!.at, line), frame: knots[0]!.frame };
    // Blocks at one place are spread apart, along the yard they hang on or along her.
    for (let i = 1; i < knots.length - 1; i++) knots[i] = this.spread(knots[i]!);

    const pts: Vector3[] = [], follow: RopeFollow[] = [];
    const first = this.swings.length + 1;
    for (let i = 0; i < knots.length - 1; i++) {
      const a = knots[i]!, b = knots[i + 1]!, len = a.at.distanceTo(b.at);
      const share = line.standing ? (line.kind === 'stay' ? SAG.stay : SAG.standing) : a.frame >= first || b.frame >= first ? SAG.toSail : SAG.running;
      const pieces = this.t.far ? Math.max(1, Math.min(FAR_PIECES, Math.ceil(len / PIECE.far)))
        : Math.max(line.standing ? 1 : 2, Math.min(MOST_PIECES, Math.ceil(len / (line.standing ? PIECE.standing : PIECE.running))));
      const leg = sagging(a.at, b.at, share * len, pieces), f = legFollow(a.frame, a.at, b.frame, b.at, leg.length);
      const from = i === 0 ? 0 : 1;
      pts.push(...leg.slice(from));
      follow.push(...f.slice(from));
    }
    this.t.ropes.line(pts, line.diameter / 2, line.standing ? TARRED : HEMP, this.t.far ? FEW_SIDES : undefined, follow);
    if (line.standing) this.drawn.set(line.id, [knots[knots.length - 1]!.at, knots[0]!.at]);
    if (!this.t.far) for (let i = 1; i < knots.length - 1; i++) this.block(knots[i]!, knots[i - 1]!.at, knots[i + 1]!.at, line.diameter);
  }

  /** A standing line's eye round its masthead: the eyes at one masthead stacked in pairs, one forward and one aft. */
  private eye(at: Vector3, line: RigLine): Vector3 {
    const key = placeKey(at), k = this.eyesAt.get(key) ?? 0;
    this.eyesAt.set(key, k + 1);
    return at.clone().add(new Vector3(line.side * line.diameter / 2, Math.floor(k / 2) * EYE_STACK, (k % 2 === 0 ? -1 : 1) * EYE_FORE_AFT));
  }

  /** A block's place, moved aside from the blocks already at that place. */
  private spread(k: Knot): Knot {
    const key = `${placeKey(k.at)}:${k.frame}`, n = this.blocksAt.get(key) ?? 0;
    this.blocksAt.set(key, n + 1);
    if (!n) return k;
    const step = Math.ceil(n / 2) * (n % 2 ? 1 : -1) * BLOCK_GAP;
    return { at: k.at.clone().add(k.frame ? new Vector3(step, 0, 0) : new Vector3(0, 0, step)), frame: k.frame };
  }

  /** A block at a turn of a line, its length along the pull of the two legs, its sheave across them. */
  private block(k: Knot, from: Vector3, to: Vector3, diameter: number): void {
    // A leg of no length (a sheet's clew sheeted home to its block) leads on straight through the block.
    const a = from.clone().sub(k.at), b = to.clone().sub(k.at);
    if (b.lengthSq() < SAME_PLACE * SAME_PLACE) b.copy(a).negate();
    if (a.lengthSq() < SAME_PLACE * SAME_PLACE) a.copy(b).negate();
    if (a.lengthSq() < SAME_PLACE * SAME_PLACE) { a.copy(UP); b.copy(UP).negate(); }
    a.normalize();
    b.normalize();
    let y = a.clone().add(b);
    let z = new Vector3().crossVectors(a, b);
    if (z.lengthSq() < SAME_PLACE * SAME_PLACE) z = new Vector3().crossVectors(a, Math.abs(a.y) < 1 / 2 ? UP : ACROSS);
    z.normalize();
    if (y.lengthSq() < SAME_PLACE * SAME_PLACE) y = new Vector3().crossVectors(z, a);
    y.normalize();
    const x = new Vector3().crossVectors(y, z), length = Math.max(BLOCK_LEAST, BLOCK_PER_DIAMETER * diameter);
    const frame = new Matrix4().makeBasis(x, y, z).setPosition(k.at).scale(new Vector3(BLOCK_WIDTH * length, 1, BLOCK_THICK * length));
    lathe(this.t.solid(k.frame), frame, BLOCK_PROFILE.map(([r, u]) => [r, u * length] as [number, number]), BLOCK_SIDES, OAK);
  }

  /** Standing lines as drawn, by their place along her (aft first), foot then head. */
  drawnOf(lines: readonly RigLine[]): [Vector3, Vector3][] {
    return lines.map((l) => this.drawn.get(l.id)).filter((d): d is [Vector3, Vector3] => !!d).sort((p, q) => q[0].z - p[0].z);
  }

  /** The ratlines across a set of shrouds at the steps of the ladder they are climbed by, from `over` m above their feet. */
  ratlines(shrouds: readonly [Vector3, Vector3][], ladder: Ladder, over: number): void {
    if (shrouds.length < 2) return;
    const rung = ladder.rung ?? RATLINE_PITCH;
    const from = Math.max(...shrouds.map(([a, b]) => Math.min(a.y, b.y))) + over;
    for (let y = ladder.lo; y <= ladder.hi + SAME_PLACE; y += rung) {
      if (y < from) continue;
      const at = shrouds.map((s) => shroudAt(s, y));
      const pts: Vector3[] = [];
      for (let k = 0; k < at.length - 1; k++) pts.push(...sagging(at[k]!, at[k + 1]!, RATLINE_SAG, 2).slice(k ? 1 : 0));
      this.t.ropes.line(pts, ROPE.ratline / 2, TARRED, FEW_SIDES);
    }
  }

  /** The futtock stave across the lower shrouds, where the futtock shrouds come down to them. */
  stave(shrouds: readonly [Vector3, Vector3][], y: number): void {
    if (shrouds.length < 2) return;
    this.t.ropes.line(shrouds.map((s) => shroudAt(s, y)), STAVE_RADIUS, TARRED, FEW_SIDES);
  }

  /** Every yard's footropes with their stirrups, turning with the yard, and the jib-boom's horses. */
  footropes(): void {
    for (const s of this.rig.surfaces.filter((x) => x.kind === 'footrope')) {
      const spar = sparOf(this.rig, s.spar);
      if (!s.yard) { this.horse(spar, s.points); continue; }
      const f = s.yard, side = s.points[1]!.across > 0 ? 1 : -1, frame = this.frameOfSpar(spar.id), inner = f.inner ?? FOOTROPE_INNER;
      const scratch = { x: 0, y: 0, z: 0 };
      const on = (u: number, h: number) => { yardPoint(f, u, 0, h, scratch); return new Vector3(scratch.x, scratch.y, scratch.z); };
      const top = (u: number) => new Vector3(f.x + f.ax * u, f.y, f.z + f.az * u);
      const pts = [top(-side * FOOTROPE_CROSS)];
      for (let u = inner; u <= f.reach; u += FOOTROPE_STEP) pts.push(on(side * u, footropeY(f, side * u)));
      pts.push(on(side * f.reach, footropeY(f, side * f.reach)), top(side * (spar.length / 2)));
      this.rigid(pts, FOOTROPE / 2, frame);
      // The stirrups, from the yard down to the footrope.
      for (let u = inner + (f.stirrup ?? STIRRUP_SPACING); u < f.reach; u += f.stirrup ?? STIRRUP_SPACING) this.rigid([top(side * u), on(side * u, footropeY(f, side * u))], FOOTROPE / 2, frame);
    }
  }

  /** A rope that turns rigidly with one frame. */
  private rigid(pts: readonly Vector3[], radius: number, frame: number): void {
    this.t.ropes.line(pts, radius, TARRED, FEW_SIDES, legFollow(frame, pts[0]!, frame, pts[0]!, pts.length));
  }

  /** The jib-boom's horse on a side: hanging between its two ends under the boom, made fast up to it at both. */
  private horse(spar: Spar, ends: readonly RigPoint[]): void {
    const a = shipPoint(ends[0]!), b = shipPoint(ends[1]!);
    const up = (p: Vector3) => p.clone().setY(shipY(nearestOn(spar, p).height));
    this.t.ropes.line([up(a), ...sagging(a, b, HORSE_SAG, Math.ceil(a.distanceTo(b) / FOOTROPE_STEP)), up(b)], FOOTROPE / 2, TARRED, FEW_SIDES);
  }
}

const UP = new Vector3(0, 1, 0), ACROSS = new Vector3(1, 0, 0);
/** Where a belayed line leaves its pin, m above the rail's top (rig.ts draws the pin and its turns there). */
export const LINE_OFF_PIN = 0.08;

/** A key for a place, to the nearest SAME_PLACE. */
const placeKey = (p: Vector3): string => `${Math.round(p.x / SAME_PLACE)},${Math.round(p.y / SAME_PLACE)},${Math.round(p.z / SAME_PLACE)}`;
/** Where a straight line (foot, head) is at a ship-space height. */
const shroudAt = ([a, b]: readonly [Vector3, Vector3], y: number): Vector3 => new Vector3().lerpVectors(a, b, (y - a.y) / (b.y - a.y));
/** The point on a spar's axis nearest a ship-space point (by height along it). */
function nearestOn(spar: Spar, p: Vector3): RigPoint {
  const a = shipPoint(spar.heel), d = shipPoint(spar.head).sub(a), u = Math.max(0, Math.min(1, p.clone().sub(a).dot(d) / d.lengthSq()));
  return between(spar.heel, spar.head, u);
}
