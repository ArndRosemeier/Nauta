/**
 * Her sails and flags as they stand this frame (plan N3.10): each sail's row of numbers for the sail kind (sailForm.ts
 * ROW, sailMaterial.ts SAIL_TEXTURE) from how the simulation says it stands (sailing.ts `sailsStanding`: set or
 * furled, reefs, brace or sheet, pressure, aback, shivering) and the spars it is bent to as they lie now; the flags
 * from the true wind; and the moving frames that carry each line made fast to a sail to where its corner is drawn.
 *
 * Setting and furling are seen happening, as far as the crew has got (the simulation's share of each sail, sails.ts
 * `sailShare`; the drawing keeps no clock of its own): a square sail being set has its gaskets let go (the roll drops
 * into a hanging bunt), then is sheeted home and its yard hoisted; taken in, it is clewed up into its bunt and rolled
 * up on its yard; a headsail is hauled down its stay, the boom sail brailed in to the mast; a reef is rolled up at the head.
 */
import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import { Rng } from '@futuremagic/core';
import type { SailStanding } from '../../sim/ship/sailing';
import { sailShare, type SailSetting } from '../../sim/ship/sails';
import { HANGING } from '../../sim/rules/rig';
import { sparOf, type RigPlan } from '../../sim/ship/rig';
import { FLAG, FORE_AFT, ROW, ROW_FLOATS, SQUARE, clothAt, sailForms, sailPoints, shiftFrame, type SailForm, type SailPoint } from './sailForm';
import { FLAGS } from './sailGrid';
import { shipPoint, swingsOf } from './swings';

/** The belly's depth when full, as a share of a sail's breadth: square sails, fore-and-aft sails. */
const DEPTH = { square: 0.11, foreAft: 0.08 } as const;
/** Aback, a square sail is pressed flat against its mast and rigging; a backed headsail bellies the other way, this share as deep. */
const ABACK = { square: 0.3, foreAft: 0.7 } as const;
/** The wind's pressure that fills a sail (kN/m²: about 5 m/s of apparent wind); it fills as the square root of the pressure up to it. */
const FULL_PRESSURE = 0.015;
/** A shivering sail keeps this share of its belly; its ripples are this deep (m) and deeper by this much per m/s of wind. */
const SHIVER_KEEPS = 0.3;
const SHIVER_DEPTH = 0.1;
const SHIVER_PER_WIND = 0.012;
/** A full sail breathes this share of its belly. */
const BREATHE = 0.05;
/** Gathered cloth folds this deep at most, m: a square sail's bunt, a fore-and-aft sail's. */
const FOLD_DEPTH = { square: 0.22, foreAft: 0.16 } as const;
/** A furled square sail's roll on its yard (its bunt), m radius. */
const ROLL_RADIUS = 0.32;
/** A clewed-up square sail hangs in its bunt to this share of its drop, its clews hauled in to this share of its breadth from the middle. */
const CLEWED_UP = { drop: 0.2, foot: 0.55 } as const;
/** The boom sail brailed in to this share of its foot; a headsail hauled down to this share of its luff and its clew in to this share of its foot; rolled, a fore-and-aft sail's bunch closes to this share of that. */
const BRAILED = 0.1;
const HAULED_DOWN = { luff: 0.12, foot: 0.2 } as const;
const STOWED = 0.7;
/** A headsail's clew, its sheet slack (hauled down, or not yet sheeted home), hangs this share of its foot lower. */
const SLACK_CLEW = 0.35;
/** How quickly the drawn belly and shiver follow the wind, s (a gust fills a sail, it does not jump). */
const FOLLOW = { belly: 0.5, shiver: 0.6 } as const;
/** The flags: they stream fully out from this wind (m/s), hang limp below this; their waves' depth as a share of the fly, how many along it, and their rate (Hz, and more per m/s). */
const STREAM = { from: 0.5, full: 7 } as const;
const FLAG_WAVE = 0.035;
/** In a calm a flag still droops a little away from its halliard (its stream never below this), never lying flat on it. */
const LIMP_LEAN = 0.25;
const FLAG_WAVES: Readonly<Record<string, number>> = { ensign: 1.6, pennant: 3 };
const FLAG_RATE = { base: 0.8, perWind: 0.12 } as const;
/** Seed of each sail's and flag's phase. */
const PHASE_SEED = 1798;
/** A turn, rad. */
const TURN = 2 * Math.PI;
/** Forward and up, ship space. */
const FORWARD = new Vector3(0, 0, -1);
const UP = new Vector3(0, 1, 0);
const STARBOARD = new Vector3(1, 0, 0);

/** How one sail is drawn this moment: how far it hangs (drop: 0 clewed up, 1 sheeted home), how far rolled up, its reef, belly and shiver as drawn. */
interface Drawn {
  drop: number;
  roll: number;
  taken: number;
  depth: number;
  shiver: number;
}

/** The true wind on her, toward (x, z, unit, world) at `speed` m/s. */
export interface Blowing {
  readonly x: number;
  readonly z: number;
  readonly speed: number;
}

/** How one sail is drawn, as the sound hears it (`SailsView.heard`). */
export interface SailHeard {
  /** How far it hangs, 0 clewed up to 1 sheeted home; how far rolled up on its yard (or stowed), 0..1. */
  readonly drop: number;
  readonly roll: number;
  /** Its reef as drawn, a share of its drop (square sails) or area. */
  readonly reef: number;
  /** Its belly as drawn, a share of a full belly (1): + filled, - aback (a square sail aback is 0.3 deep). */
  readonly fill: number;
  /** Its shiver as a share of a shivering sail's ripples in this wind, 0..1. */
  readonly shiver: number;
}

/** The sails as drawn, counted (`SailsView.summary`). */
export interface SailsSummary {
  readonly sails: number;
  readonly set: number;
  readonly furled: number;
  readonly aback: number;
  readonly shivering: number;
  readonly deepest: number;
}

export class SailsView {
  /** One row per sail, then the flags (sailForm.ts ROW). */
  readonly rows: Float32Array;
  readonly forms: readonly SailForm[];
  readonly points: readonly SailPoint[];
  private readonly drawn: Drawn[];
  private readonly phases: number[];
  private standing: readonly SailStanding[] | null = null;
  private canvas: readonly SailSetting[] | null = null;
  private blowing: Blowing = { x: 1, z: 0, speed: 0 };
  private started = false;
  private readonly gaffEnd: Vector3;
  private readonly truck: Vector3;
  private readonly corner = [new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  private readonly scratch = new Vector3();
  private readonly shift = new Matrix4();

  constructor(rig: RigPlan) {
    this.forms = sailForms(rig);
    this.points = sailPoints(rig, this.forms, swingsOf(rig).length + 1);
    this.rows = new Float32Array((this.forms.length + FLAGS.length) * ROW_FLOATS);
    this.drawn = this.forms.map(() => ({ drop: 0, roll: 1, taken: 0, depth: 0, shiver: 0 }));
    const rng = new Rng(PHASE_SEED);
    this.phases = [...this.forms, ...FLAGS].map(() => rng.float() * TURN);
    this.gaffEnd = shipPoint(sparOf(rig, 'gaff').head);
    this.truck = shipPoint(sparOf(rig, 'main-topgallant-mast').head);
  }

  /** How her sails stand (the simulation's `sailsStanding` and her canvas, in the rig plan's order), or null: all furled. */
  stand(standing: readonly SailStanding[] | null, canvas: readonly SailSetting[] | null): void {
    this.standing = standing;
    this.canvas = canvas;
  }

  /** The true wind where she is, for the flags. */
  blow(wind: Blowing): void {
    this.blowing = wind;
  }

  /**
   * How many sails she has, how many are drawn sheeted home, how many rolled up or hauled down, how many drawn aback
   * and how many shivering, and the deepest belly drawn (m, + filled, - aback): what the browser checks read.
   */
  summary(): SailsSummary {
    let set = 0, furled = 0, aback = 0, shivering = 0, deepest = 0;
    for (const d of this.drawn) {
      if (d.drop >= 1) set++;
      if (d.drop <= 0 && d.roll >= 1) furled++;
      if (d.depth * d.drop < 0) aback++;
      if (d.shiver * d.drop > SHIVER_DEPTH / 2) shivering++;
      if (Math.abs(d.depth * d.drop) > Math.abs(deepest)) deepest = d.depth * d.drop;
    }
    return { sails: this.drawn.length, set, furled, aback, shivering, deepest };
  }

  /**
   * How each sail is drawn, for the sound (N3.9), in the rig plan's order, into `out`: how far it hangs (drop) and is
   * rolled up, its reef as drawn, its belly as drawn as a share of a full one (+ filled, - aback) and its shiver as a
   * share of the ripples of this wind.
   */
  heard(out: SailHeard[] = []): SailHeard[] {
    out.length = this.forms.length;
    const ripples = SHIVER_DEPTH + SHIVER_PER_WIND * this.blowing.speed;
    for (const f of this.forms) {
      const d = this.drawn[f.index]!, full = (f.kind === SQUARE ? DEPTH.square : DEPTH.foreAft) * f.breadth;
      out[f.index] = { drop: d.drop, roll: d.roll, reef: d.taken, fill: (d.depth * d.drop) / full, shiver: Math.min(1, d.shiver / ripples) };
    }
    return out;
  }

  /** The topsail and topgallant yards' hoists as their sails are drawn (1 hoisted; lowered on the cap when furled, a little down when reefed). */
  hoists(): [string, number][] {
    const out: [string, number][] = [];
    for (const f of this.forms) {
      if (!f.hoisted) continue;
      const d = this.drawn[f.index]!;
      out.push([f.hoisted.yard, d.drop * Math.max(0, 1 - (d.taken * f.height) / f.hoisted.range)]);
    }
    return out;
  }

  /** Draws the sails as set as the simulation says, and eases their belly and shiver `dt` s toward the wind on them. */
  follow(dt: number): void {
    const first = !this.started;
    this.started = true;
    for (const f of this.forms) {
      const d = this.drawn[f.index]!, setting = this.canvas?.[f.index], st = this.standing?.[f.index];
      // How far it is set is the simulation's one share (sails.ts `sailShare`, moved by the crew): a square sail is let
      // fall out of its roll up to hanging in its gear, then sheeted home; coming in the other way. A fore-and-aft sail is
      // hoisted or doused along the whole share. A reef is taken while it hangs.
      const share = setting ? sailShare(setting) : 0;
      if (f.kind === SQUARE) {
        d.roll = share < HANGING ? 1 - share / HANGING : 0;
        d.drop = share > HANGING ? (share - HANGING) / (1 - HANGING) : 0;
      } else {
        d.drop = share;
        d.roll = 1 - share;
      }
      if (setting?.set) d.taken = setting.reefs * f.sail.reefShare;
      // The belly as the wind fills it, and the shiver, eased.
      const square = f.kind === SQUARE, full = Math.min(1, Math.sqrt((st?.pressure ?? 0) / FULL_PRESSURE));
      const aback = st?.aback ?? false, shivering = st?.shivering ?? false;
      const sign = aback ? -(square ? ABACK.square : ABACK.foreAft) : 1;
      const depth = sign * (square ? DEPTH.square : DEPTH.foreAft) * f.breadth * full * (shivering ? SHIVER_KEEPS : 1);
      const shiver = shivering ? SHIVER_DEPTH + SHIVER_PER_WIND * this.blowing.speed : 0;
      const k = first ? 1 : 1 - Math.exp(-dt / FOLLOW.belly), ks = first ? 1 : 1 - Math.exp(-dt / FOLLOW.shiver);
      d.depth += (depth - d.depth) * k;
      d.shiver += (shiver - d.shiver) * ks;
    }
  }

  /**
   * Each sail's and flag's row for the sail kind, and each sail point's frame, from the spars as they lie (`swing(id)`:
   * a turning spar's frame now, ship space) and her turn on the water (`turn`: ship space to the world).
   */
  write(swing: (id: string) => Matrix4 | null, turn: Quaternion, time: number, frame: (index: number, m: Matrix4) => void): void {
    for (const f of this.forms) this.writeSail(f, swing);
    this.writeFlags(swing, turn);
    for (const p of this.points) {
      const now = clothAt(this.rows.subarray(p.sail * ROW_FLOATS, (p.sail + 1) * ROW_FLOATS), p.u, p.v, time, this.scratch);
      frame(p.frame, shiftFrame(p.rest, now, this.shift));
    }
  }

  private writeSail(f: SailForm, swing: (id: string) => Matrix4 | null): void {
    const r = this.rows.subarray(f.index * ROW_FLOATS, (f.index + 1) * ROW_FLOATS), d = this.drawn[f.index]!, st = this.standing?.[f.index];
    const c = this.corner;
    for (let i = 0; i < c.length; i++) {
      const m = f.carriers[i] ? swing(f.carriers[i]!) : null;
      c[i]!.copy(f.rest[i]!);
      if (m) c[i]!.applyMatrix4(m);
    }
    const belly = new Vector3(), up = UP.clone();
    const angle = st?.angle ?? 0, side = angle < 0 ? -1 : 1;
    if (f.kind === SQUARE) {
      const m = swing(f.carriers[0]!);
      belly.copy(FORWARD);
      if (m) { belly.transformDirection(m); up.transformDirection(m); }
      // A course reefed: its clews rise by the reef toward its head.
      if (!f.hoisted && d.taken > 0) { c[2]!.lerp(c[0]!, d.taken); c[3]!.lerp(c[1]!, d.taken); }
    } else if (f.sail.kind === 'boom') {
      const m = swing('boom');
      belly.copy(STARBOARD).multiplyScalar(side);
      if (m) belly.transformDirection(m);
    } else {
      // A headsail or staysail: its clew swung to its sheet, about its luff.
      const luff = this.scratch.subVectors(c[2]!, c[0]!).normalize();
      c[1]!.sub(c[0]!).applyAxisAngle(luff, angle).add(c[0]!);
      // Its sheet slack while it is hauled down or not yet sheeted home: the clew hangs lower.
      c[1]!.y -= (1 - d.drop) * SLACK_CLEW * c[1]!.distanceTo(c[0]!);
      belly.crossVectors(luff, new Vector3().subVectors(c[1]!, c[0]!)).normalize();
      if (belly.x * side < 0) belly.negate();
    }
    const square = f.kind === SQUARE;
    const gather = square
      ? { u: CLEWED_UP.foot + (1 - CLEWED_UP.foot) * d.drop, v: CLEWED_UP.drop + (1 - CLEWED_UP.drop) * d.drop }
      : f.sail.kind === 'boom'
        ? { u: BRAILED + (1 - BRAILED) * d.drop, v: 1 }
        : { u: (HAULED_DOWN.foot + (1 - HAULED_DOWN.foot) * d.drop) * (1 - (1 - STOWED) * d.roll), v: (HAULED_DOWN.luff + (1 - HAULED_DOWN.luff) * d.drop) * (1 - (1 - STOWED) * d.roll) };
    const R = ROW;
    for (let i = 0; i < c.length; i++) r.set([c[i]!.x, c[i]!.y, c[i]!.z], i * (R.p10 - R.p00));
    r[R.kind] = square ? SQUARE : FORE_AFT;
    r[R.depth] = d.depth * d.drop;
    r[R.shiver] = d.shiver * d.drop;
    r[R.phase] = this.phases[f.index]!;
    r.set([belly.x, belly.y, belly.z], R.belly);
    r[R.breathe] = Math.abs(d.depth) * BREATHE * d.drop;
    r.set(f.edges.slice(0, R.middle - R.edgeA), R.edgeA);
    r[R.middle] = f.edges[R.middle - R.edgeA]!;
    r[R.uKeep] = gather.u;
    r[R.vKeep] = gather.v;
    r[R.taken] = d.taken;
    r.set([up.x, up.y, up.z], R.rollUp);
    r[R.roll] = square ? d.roll : 0;
    // The luff: a fore-and-aft sail's at u 0; a square sail's weather leech.
    r[R.luff] = square ? (side > 0 ? 0 : 1) : 0;
    r[R.folds] = f.folds;
    r[R.foldDepth] = (square ? FOLD_DEPTH.square * (1 - d.roll) : FOLD_DEPTH.foreAft) * (1 - d.drop);
    r[R.rollRadius] = ROLL_RADIUS;
    r[R.foldU] = f.foldU;
    r[R.foldV] = f.foldV;
    r[R.yardRadius] = f.yardRadius;
    r[R.stream] = 0;
  }

  private writeFlags(swing: (id: string) => Matrix4 | null, turn: Quaternion): void {
    const toShip = turn.clone().invert();
    const down = new Vector3(0, -1, 0).applyQuaternion(toShip);
    const fly = new Vector3(this.blowing.x, 0, this.blowing.z).applyQuaternion(toShip);
    fly.addScaledVector(down, -fly.dot(down)).normalize();
    const speed = this.blowing.speed, k = Math.min(1, Math.max(0, (speed - STREAM.from) / (STREAM.full - STREAM.from)));
    FLAGS.forEach((flag, i) => {
      const index = this.forms.length + i, r = this.rows.subarray(index * ROW_FLOATS, (index + 1) * ROW_FLOATS), R = ROW;
      const top = flag.id === 'ensign' ? this.gaffEnd.clone().applyMatrix4(swing('gaff') ?? new Matrix4()) : this.truck.clone();
      const foot = top.clone().addScaledVector(down, flag.hoist);
      r.fill(0);
      r.set([top.x, top.y, top.z], R.p00);
      r.set([foot.x, foot.y, foot.z], R.p01);
      r[R.kind] = FLAG;
      r[R.fly] = flag.fly;
      r[R.wave] = FLAG_WAVE * flag.fly * (1 + k) / 2;
      r[R.phase] = this.phases[index]!;
      r.set([fly.x, fly.y, fly.z], R.belly);
      r[R.taper] = flag.taper;
      r[R.waves] = FLAG_WAVES[flag.id]!;
      r[R.waveRate] = FLAG_RATE.base + FLAG_RATE.perWind * speed;
      r[R.stream] = LIMP_LEAN + (1 - LIMP_LEAN) * k;
    });
  }
}
