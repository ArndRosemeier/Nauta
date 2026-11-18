/**
 * What is heard of her sails and rigging under way (plan N3.9), decided from the apparent wind, the simulation's
 * standing of each sail (its yard's brace or its sheet) and each sail as it is drawn (render/ship/sailsView.ts
 * `heard`: how far it hangs, rolled up, its belly and shiver), so the ear hears what the eye sees:
 *
 * - the wind in her rigging, by the apparent wind aloft: a hum in a working breeze, a shriek in a gale;
 * - loose canvas flogging (let fall and not yet sheeted home, being clewed up, hanging in its bunt, shivering), one bed
 *   for each mast and one for the bowsprit, placed amid the canvas flogging there;
 * - a sail filling (its belly snapping full) and a sail thundering aback, from the sail;
 * - blocks squealing while a mast's lines run (a sail set, taken in, reefed; its yards braced; a headsail's sheet over);
 * - the creak of a mast's yards (or the boom and gaff) as they are braced round, louder the faster they turn.
 *
 * So a tack is heard with eyes shut: her canvas shivers and flogs as she comes up, the headsails go over and the square
 * sails thunder aback, the yards creak round with the blocks squealing, and the sails fill on the new tack one by one.
 * Everything is outside her, on the world bus, coming through her planking below deck by the room's share.
 * Pure and seeded: the same frames give the same sounds. `SailSound` (sailSound.ts) plays them.
 */
import { clamp, hash3i, hashToFloat, lerp, smoothstep } from '@futuremagic/core';
import type { SailStanding } from '../sim/ship/sailing';
import { toWorld, type ShipPose } from '../sim/ship/motion';
import { rigPlan } from '../sim/ship/rig';
import { sailArea, type Sail } from '../sim/ship/sails';
import { shipY, shipZ } from '../sim/ship/section';
import { pushBeds, takeAngle, TAKES, type BedLevel } from './ambience';
import type { Heard, PlacedBed, PlacedShot } from './heard';
import {
  ABACK, ABACK_AT, ABACK_REARM, BLOCK_PERIOD, BLOCK_RUN, BLOCK_SPREAD, CANVAS_FULL, CANVAS_GAP, CANVAS_QUEUE, CANVAS_SILENT,
  FILL, FILL_AT, FILL_REARM, FLOG_BEDS, FLOG_FULL_AREA, FLOG_GAIN, FLOG_GLIDE, FLOG_REF, RIGGING_BEDS, RIGGING_FULL,
  RIGGING_GLIDE, RIGGING_SILENT, SHIVER_FLOG, TURN_JUMP, TURN_SMOOTH, YARD_CREAK, YARD_FULL, YARD_LEAST, YARD_PERIOD,
  YARD_SPREAD, YARD_TURNING,
} from './sailTuning';
import type { SlapKind } from './tuning';

type Vec3 = readonly [number, number, number];

/** How one sail is drawn, as the sound hears it (render/ship/sailsView.ts `SailHeard`). */
export interface CanvasDrawn {
  /** How far it hangs, 0 clewed up to 1 sheeted home; how far rolled up (or stowed), 0..1; its reef as drawn. */
  readonly drop: number;
  readonly roll: number;
  readonly reef: number;
  /** Its belly as drawn, a share of a full one: + filled, - aback. */
  readonly fill: number;
  /** Its shiver as drawn, 0..1. */
  readonly shiver: number;
}

/** One frame of her sails heard. */
export interface SailScene {
  /** The clock, s, and this frame's step of it. */
  readonly t: number;
  readonly dt: number;
  /** Her pose as drawn, to place the sounds in the world. */
  readonly pose: ShipPose;
  /** The apparent wind aloft, m/s (sailing.ts `apparentSpeed`; the true wind when she has no way). */
  readonly wind: number;
  /** The ear is aboard her (on deck, aloft or below): her rigging is heard all round it. Off her only her canvas, from where it is. */
  readonly aboard: boolean;
  /** How much of what is outside her comes through to the ear (the room's `through`: 1 on deck). */
  readonly through: number;
  /** Each sail's standing in the simulation (its brace or sheet), in the rig plan's order; null: no match sails her. */
  readonly standing: readonly SailStanding[] | null;
  /** Each sail as drawn, in the same order; null with `standing`. */
  readonly drawn: readonly CanvasDrawn[] | null;
}

/** The sails of one mast (or the bowsprit), heard together: one flogging bed, one stream of blocks. */
interface Group {
  readonly name: string;
  readonly sails: readonly number[];
  /** The middle of its canvas, ship space, where its blocks are heard. */
  readonly middle: Vec3;
}

/** Spars braced round together, heard creaking: a mast's yards, or the boom and gaff. */
interface Turner {
  readonly group: number;
  /** The sail whose standing angle these spars follow. */
  readonly sail: number;
  /** Where they creak: the mast at the middle of their sails' height, ship space. */
  readonly at: Vec3;
}

/** A sail's fixed facts for hearing: its group, its middle (ship space), its full area and its share of the largest's. */
interface SailFacts {
  readonly group: number;
  readonly middle: Vec3;
  readonly area: number;
  readonly loud: number;
  /** A headsail or staysail: its sheet goes over when it does. */
  readonly sheeted: boolean;
}

/** The seeded draws, each its own stream. */
const DRAW = { block: 0, yard: 1 } as const;

/** A sail's middle in ship space: the mean of its corners. */
function middleOf(sail: Sail): Vec3 {
  const n = sail.corners.length, sum = sail.corners.reduce((s, c) => [s[0] + c.at.across, s[1] + c.at.height, s[2] + c.at.along], [0, 0, 0]);
  return [sum[0] / n, shipY(sum[1] / n), shipZ(sum[2] / n)];
}

/** The mean of some points. */
function meanOf(points: readonly Vec3[]): Vec3 {
  const s = points.reduce((a, p) => [a[0] + p[0], a[1] + p[1], a[2] + p[2]], [0, 0, 0]);
  return [s[0] / points.length, s[1] / points.length, s[2] / points.length];
}

let facts: { sails: SailFacts[]; groups: Group[]; turners: Turner[] } | null = null;
/** Her sails' groups, middles and areas, and the spars that turn, from the rig plan (built once). */
function sailFacts(): NonNullable<typeof facts> {
  if (facts) return facts;
  const sails = rigPlan().sails, names = sails.reduce<Sail['mast'][]>((n, s) => (n.includes(s.mast) ? n : [...n, s.mast]), []);
  const areas = sails.map((s) => sailArea(s)), largest = Math.max(...areas);
  const middles = sails.map(middleOf);
  const groups = names.map((name) => {
    const own = sails.flatMap((s, i) => (s.mast === name ? [i] : []));
    return { name, sails: own, middle: meanOf(own.map((i) => middles[i]!)) };
  });
  const turners: Turner[] = [];
  for (const g of groups) {
    for (const own of [g.sails.filter((i) => sails[i]!.kind === 'square'), g.sails.filter((i) => sails[i]!.kind === 'boom')]) {
      if (own.length === 0) continue;
      const m = meanOf(own.map((i) => middles[i]!));
      turners.push({ group: groups.indexOf(g), sail: own[0]!, at: [0, m[1], m[2]] });
    }
  }
  facts = {
    sails: sails.map((s, i) => ({
      group: names.indexOf(s.mast), middle: middles[i]!, area: areas[i]!, loud: Math.sqrt(areas[i]! / largest), sheeted: s.kind === 'head' || s.kind === 'stay',
    })),
    groups, turners,
  };
  return facts;
}

/** How loud canvas is at an apparent wind, 0..1: silent in a calm, full from a strong breeze. */
export function canvasPresence(wind: number): number {
  return smoothstep(CANVAS_SILENT, CANVAS_FULL, wind);
}

/** How loud her rigging is at an apparent wind, 0..1 of its beds' gain. */
export function riggingPresence(wind: number): number {
  return smoothstep(RIGGING_SILENT, RIGGING_FULL, wind);
}

/** How much of a sail is flogging as drawn, a share of its area: loose (let fall, not sheeted home; clewed up, not rolled), and a set sail shivering. */
export function looseShare(d: CanvasDrawn): number {
  return (1 - d.roll) * (1 - d.drop) + SHIVER_FLOG * d.shiver * d.drop;
}

/** A yard's creak loudness at its turning rate, rad/s. */
export function yardCreakLoudness(rate: number): number {
  return YARD_CREAK.gain * lerp(YARD_LEAST, 1, clamp((rate - YARD_TURNING) / (YARD_FULL - YARD_TURNING), 0, 1));
}

/** A sail's state between frames: armed to fill or to go aback, as last drawn. */
interface Canvas {
  fillArmed: boolean;
  abackArmed: boolean;
  last: CanvasDrawn | null;
  /** Its sheet's side (a headsail's), -1 larboard, 1 starboard, 0 not yet seen. */
  side: number;
}

export class SailWatch {
  private readonly canvas: Canvas[];
  private readonly blocks: { next: number; n: number }[];
  private readonly turning: { last: number | null; rate: number; next: number; n: number }[];
  private readonly beds: BedLevel[] = [];
  /** No canvas sound before this, s (the last one's start plus CANVAS_GAP). */
  private canvasFree = -Infinity;

  constructor(private readonly seed: number) {
    const f = sailFacts();
    this.canvas = f.sails.map(() => ({ fillArmed: false, abackArmed: false, last: null, side: 0 }));
    this.blocks = f.groups.map(() => ({ next: -Infinity, n: 0 }));
    this.turning = f.turners.map(() => ({ last: null, rate: 0, next: -Infinity, n: 0 }));
  }

  /** One frame: what of her sails and rigging is heard now, into `out` (cleared first). */
  heard(s: SailScene, out: Heard): Heard {
    out.shots.length = 0;
    out.beds.length = 0;
    if (s.aboard) this.rigging(s, out);
    if (!s.standing || !s.drawn) return out;
    const running = this.canvasHeard(s, out);
    this.yards(s, out, running);
    this.lines(s, out, running);
    return out;
  }

  /** The wind in her rigging: its beds by the apparent wind, all round the ear. */
  private rigging(s: SailScene, out: Heard): void {
    pushBeds(this.beds, RIGGING_BEDS, s.wind, riggingPresence(s.wind) * s.through, RIGGING_GLIDE, this.seed, s.t);
    for (const b of this.beds) out.beds.push({ id: b.id, key: b.id, level: b.level, glide: b.glide, bus: 'world' });
    this.beds.length = 0;
  }

  /**
   * Each sail as drawn: flogging gathered by group into its bed, a sail filling or going aback heard from it. Returns,
   * for each group, whether its lines are running (a sail of it hanging, rolling or reefing differently from last frame,
   * or a headsail's sheet gone over).
   */
  private canvasHeard(s: SailScene, out: Heard): boolean[] {
    const f = sailFacts(), presence = canvasPresence(s.wind) * s.through, running = f.groups.map(() => false);
    const loose = f.groups.map(() => ({ area: 0, x: 0, y: 0, z: 0 }));
    s.drawn!.forEach((d, i) => {
      const sail = f.sails[i]!, c = this.canvas[i]!, was = c.last, st = s.standing![i]!;
      c.last = d;
      const share = looseShare(d) * sail.area, g = loose[sail.group]!;
      g.area += share; g.x += share * sail.middle[0]; g.y += share * sail.middle[1]; g.z += share * sail.middle[2];
      const side = st.angle < 0 ? -1 : 1;
      if (sail.sheeted && d.drop > 0 && c.side !== 0 && side !== c.side) running[sail.group] = true;
      c.side = side;
      if (!was) { c.fillArmed = d.fill < FILL_AT; c.abackArmed = d.fill > ABACK_AT; return; }
      if (d.drop !== was.drop || d.roll !== was.roll || d.reef !== was.reef) running[sail.group] = true;
      if (d.fill < FILL_REARM) c.fillArmed = true;
      if (d.fill > ABACK_REARM) c.abackArmed = true;
      if (c.fillArmed && d.fill >= FILL_AT) { c.fillArmed = false; this.canvasShot(s, out, FILL, sail, presence); }
      if (c.abackArmed && d.fill <= ABACK_AT) { c.abackArmed = false; this.canvasShot(s, out, ABACK, sail, presence); }
    });
    f.groups.forEach((group, k) => {
      const g = loose[k]!, level = FLOG_GAIN * presence * Math.sqrt(Math.min(1, g.area / FLOG_FULL_AREA));
      const at = g.area > 0 ? toWorld(s.pose, g.x / g.area, g.y / g.area, g.z / g.area) : toWorld(s.pose, ...group.middle);
      FLOG_BEDS.forEach((id, n) => {
        const angle = takeAngle(this.seed, `${id}@${group.name}`, s.t), take = n === 0 ? Math.cos(angle) : Math.sin(angle);
        out.beds.push({ id, key: `${id}@${group.name}`, level: level * take, at, ref: FLOG_REF, glide: FLOG_GLIDE, bus: 'world' } satisfies PlacedBed);
      });
    });
    return running;
  }

  /** A sail filling or thundering aback, from it, as loud as its size and the wind; one after another, never at once. */
  private canvasShot(s: SailScene, out: Heard, kind: SlapKind, sail: SailFacts, presence: number): void {
    if (presence <= 0) return;
    const delay = Math.max(0, this.canvasFree - s.t);
    if (delay > CANVAS_QUEUE) return;
    this.canvasFree = s.t + delay + CANVAS_GAP;
    out.shots.push(this.shot(s, kind, kind.gain * sail.loud * presence, sail.middle, delay));
  }

  /** Each mast's yards (and the boom) creaking round while they are braced, as fast as they turn; they mark that mast's lines running. */
  private yards(s: SailScene, out: Heard, running: boolean[]): void {
    const f = sailFacts();
    f.turners.forEach((tr, k) => {
      const w = this.turning[k]!, angle = s.standing![tr.sail]!.angle, was = w.last;
      w.last = angle;
      if (was === null || s.dt <= 0) return;
      const moved = Math.abs(angle - was);
      if (moved > TURN_JUMP) { w.rate = 0; return; }
      w.rate += (moved / s.dt - w.rate) * (1 - Math.exp(-s.dt / TURN_SMOOTH));
      if (w.rate <= YARD_TURNING) return;
      running[tr.group] = true;
      if (s.t < w.next) return;
      out.shots.push(this.shot(s, YARD_CREAK, yardCreakLoudness(w.rate) * s.through, tr.at, 0));
      w.n++;
      w.next = s.t + YARD_PERIOD * (1 + YARD_SPREAD * (2 * hashToFloat(hash3i(this.seed, k, w.n, DRAW.yard)) - 1));
    });
  }

  /** A block squealing now and then aloft at each mast whose lines run. */
  private lines(s: SailScene, out: Heard, running: readonly boolean[]): void {
    sailFacts().groups.forEach((g, k) => {
      const b = this.blocks[k]!;
      if (!running[k] || s.t < b.next) return;
      out.shots.push(this.shot(s, BLOCK_RUN, BLOCK_RUN.gain * s.through, g.middle, 0));
      b.n++;
      b.next = s.t + BLOCK_PERIOD * (1 + BLOCK_SPREAD * (2 * hashToFloat(hash3i(this.seed, k, b.n, DRAW.block)) - 1));
    });
  }

  /** A sound at a place of her (ship space), in the world by her pose, outside her (the world bus). */
  private shot(s: SailScene, kind: SlapKind, gain: number, at: Vec3, delay: number): PlacedShot {
    return { id: kind.id, at: toWorld(s.pose, ...at), ref: kind.ref, gain, bus: 'world', delay };
  }
}

/** Every sound id the sails may ask for (for loading ahead and the tests). */
export function sailSoundIds(): string[] {
  return [...RIGGING_BEDS.flatMap((a) => TAKES.map((k) => `${a.id}-${k}`)), ...FLOG_BEDS, FILL.id, ABACK.id, BLOCK_RUN.id, YARD_CREAK.id];
}
