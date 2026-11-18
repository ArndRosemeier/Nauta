/**
 * What is heard of gunfire (plan N5.6), decided from the step's `GunFired` events alone: each gun's report where its
 * muzzle was, arriving after the flash by the speed of sound (an enemy broadside 300 m off is heard nearly a second
 * after it is seen); close by the crack and boom, far off the rolling boom, her own guns below deck through her timbers;
 * a ball passing near the ear as it passes; balls skipping and plunging into the sea near the ear. A broadside fired
 * round the ear deafens for a moment: the world dull, the ears ringing. Her own guns jolt the deck under the captain.
 *
 * A shot's whole flight is in its event (N5.2), so every machine hears the same; nothing is kept but what is still to
 * be heard. The sounds are worked out when the event is first heard, from where the ear is then (a ship moves a few
 * metres in the second a report takes to come). Pure: `GunSound` (gunSound.ts) plays it.
 *
 * World axes are the sea's (units.ts), the engine's listener's too; ship space is section.ts's.
 */
import { clamp, smoothstep } from '@futuremagic/core';
import { battery } from '../sim/guns/guns';
import { logLerp, type Room } from './acoustics';
import { muzzleAt, type GunFired, type Shot, type Vec } from '../sim/guns/shot';
import { PATH_STEP, SPEED_OF_SOUND } from '../sim/rules/guns';
import type { SimEvent } from '../sim/step';
import { STEP_SECONDS } from '../sim/units';
import {
  DEAF, DULL, GUN_FAR, GUN_NEAR, GUN_PITCH, GUN_THROUGH, JOLT, LATE, LOOK_AHEAD, NEAR_TO_FAR, PASS_CLEAR, PASS_LEAD, PASS_PITCH,
  OPEN_HZ, PASS_REACH, PASS_SLOWEST, RING, RING_EVERY, RING_FROM, SHOT_PASS, SHOT_SPLASH, SKIP_GAIN, SKIP_PITCH, SPLASH_REACH, SPLASHES_A_SHOT,
} from './gunTuning';
import { clearHeard, type Heard, type PlacedShot } from './heard';
import type { SlapKind } from './tuning';

type Vec3 = readonly [number, number, number];

/** A sound to start, with its playback rate (a gun's kind, a skip). */
export interface GunShot extends PlacedShot {
  readonly pitch: number;
}

/** A blow to the captain's body (body.ts `jolt`): from a direction in ship space (x, z), of a strength. */
export interface Jolt {
  readonly x: number;
  readonly z: number;
  readonly strength: number;
}

/** One frame of gunfire heard. */
export interface GunScene {
  /** The match's clock as drawn, s (the page's `match.frame().time`). */
  readonly t: number;
  /** The ear in the world, and in ship space of the ship it is aboard. */
  readonly ear: Vec3;
  readonly earShip: Vec3;
  /** The ship the ear is aboard (its index in the match), or -1 off every ship. */
  readonly aboard: number;
  /** 1 when the ear is below her deck (acoustics.ts `Room.below`). */
  readonly below: number;
}

/** What a frame gives: the sounds to start, the jolts to the body, how deafened the ears are (0..1) and the ringing to start in the head (its gain, 0: none). */
export interface GunHeard extends Heard {
  readonly shots: GunShot[];
  readonly jolts: Jolt[];
  deaf: number;
  ring: number;
}

/** A sound still to be heard, at a time of the match's clock, s. */
interface Due {
  readonly at: number;
  readonly sound: GunShot;
}

/** A report still to arrive: its load on the ears and its jolt, at a time of the match's clock, s. */
interface Blow {
  readonly at: number;
  readonly dose: number;
  readonly jolt: Jolt | null;
}

/** A room as a deafened ear hears it (`deaf` 0..1): the world through a lower low-pass and quieter. Pure. */
export function deafened(room: Room, deaf: number): Room {
  if (deaf <= 0) return room;
  const dull = logLerp(OPEN_HZ, DULL.hz, deaf);
  return { ...room, muffle: Math.min(room.muffle ?? OPEN_HZ, dull), through: room.through * (1 - (1 - DULL.through) * deaf) };
}

const earDistance = (a: Vec, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** How far between the near report (0) and the far one (1) a gun at `d` m is heard, eased in log distance. */
export function farShare(d: number): number {
  const [near, far] = NEAR_TO_FAR;
  return smoothstep(0, 1, clamp(Math.log(d / near) / Math.log(far / near), 0, 1));
}

/**
 * Where a ball of a shot passes nearest an ear standing at `ear`: the seconds after firing, the place, the distance and
 * the ball's speed there (m/s); null if it never comes within `reach` m (its first `clear` m from the muzzle left out).
 */
export function nearestPass(path: readonly Vec[], ear: Vec3, reach = PASS_REACH, clear = PASS_CLEAR): { t: number; at: Vec3; d: number; speed: number } | null {
  let best: { t: number; at: Vec3; d: number; speed: number } | null = null;
  const muzzle = path[0];
  if (!muzzle) return null;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!, b = path[i + 1]!;
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], len2 = dx * dx + dy * dy + dz * dz;
    const u = len2 > 0 ? clamp(((ear[0] - a[0]) * dx + (ear[1] - a[1]) * dy + (ear[2] - a[2]) * dz) / len2, 0, 1) : 0;
    const at: Vec3 = [a[0] + dx * u, a[1] + dy * u, a[2] + dz * u];
    const d = earDistance(at, ear);
    if (d > reach || (best && d >= best.d) || earDistance(at, muzzle) < clear) continue;
    best = { t: (i + u) * PATH_STEP, at, d, speed: Math.sqrt(len2) / PATH_STEP };
  }
  return best;
}

export class GunWatch {
  private readonly fresh: GunFired[] = [];
  private readonly due: Due[] = [];
  private readonly blows: Blow[] = [];
  private load = 0;
  private lastT: number | null = null;
  private rungAt = -Infinity;

  /** A step's events: the guns fired in it are kept to be heard. */
  keepFired(events: readonly SimEvent[]): void {
    for (const e of events) if (e.kind === 'fired') this.fresh.push(e);
  }

  /** One frame: the sounds to start now (with their delays), the jolts, and how deafened the ears are. */
  heardAt(s: GunScene, out: GunHeard): GunHeard {
    clearHeard(out);
    out.jolts.length = 0;
    for (const e of this.fresh) this.heard(e, s);
    this.fresh.length = 0;
    // The ears recover with the time since the last frame, then take the reports arrived since.
    const dt = this.lastT === null ? 0 : Math.max(0, s.t - this.lastT);
    this.lastT = s.t;
    this.load *= Math.exp(-dt / DEAF.decay);
    for (let i = this.blows.length - 1; i >= 0; i--) {
      const b = this.blows[i]!;
      if (b.at > s.t) continue;
      this.blows.splice(i, 1);
      if (b.at < s.t - LATE) continue;
      this.load += b.dose;
      if (b.jolt) out.jolts.push(b.jolt);
    }
    out.deaf = Math.min(this.load, 1);
    out.ring = 0;
    if (this.load >= RING_FROM && s.t - this.rungAt >= RING_EVERY) {
      this.rungAt = s.t;
      out.ring = RING.gain * out.deaf;
    }
    for (let i = this.due.length - 1; i >= 0; i--) {
      const d = this.due[i]!;
      if (d.at > s.t + LOOK_AHEAD) continue;
      this.due.splice(i, 1);
      if (d.at < s.t - LATE) continue;
      out.shots.push({ ...d.sound, delay: Math.max(0, d.at - s.t) });
    }
    return out;
  }

  /** Sounds and blows still to come (for the tests and the HUD). */
  get waiting(): number {
    return this.due.length + this.blows.length;
  }

  /** A gun fired: its report, its shot's passing and splashes, its load on the ears and its jolt, each when it arrives. */
  private heard(e: GunFired, s: GunScene): void {
    const fired = e.tick * STEP_SECONDS, ball = e.fired.balls[0], place = battery()[e.gun];
    if (!ball || !place) return;
    const muzzle = ball.path[0]!, d = earDistance(muzzle, s.ear), at = fired + d / SPEED_OF_SOUND;
    const pitch = GUN_PITCH[place.gun], hers = e.ship === s.aboard;
    if (hers && s.below > 1 / 2) this.sound(at, GUN_THROUGH, muzzle, 'body', pitch);
    else {
      // Her own guns are her own sound (never muffled below); the enemy's are the world's.
      const far = farShare(d), bus = hers ? 'body' : 'world';
      if (far < 1) this.sound(at, GUN_NEAR, muzzle, bus, pitch, 1 - far);
      if (far > 0) this.sound(at, GUN_FAR, muzzle, bus, pitch, far);
    }
    const dose = DEAF.dose * Math.min(DEAF.near / Math.max(d, 1), 1) * (hers && s.below > 1 / 2 ? DEAF.below : 1);
    let jolt: Jolt | null = null;
    if (hers) {
      const m = muzzleAt(place), x = s.earShip[0] - m[0], z = s.earShip[2] - m[2];
      jolt = { x, z, strength: JOLT.strength * Math.min(JOLT.near / Math.max(Math.hypot(x, z), 1), 1) };
    }
    this.blows.push({ at, dose, jolt });
    if (!hers) this.passing(e.fired, fired, s);
    this.splashes(e.fired, fired, s);
  }

  /** The nearest ball of a shot passing the ear, heard as it passes (its rush started ahead, to peak there). */
  private passing(shot: Shot, fired: number, s: GunScene): void {
    let best: ReturnType<typeof nearestPass> = null;
    for (const b of shot.balls) {
      const p = nearestPass(b.path, s.ear);
      if (p && p.speed >= PASS_SLOWEST && (!best || p.d < best.d)) best = p;
    }
    if (!best) return;
    const gain = Math.min(SHOT_PASS.ref / Math.max(best.d, 1), 1);
    // A ball passing soon after it was fired (the enemy close) starts its rush with the shot: it is heard a little late.
    this.sound(Math.max(fired + best.t + best.d / SPEED_OF_SOUND - PASS_LEAD, fired), SHOT_PASS, best.at, 'world', PASS_PITCH[shot.shot], gain);
  }

  /** A shot's skips and plunges near the ear, the nearest few, each heard when its sound comes. */
  private splashes(shot: Shot, fired: number, s: GunScene): void {
    const near: { at: number; where: Vec; d: number; plunge: boolean }[] = [];
    for (const b of shot.balls) {
      b.touches.forEach((where, k) => {
        const d = earDistance(where, s.ear);
        if (d <= SPLASH_REACH) near.push({ at: fired + b.splashes[k]! + d / SPEED_OF_SOUND, where, d, plunge: k === b.touches.length - 1 });
      });
    }
    near.sort((a, b) => a.d - b.d);
    for (const n of near.slice(0, SPLASHES_A_SHOT)) {
      this.sound(n.at, SHOT_SPLASH, n.where, 'world', n.plunge ? 1 : SKIP_PITCH, n.plunge ? 1 : SKIP_GAIN);
    }
  }

  private sound(at: number, kind: SlapKind, where: Vec, bus: 'body' | 'world', pitch: number, share = 1): void {
    this.due.push({ at, sound: { id: kind.id, at: [where[0], where[1], where[2]], ref: kind.ref, gain: kind.gain * share, bus, delay: 0, pitch } });
  }
}
