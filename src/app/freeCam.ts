/**
 * The spectator's camera (implementation plan N7.8, "Watch a battle"): a free eye in the world's own space that flies
 * where the viewer pushes it, keeps company with a ship if he asks, and glides to a good place to see her from.
 * Pure: the page (spectator.ts) feeds it the thumb, the keys and where the ships are, and reads the eye and the look.
 *
 * Speed follows what is near: a hand-span from a hull it creeps, far out on the sea it flies, so one control reaches
 * both a ship's carved stern and the other ship five hundred metres off. Shift boosts it. The eye never goes under the
 * water's surface or higher than `CEILING`.
 */
import { lookDir, PITCH_LIMIT, type Look } from './look';
import type { Push } from './thumbs';
import { apartOnWater, bearingDir } from '../sim/units';

/** A place in the world (x east, y up, z south; metres). */
export type Vec3 = readonly [number, number, number];

/** How fast the eye flies per metre between it and the nearest ship's side, m/s per m. */
export const SPEED_PER_METRE = 0.8;
/** The slowest and fastest the eye flies without the boost, m/s: a walk right up against a hull, a gallop far out. */
export const SPEED_LEAST = 2.5;
export const SPEED_MOST = 220;
/** The boost's multiple. */
export const BOOST = 4;
/** The highest the eye may climb above the sea, m. */
export const CEILING = 1500;
/** The lowest the eye may go over the water's surface under it, m. */
export const ABOVE_WATER = 0.8;
/** How a ship's middle stands from her side: what is taken off the distance to her middle for the speed, m. */
export const SHIP_HALF = 14;
/** How quickly a glide closes on its place, 1/s (the distance left falls by this share each second, over a second and a half to arrive). */
const GLIDE_RATE = 2.4;
/** A glide is over when it is this near its place (m) and look (rad). */
const GLIDE_DONE = 0.4;
const GLIDE_DONE_ANGLE = 0.01;
/** Climbing and falling at the key's pace is this share of the flight's speed (a ship's height is a few tens of metres). */
const CLIMB_SHARE = 0.6;

/** What the viewer asks for each frame. */
export interface Flying {
  /** The thumb's or keys' push: forward along the look, strafe to its right. */
  readonly push: Push;
  /** Up (+1) or down (-1), straight along the world's vertical. */
  readonly climb: number;
  readonly boost: boolean;
  /** How far the nearest ship's middle is from the eye, m (Infinity: none). */
  readonly near: number;
  /** The water's surface under the eye, m (its height at that place and moment). */
  readonly water: number;
}

/** A place to glide to: where the eye goes and how it looks there. */
export interface Vantage {
  readonly at: Vec3;
  readonly look: Look;
}

/** Speed of flight for the nearest ship's middle at `near` m, m/s (before the boost). */
export const flightSpeed = (near: number): number =>
  Math.min(SPEED_MOST, Math.max(SPEED_LEAST, Math.max(0, near - SHIP_HALF) * SPEED_PER_METRE));

/** The look that turns the eye at `from` to `to`: yaw 0 looks along -z, growing to the left; pitch up positive. */
export function lookToward(from: Vec3, to: Vec3): Look {
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, Math.atan2(dy, Math.hypot(dx, dz)))) };
}

/** A ship as the camera needs it: where she lies (world x, z) and her compass heading, rad. */
export interface Hull {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
}

/** Off a ship's starboard quarter, close and above: her whole length and rig in the picture. */
const QUARTER_AFT = 70;
const QUARTER_ABEAM = 42;
const QUARTER_HEIGHT = 16;
/** The ship's middle is looked at this high over her waterline, m (about her lower yards). */
const LOOK_HEIGHT = 9;

/** A good place to see one ship from: off her starboard quarter, looking at her middle. */
export function vantageOf(ship: Hull): Vantage {
  const [fx, fz] = bearingDir(ship.heading), [sx, sz] = bearingDir(ship.heading + Math.PI / 2);
  const at: Vec3 = [ship.x + sx * QUARTER_ABEAM - fx * QUARTER_AFT, QUARTER_HEIGHT, ship.z + sz * QUARTER_ABEAM - fz * QUARTER_AFT];
  return { at, look: lookToward(at, [ship.x, LOOK_HEIGHT, ship.z]) };
}

/** The share of the distance between the ships the eye stands off the line between them, and how high (also a share), for seeing both. */
const BOTH_OFF = 0.8;
const BOTH_HEIGHT = 0.3;
/** The least the eye stands off the line, and the least height, m: the ships may start close. */
const BOTH_OFF_LEAST = 160;
const BOTH_HEIGHT_LEAST = 45;

/** A good place to see both ships at once: to one side of the line between them, high enough to see over the nearer. */
export function vantageOfBoth(a: Hull, b: Hull): Vantage {
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, dx = b.x - a.x, dz = b.z - a.z, apart = apartOnWater(a, b) || 1;
  const off = Math.max(BOTH_OFF_LEAST, apart * BOTH_OFF), up = Math.max(BOTH_HEIGHT_LEAST, apart * BOTH_HEIGHT);
  // To the right of the line from the first ship to the second (looking along it).
  const at: Vec3 = [mx - (dz / apart) * off, up, mz + (dx / apart) * off];
  return { at, look: lookToward(at, [mx, 0, mz]) };
}

/** An angle brought into -pi..pi. */
const wrapAngle = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

export class FreeCam {
  x: number;
  y: number;
  z: number;
  /** Where the company was last frame (`step`'s `company`: the ship the eye keeps company with, carried along as she moves); null: the eye stays where it is in the world. */
  private company: { x: number; z: number } | null = null;
  private glide: Vantage | null = null;
  /** The look the glide set last: a look that differs is the viewer's own, and ends the glide. */
  private glidLook: Look | null = null;

  constructor(at: Vec3) {
    [this.x, this.y, this.z] = at;
  }

  get at(): Vec3 {
    return [this.x, this.y, this.z];
  }

  get gliding(): boolean {
    return this.glide !== null;
  }

  /** Glides to a vantage (its place given where the company is now, as the world has it). */
  glideTo(v: Vantage): void {
    this.glide = v;
    this.glidLook = null;
  }

  /**
   * One frame: carried along with the company (`company`: where the ship it keeps company with, or the middle of
   * both, is now; null: none, the eye stays in the world), the viewer's push and climb (or a glide in progress)
   * applied; returns the look to use (the glide's own, or `look` unchanged). Changing the company changes nothing
   * by itself: the eye is carried from the next frame by what the company then moves.
   */
  onward(dt: number, look: Look, fly: Flying, company: { x: number; z: number } | null): Look {
    // Carried along with the ship she keeps company with: by what the ship moved since the last frame.
    if (company && this.company) {
      const dx = company.x - this.company.x, dz = company.z - this.company.z;
      this.x += dx; this.z += dz;
      // The place a glide is bound for goes with her too.
      if (this.glide) this.glide = { ...this.glide, at: [this.glide.at[0] + dx, this.glide.at[1], this.glide.at[2] + dz] };
    }
    this.company = company ? { x: company.x, z: company.z } : null;
    const pushing = fly.push.forward !== 0 || fly.push.strafe !== 0 || fly.climb !== 0;
    // The viewer's own hand ends a glide: a push, a climb, or a look that is not the one the glide set.
    if (this.glide && (pushing || (this.glidLook && (this.glidLook.yaw !== look.yaw || this.glidLook.pitch !== look.pitch)))) this.glide = null;
    let out = look;
    if (this.glide) out = this.glideOn(dt, look);
    else if (pushing) this.flyBy(dt, look, fly);
    this.y = Math.min(CEILING, Math.max(fly.water + ABOVE_WATER, this.y));
    return out;
  }

  private flyBy(dt: number, look: Look, fly: Flying): void {
    const speed = flightSpeed(fly.near) * (fly.boost ? BOOST : 1), [dx, dy, dz] = lookDir(look);
    // The strafe is level, to the right of where he looks.
    const rx = Math.cos(look.yaw), rz = -Math.sin(look.yaw);
    this.x += (dx * fly.push.forward + rx * fly.push.strafe) * speed * dt;
    this.y += (dy * fly.push.forward + fly.climb * CLIMB_SHARE) * speed * dt;
    this.z += (dz * fly.push.forward + rz * fly.push.strafe) * speed * dt;
  }

  /** One step toward the glide's place and look (its place, like the eye, in the world as it is now). */
  private glideOn(dt: number, look: Look): Look {
    const g = this.glide!, k = 1 - Math.exp(-GLIDE_RATE * dt);
    this.x += (g.at[0] - this.x) * k;
    this.y += (g.at[1] - this.y) * k;
    this.z += (g.at[2] - this.z) * k;
    const out: Look = { yaw: look.yaw + wrapAngle(g.look.yaw - look.yaw) * k, pitch: look.pitch + (g.look.pitch - look.pitch) * k };
    const arrived = Math.hypot(g.at[0] - this.x, g.at[1] - this.y, g.at[2] - this.z) < GLIDE_DONE
      && Math.abs(wrapAngle(g.look.yaw - out.yaw)) < GLIDE_DONE_ANGLE && Math.abs(g.look.pitch - out.pitch) < GLIDE_DONE_ANGLE;
    this.glidLook = out;
    if (arrived) { this.glide = null; this.glidLook = null; return g.look; }
    return out;
  }
}
