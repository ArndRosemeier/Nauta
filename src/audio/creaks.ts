/**
 * Her timber creaking as she works (plan N2.8): every change of her roll and pitch rate strains her, and each time
 * the strain gathered passes a seeded share a creak starts somewhere in her near the listener, in her side or her deck,
 * louder the harder she works then. So the creaks come where her roll turns, in its rhythm, rare in a calm swell and
 * one on another in a gale. Below deck more of them are the hull's long groans. Pure and seeded.
 */
import { clamp, deriveSeed, lerp } from '@futuremagic/core';
import { LOAD_WATERLINE } from '../sim/rules/ships';
import { toWorld, type ShipPose } from '../sim/ship/motion';
import { insideBreadth } from '../sim/ship/plan';
import { seededDraw, type SlapEvent } from './slaps';
import {
  CREAK_ALONG, CREAK_GAP, CREAK_INBOARD, CREAK_LOUDNESS, CREAK_RISE, CREAK_SPREAD, CREAK_WORK, GROAN, GROAN_SHARE,
  GROAN_THROUGH_DECK, PITCH_WORK, TIMBER, WORK_FULL, WORK_SMOOTH,
} from './shipTuning';

/** The watch's seeded draws, each its own stream. */
const DRAW = { need: 0, kind: 1, along: 2, side: 3, rise: 4 } as const;

/** How hard she works in one frame: the change of her roll rate and of her pitch rate (counted PITCH_WORK times), rad/s. */
export function workOf(roll: number, pitch: number, lastRoll: number, lastPitch: number): number {
  return Math.abs(roll - lastRoll) + PITCH_WORK * Math.abs(pitch - lastPitch);
}

/** A creak's loudness when she works this hard, rad/s². */
export function creakLoudness(hard: number): number {
  return lerp(CREAK_LOUDNESS[0], CREAK_LOUDNESS[1], clamp(hard / WORK_FULL, 0, 1));
}

export class CreakWatch {
  private readonly seed: number;
  private last: { roll: number; pitch: number } | null = null;
  private strain = 0;
  /** How hard she works, its mean over WORK_SMOOTH, rad/s². */
  private hard = 0;
  private need = 0;
  private count = 0;
  private clock = 0;
  private lastCreak = -Infinity;

  constructor(seed: number) {
    this.seed = deriveSeed(seed, 'creaks');
    this.need = this.nextNeed();
  }

  /**
   * One frame of `dt` s with her at `pose` and the ear at `eye` (ship space), `below` 1 below deck: the creaks to start
   * now, in `out` (cleared first), placed in the world.
   */
  creaks(pose: ShipPose, dt: number, eye: readonly [number, number, number], below: number, out: SlapEvent[] = []): SlapEvent[] {
    out.length = 0;
    const was = this.last;
    this.last = { roll: pose.rollRate, pitch: pose.pitchRate };
    if (!was || dt <= 0) return out;
    this.clock += dt;
    const work = workOf(pose.rollRate, pose.pitchRate, was.roll, was.pitch);
    this.strain += work;
    this.hard += (work / dt - this.hard) * (1 - Math.exp(-dt / WORK_SMOOTH));
    if (this.strain < this.need || this.clock - this.lastCreak < CREAK_GAP) return out;
    // What is gathered past the need carries over, but never more than one creak's worth (no burst after a gap).
    this.strain = Math.min(this.strain - this.need, this.need);
    this.lastCreak = this.clock;
    const n = this.count++;
    const groan = seededDraw(this.seed, n, DRAW.kind) < (below > 0 ? GROAN_SHARE.below : GROAN_SHARE.above);
    const kind = groan ? GROAN : TIMBER;
    const gain = creakLoudness(this.hard) * (groan && below <= 0 ? GROAN_THROUGH_DECK : 1);
    out.push({ kind, at: this.source(pose, eye, n), gain });
    this.need = this.nextNeed();
    return out;
  }

  /** Where creak `n` comes from: her side to port or starboard, or her deck, near the ear; in the world. */
  private source(pose: ShipPose, eye: readonly [number, number, number], n: number): [number, number, number] {
    const z = eye[2] + CREAK_ALONG * (2 * seededDraw(this.seed, n, DRAW.along) - 1);
    const y = eye[1] + lerp(CREAK_RISE[0], CREAK_RISE[1], seededDraw(this.seed, n, DRAW.rise));
    const side = Math.max(insideBreadth(-z, y + LOAD_WATERLINE) - CREAK_INBOARD, 0);
    const x = seededDraw(this.seed, n, DRAW.side) < 1 / 2 ? -side : side;
    return toWorld(pose, x, y, z);
  }

  private nextNeed(): number {
    return CREAK_WORK * lerp(CREAK_SPREAD[0], CREAK_SPREAD[1], seededDraw(this.seed, this.count, DRAW.need));
  }
}
