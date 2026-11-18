/**
 * The captain's feet (plan N2.8): a step on her planking each time one of his soles comes down (his body, N2.7,
 * `BodyPose.feet`: a sole moves while it steps and stands still once planted), so the sound falls with the feet that
 * are drawn, the steps he takes to catch a lurch or to turn included, and a short step is quieter than a stride. On a
 * ladder a foot on each tread he climbs, from how far his eye rises (`@futuremagic/audio`'s `Stride`). Without soles
 * (no body) a step each stride the eye walks. Below deck the boards sound a little deeper. A jump of the eye (a
 * standpoint chosen) is no step. Pure.
 */
import { Stride, strideAt } from '@futuremagic/audio';
import { clamp, lerp } from '@futuremagic/core';
import { LADDER } from '../sim/rules/ships';
import { SOLE_STILL, STEP_DECK, STEP_JUMP, STEP_LENGTHS, STEP_LOUDNESS, STEP_PITCH_BELOW, STEP_RUNG } from './shipTuning';

type Vec3 = readonly [number, number, number];

/** A footfall to play now. */
export interface Footfall {
  readonly id: string;
  readonly gain: number;
  readonly pitch: number;
}

/** What his feet did this frame. */
export interface Feet {
  /** The eye, ship space. */
  readonly eye: Vec3;
  /** His soles, ship space (null: no body). */
  readonly soles: readonly Vec3[] | null;
  readonly onLadder: boolean;
  /** 0 on deck, 1 below. */
  readonly below: number;
}

/** A step's loudness by how far the foot went, m: a shuffle to catch a lurch is quieter than a stride. */
export function stepLoudness(length: number): number {
  return lerp(STEP_LOUDNESS[0], STEP_LOUDNESS[1], clamp((length - STEP_LENGTHS[0]) / (STEP_LENGTHS[1] - STEP_LENGTHS[0]), 0, 1));
}

/** One sole followed: where it was, whether it is stepping, how far it has gone in this step. */
interface Sole {
  at: Vec3;
  moving: boolean;
  went: number;
}

export class Footsteps {
  private readonly stride = new Stride();
  private last: Vec3 | null = null;
  private soles: Sole[] = [];

  /** One frame of `dt` s: a footfall to play now, or null. */
  footfall(f: Feet, dt: number): Footfall | null {
    const was = this.last, eye = f.eye;
    this.last = [eye[0], eye[1], eye[2]];
    if (!was || dt <= 0) return null;
    const across = Math.hypot(eye[0] - was[0], eye[2] - was[2]), up = Math.abs(eye[1] - was[1]);
    if (Math.hypot(across, up) > STEP_JUMP) { this.stride.reset(); this.soles = []; return null; }
    const pitch = f.below > 0 ? STEP_PITCH_BELOW : 1;
    if (f.onLadder) {
      this.soles = [];
      return this.stride.step(up / dt, dt, LADDER.rise) ? { id: STEP_RUNG.id, gain: STEP_RUNG.gain * STEP_LOUDNESS[1], pitch } : null;
    }
    const length = f.soles ? this.landed(f.soles, dt) : this.strode(across / dt, dt);
    return length === null ? null : { id: STEP_DECK.id, gain: STEP_DECK.gain * stepLoudness(length), pitch };
  }

  /** The length of a step whose sole came down this frame, or null. */
  private landed(soles: readonly Vec3[], dt: number): number | null {
    if (this.soles.length !== soles.length) {
      this.soles = soles.map((s) => ({ at: [s[0], s[1], s[2]], moving: false, went: 0 }));
      return null;
    }
    let down: number | null = null;
    soles.forEach((s, i) => {
      const o = this.soles[i]!, moved = Math.hypot(s[0] - o.at[0], s[2] - o.at[2]), moving = moved / dt > SOLE_STILL;
      if (moving) o.went += moved;
      else if (o.moving) { down = Math.max(down ?? 0, o.went); o.went = 0; }
      o.moving = moving;
      o.at = [s[0], s[1], s[2]];
    });
    return down;
  }

  /** Without soles: the stride's length when a foot would come down walking at `speed`, or null. */
  private strode(speed: number, dt: number): number | null {
    const stride = strideAt(speed);
    return this.stride.step(speed, dt, stride) ? stride : null;
  }
}
