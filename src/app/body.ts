/**
 * The captain's body on her moving deck (implementation plan N2.7): the view is a body, not a camera. Pure: it reads
 * her pose and the walker (sim/ship/deckWalk.ts) and gives the eye, the way the head is held, where the feet stand
 * and where a hand holds, for the view and for drawing his own body.
 *
 * - **He leans against her roll.** His body leans toward the felt vertical (gravity less her deck's push under his
 *   feet) most of the way, as a spring that is a little under-damped: when she rolls he is carried with her first,
 *   then catches himself, a little past upright, and settles. Starting and stopping a walk lean him into it.
 * - **His feet step to keep him up.** Each foot is planted on her deck until it is too far from where it should be,
 *   then steps there: walking that is his stride, standing it is a step to catch a lurch or to turn round. In a seaway
 *   his stance widens.
 * - **His walk bobs.** His hips sink as far as his legs must reach to his feet, so the eye dips with every stride
 *   and with a wide stance.
 * - **He holds on in a heavy sea.** When the felt tilt's swing passes `HOLD_ON` and a rail or a beam is within reach
 *   (sim/ship/handholds.ts) a hand takes it, and he goes more with her, steadier.
 * - **A blow staggers him** (`jolt`): his lean is thrown, his feet step to catch it.
 * - **He stoops forward** under low beams (the walker lowers him; his eye comes forward as he bends).
 * - **The calm view** (`strength`, one setting) takes from all of it down to nearly still: the head held level and the
 *   eye kept over his feet.
 *
 * Ship space (sim/ship/section.ts): x across (+ starboard), y up from her load waterline, z aft. Tilts are tangents:
 * a body axis (tx, 1, tz) normalised.
 */
import { directionToLocal, upInFrame, type Vec3 } from '@futuremagic/deck';
import { pointVelocity, shipFrame, type ShipPose } from '../sim/ship/motion';
import type { DeckWalker } from '../sim/ship/deckWalk';
import type { Handhold } from '../sim/ship/handholds';
import { BODY } from '../sim/rules/ships';
import { EYE_BELOW_TOP } from '../sim/rules/walking';
import { GRAVITY } from '../sim/units';
import {
  CADENCE, CADENCE_PER_PACE, CATCH_KEEP, HIP_RATE, HIP_SHARE, HOLD_LEAN_DAMPING, HOLD_LEAN_RATE, HOLD_LEAN_SHARE, HOLD_OFF,
  HOLD_ON, HOLD_PACE, JOLT_PUSH, LADDER_BLEND_RATE, LEAN_DAMPING, LEAN_RATE, LEAN_SHARE, LEG_SLACK, MOST_DIP, MOST_LEAN, MOTION_START,
  STANCE_HALF, STANCE_WIDEN, STEP_LIFT, STEP_QUICKEST, STEP_SECONDS, STEP_TRIGGER, STOOP_FORWARD, SWING_SECONDS, SWING_SHARE,
  TURN_RATE, WALK_LEAN, WEIGHT_HEIGHT,
} from '../sim/rules/body';

/** What the body needs of her around him: whether his middle may be at (x, z) (ship space), and the hold within reach where he stands. */
export interface BodyWorld {
  stands(x: number, z: number): boolean;
  handhold(): Handhold | null;
}

/** What he is doing this frame. */
export interface BodyInput {
  readonly pose: ShipPose;
  readonly walker: DeckWalker;
  /** His eye as the walker or the climb puts it (ship space), before the body moves it. */
  readonly eye: readonly [number, number, number];
  readonly onLadder: boolean;
  /** The look's yaw on her (his body turns to it). */
  readonly yaw: number;
}

export type FootSide = 'L' | 'R';

/** His body this frame, ship space. */
export interface BodyPose {
  /** The eye. */
  readonly eye: [number, number, number];
  /** The way the head is held: its up, a unit vector (gravity's up when it is held level). */
  readonly up: [number, number, number];
  /** His hips (the middle of the pelvis) and the way his body faces (a yaw on her). */
  readonly hips: [number, number, number];
  readonly yaw: number;
  /** His soles: the left and the right, each lifted while it steps. */
  readonly feet: Record<FootSide, [number, number, number]>;
  /** The hand holding on and where, or null. */
  readonly hold: { readonly side: FootSide; readonly at: Handhold } | null;
  /** How far he stoops under the beams, m. */
  readonly stoop: number;
}

interface Foot {
  x: number;
  z: number;
  /** Stepping: from where, to where, how far through (0..1), and how long the step takes (s). */
  stepping: boolean;
  fx: number;
  fz: number;
  tx: number;
  tz: number;
  t: number;
  seconds: number;
}

/** The eye's lean is tried at these shares of itself until his middle may stand under it (none: it stays over his feet). */
const EYE_TRIES = 8;
/** How quickly the share of his lean the eye may take comes back once there is room again, 1/s. */
const EYE_ROOM_RATE = 12;
/** How quickly a hand takes hold and lets go (1/s), and below what share of its hold it has let go. */
const HOLD_RATE = 3;
const LET_GO = 1e-3;
/** A smooth start and end over 0..1 (3t² − 2t³): a foot's step speeds up and slows down. */
const SMOOTH_A = 3;
const smoothstep = (t: number) => t * t * (SMOOTH_A - 2 * t);
/** A pace below this is standing (m/s). */
const STANDING = 0.05;
/** Smoothing of the deck's push before he feels it, 1/s: her pose is drawn between steps, so its rates come in small corners. */
const PUSH_RATE = 10;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class CaptainBody {
  /** How much of his body's motion the view takes: 1 all of it, down to `CALM_LEAST` (the calm view). */
  strength = MOTION_START;
  private started = false;
  private tilt: [number, number] = [0, 0];
  private rate: [number, number] = [0, 0];
  private readonly feet: Record<FootSide, Foot> = { L: footAt(0, 0), R: footAt(0, 0) };
  private hipY = HIP_SHARE * BODY.height;
  private yaw = 0;
  /** The felt tilt's mean square over the last few seconds (rad²). */
  private swing2 = 0;
  private holdW = 0;
  private held: { side: FootSide; at: Handhold } | null = null;
  private ladderW = 0;
  private eyeRoom = 1;
  private readonly lastV: [number, number] = [0, 0];
  private readonly lastDeck: [number, number, number] = [0, 0, 0];
  private readonly push: [number, number, number] = [0, 0, 0];
  private readonly scratch: [number, number, number] = [0, 0, 0];
  private readonly local: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly upv: Vec3 = { x: 0, y: 1, z: 0 };

  constructor(private readonly world: BodyWorld) {}

  /** A blow from a direction in ship space (x, z, any length), of a strength (1: a shot striking close by): it throws his lean. */
  jolt(x: number, z: number, strength: number): void {
    const n = Math.hypot(x, z) || 1, k = (JOLT_PUSH * strength) / n;
    this.rate[0] += x * k; this.rate[1] += z * k;
  }

  /** One frame of his body. */
  follow(input: BodyInput, dt: number): BodyPose {
    const w = input.walker, frame = shipFrame(input.pose);
    const up = upInFrame(frame, this.upv);
    // Her deck's push under his feet (m/s², ship space): the change of their speed in the world.
    const v = pointVelocity(input.pose, w.x, w.floor, w.z, this.scratch);
    if (!this.started) { this.lastDeck[0] = v[0]; this.lastDeck[1] = v[1]; this.lastDeck[2] = v[2]; this.lastV[0] = w.vx; this.lastV[1] = w.vz; this.yaw = input.yaw; }
    if (dt > 0) {
      const a = directionToLocal(frame, (v[0] - this.lastDeck[0]) / dt, (v[1] - this.lastDeck[1]) / dt, (v[2] - this.lastDeck[2]) / dt, this.local);
      const k = ease(PUSH_RATE, dt);
      // His own push walking, a share of it.
      const ax = a.x + (WALK_LEAN * (w.vx - this.lastV[0])) / dt, az = a.z + (WALK_LEAN * (w.vz - this.lastV[1])) / dt;
      this.push[0] += (ax - this.push[0]) * k; this.push[1] += (a.y - this.push[1]) * k; this.push[2] += (az - this.push[2]) * k;
    }
    this.lastDeck[0] = v[0]; this.lastDeck[1] = v[1]; this.lastDeck[2] = v[2]; this.lastV[0] = w.vx; this.lastV[1] = w.vz;

    // The felt vertical in her frame, as a tilt off her deck's square.
    const gx = GRAVITY * up.x - this.push[0], gy = Math.max(GRAVITY * up.y - this.push[1], GRAVITY / 2), gz = GRAVITY * up.z - this.push[2];
    const felt: [number, number] = clampTilt(gx / gy, gz / gy);
    const pace = Math.hypot(w.vx, w.vz);
    this.ladderW += ((input.onLadder ? 1 : 0) - this.ladderW) * ease(LADDER_BLEND_RATE, dt);
    this.holdOn(felt, pace, dt, input.onLadder);

    // His lean follows the felt vertical, a share of the way, as a spring.
    const hold = Math.max(this.holdW, this.ladderW);
    const share = LEAN_SHARE + (HOLD_LEAN_SHARE - LEAN_SHARE) * hold;
    const omega = LEAN_RATE + (HOLD_LEAN_RATE - LEAN_RATE) * hold, zeta = LEAN_DAMPING + (HOLD_LEAN_DAMPING - LEAN_DAMPING) * hold;
    const want: [number, number] = [felt[0] * share, felt[1] * share];
    if (!this.started) { this.tilt = [...want]; this.rate = [0, 0]; }
    for (let i = 0; i < 2; i++) {
      this.rate[i]! += (omega * omega * (want[i]! - this.tilt[i]!) - 2 * zeta * omega * this.rate[i]!) * dt;
      this.tilt[i]! += this.rate[i]! * dt;
    }
    this.tilt = clampTilt(this.tilt[0], this.tilt[1]);

    // His body turns to his look; his feet step round with it.
    this.yaw += wrap(input.yaw - this.yaw) * ease(TURN_RATE, dt);
    this.stepFeet(w, want, pace, dt);

    // His hips: over his feet and his lean, as high as his legs reach to his planted feet.
    const rest = HIP_SHARE * BODY.height, leg = rest + LEG_SLACK;
    const hx = w.x + this.tilt[0] * rest, hz = w.z + this.tilt[1] * rest;
    let reach = rest;
    for (const s of ['L', 'R'] as const) {
      const f = this.feet[s];
      if (f.stepping) continue;
      const d = Math.min(leg, Math.hypot(f.x - hx, f.z - hz));
      reach = Math.min(reach, Math.sqrt(leg * leg - d * d));
    }
    reach = Math.max(reach, rest - MOST_DIP);
    this.hipY = this.started ? this.hipY + (reach - this.hipY) * ease(HIP_RATE, dt) : reach;
    this.started = true;

    // The eye: where the walker or the climb puts it, moved by his lean, his stride's dip and his stoop, as far as the
    // calm view lets it and his middle may stand under it.
    const body = this.strength * (1 - this.ladderW), lean = Math.hypot(this.tilt[0], this.tilt[1]);
    const overHips = BODY.height - EYE_BELOW_TOP - rest, stoop = Math.max(0, BODY.height - w.height);
    const dip = Math.max(0, rest - this.hipY) + overHips * (1 - 1 / Math.sqrt(1 + lean * lean));
    const eyeTop = BODY.height - EYE_BELOW_TOP;
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const ox = (this.tilt[0] * eyeTop + fx * stoop * STOOP_FORWARD) * body, oz = (this.tilt[1] * eyeTop + fz * stoop * STOOP_FORWARD) * body;
    const room = this.roomFor(w, ox, oz, dt);
    const eye: [number, number, number] = [input.eye[0] + ox * room, input.eye[1] - dip * body, input.eye[2] + oz * room];

    // The head: held as his body leans, the calm view holding it level (gravity's up).
    const n = Math.hypot(this.tilt[0], 1, this.tilt[1]);
    const head: [number, number, number] = [this.tilt[0] / n, 1 / n, this.tilt[1] / n];
    const s = this.strength;
    const hu: [number, number, number] = [up.x + (head[0] - up.x) * s, up.y + (head[1] - up.y) * s, up.z + (head[2] - up.z) * s];
    const hn = Math.hypot(hu[0], hu[1], hu[2]);

    return {
      eye, up: [hu[0] / hn, hu[1] / hn, hu[2] / hn],
      hips: [hx, w.floor + this.hipY, hz], yaw: this.yaw,
      feet: { L: this.sole('L', w.floor), R: this.sole('R', w.floor) },
      hold: this.holdW > 0 && this.held ? this.held : null,
      stoop,
    };
  }

  /** Where a sole is now: planted, or partway through its step and lifted. */
  private sole(side: FootSide, floor: number): [number, number, number] {
    const f = this.feet[side];
    if (!f.stepping) return [f.x, floor, f.z];
    return [f.x, floor + STEP_LIFT * Math.sin(Math.PI * f.t), f.z];
  }

  /** Takes hold of a rail or a beam in a heavy sea, lets go when it eases, he walks on or nothing is in reach. */
  private holdOn(felt: [number, number], pace: number, dt: number, onLadder: boolean): void {
    this.swing2 += (felt[0] * felt[0] + felt[1] * felt[1] - this.swing2) * ease(1 / SWING_SECONDS, dt);
    const swing = Math.sqrt(this.swing2);
    const wants = !onLadder && pace <= HOLD_PACE && swing >= (this.held ? HOLD_OFF : HOLD_ON);
    const at = wants ? this.world.handhold() : null;
    if (at) {
      // The hand on the side of him the hold is on.
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw), side: FootSide = (at.point[0] - this.feetMiddle(0)) * rx + (at.point[2] - this.feetMiddle(1)) * rz >= 0 ? 'R' : 'L';
      this.held = { side: this.held && this.holdW > 0 ? this.held.side : side, at };
    }
    this.holdW += ((at ? 1 : 0) - this.holdW) * ease(HOLD_RATE, dt);
    if (!at && this.holdW < LET_GO) this.held = null;
  }

  private feetMiddle(i: 0 | 1): number {
    return i === 0 ? (this.feet.L.x + this.feet.R.x) / 2 : (this.feet.L.z + this.feet.R.z) / 2;
  }

  /**
   * His feet: each where it should be, set out from his middle by his stance (wider in a seaway) and shifted toward
   * a fall (his weight off its balance), and stepping there when it is too far off, one foot at a time.
   */
  private stepFeet(w: DeckWalker, want: [number, number], pace: number, dt: number): void {
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const half = STANCE_HALF * (1 + STANCE_WIDEN * Math.sqrt(this.swing2));
    // His weight off its balance: how far his lean is from where he wants it, at his weight's height.
    const fallX = WEIGHT_HEIGHT * (this.tilt[0] - want[0]), fallZ = WEIGHT_HEIGHT * (this.tilt[1] - want[1]);
    const ideal = (s: FootSide): [number, number] => {
      const side = s === 'R' ? 1 : -1;
      return [w.x + side * rx * half + fallX, w.z + side * rz * half + fallZ];
    };
    if (!this.started) {
      for (const s of ['L', 'R'] as const) { const [x, z] = ideal(s); this.feet[s] = footAt(x, z); }
      return;
    }
    // Walking: his stride's cadence and reach (a foot lands as far ahead of where it should be as it is left behind).
    const walking = pace > STANDING;
    const cycle = 2 / (CADENCE + CADENCE_PER_PACE * pace), swingTime = walking ? SWING_SHARE * cycle : STEP_SECONDS;
    const reach = Math.max(STEP_TRIGGER, (pace * cycle * (1 - SWING_SHARE)) / 2);
    let stepping = false;
    for (const s of ['L', 'R'] as const) {
      const f = this.feet[s];
      if (!f.stepping) continue;
      stepping = true;
      f.t = Math.min(1, f.t + dt / f.seconds);
      const k = smoothstep(f.t);
      f.x = f.fx + (f.tx - f.fx) * k; f.z = f.fz + (f.tz - f.fz) * k;
      if (f.t >= 1) {
        f.stepping = false;
        // Landing catches some of his swing toward a fall.
        this.rate[0] *= CATCH_KEEP; this.rate[1] *= CATCH_KEEP;
      }
    }
    if (stepping) return;
    // The foot furthest from where it should be steps, if it is far enough.
    let worst: FootSide | null = null, far = reach;
    for (const s of ['L', 'R'] as const) {
      const [x, z] = ideal(s), d = Math.hypot(x - this.feet[s].x, z - this.feet[s].z);
      if (d > far) { far = d; worst = s; }
    }
    if (!worst) return;
    const f = this.feet[worst], [ix, iz] = ideal(worst);
    const ux = pace > 0 ? w.vx / pace : 0, uz = pace > 0 ? w.vz / pace : 0;
    // Where it lands: where it should be when it lands, and as far on again as it may lag before the next step.
    f.fx = f.x; f.fz = f.z;
    f.tx = ix + w.vx * swingTime + ux * reach * (walking ? 1 : 0);
    f.tz = iz + w.vz * swingTime + uz * reach * (walking ? 1 : 0);
    f.t = 0; f.stepping = true;
    // A lurch is caught with a quicker step.
    f.seconds = walking ? swingTime : Math.max(STEP_QUICKEST, STEP_SECONDS * Math.min(1, (2 * STEP_TRIGGER) / far));
  }

  /** The share of the eye's move (ox, oz) off his middle that keeps his middle where it may stand: at once less, slowly more. */
  private roomFor(w: DeckWalker, ox: number, oz: number, dt: number): number {
    let room = 0;
    for (let i = EYE_TRIES; i > 0; i--) {
      const k = i / EYE_TRIES;
      if (this.world.stands(w.x + ox * k, w.z + oz * k)) { room = k; break; }
    }
    this.eyeRoom = room < this.eyeRoom ? room : this.eyeRoom + (room - this.eyeRoom) * ease(EYE_ROOM_RATE, dt);
    return this.eyeRoom;
  }
}

function footAt(x: number, z: number): Foot {
  return { x, z, stepping: false, fx: x, fz: z, tx: x, tz: z, t: 0, seconds: STEP_SECONDS };
}

/** A tilt kept within the most he leans. */
function clampTilt(x: number, z: number): [number, number] {
  const n = Math.hypot(x, z);
  return n > MOST_LEAN ? [(x * MOST_LEAN) / n, (z * MOST_LEAN) / n] : [x, z];
}
