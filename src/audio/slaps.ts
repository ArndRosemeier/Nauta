/**
 * Slaps and crests near the listener (plan N1.7): points on the water around the listener are watched, and when a crest
 * passes one (the water there stops rising) a sound may start at that place: a lap in a calm, a slap against the hull in
 * a breeze, a whitecap tumbling over as the wind rises, a heavy sea bursting in a strong breeze. So what is heard comes
 * from the waves that are seen, and in their rhythm. Pure and seeded: the same sea gives the same sounds.
 */
import { TAU, clamp, deriveSeed, hash3i, hashToFloat, lerp, smoothstep } from '@futuremagic/core';
import { forEachShownSet, seaAt, seaSample, type SeaState } from '../sim/sea/sea';
import type { WaveSet } from '../sim/sea/waves';
import {
  BURST, BURSTS, BURSTS_MOST, CREST, CREST_LEAST, CREST_LOUDNESS, CRESTS_BREAK, CRESTS_BREAK_MOST, LAP, LAP_UNTIL, SLAP,
  SLAP_CHANCE, SLAP_GAP, SLAP_POINTS, SLAP_REACH, type SlapKind,
} from './tuning';

/** The usual crest of a random sea stands this many RMS heights high (the mean of a Rayleigh amplitude, √(π/2)). */
const USUAL_CREST = Math.sqrt(Math.PI / 2);

/** A sound to start now at a place on the water. */
export interface SlapEvent {
  readonly kind: SlapKind;
  /** Where, in the world (m): on the water near the listener. */
  readonly at: readonly [number, number, number];
  /** How loud, 1 = the kind's gain for a usual crest. */
  readonly gain: number;
}

/** A watched point: where it lies from the listener and how the water there moved at the last look. */
interface Point {
  dx: number;
  dz: number;
  rise: number;
}

/**
 * Which sound a breaking or slapping crest makes at a force of the sea, from three seeded draws in 0..1: laps give way
 * to slaps as the sea gets up, a share of crests breaks into whitecaps as the wind rises, and a share of those bursts
 * against her in a strong breeze.
 */
export function slapKind(force: number, d1: number, d2: number, d3: number): SlapKind {
  if (d1 < 1 - smoothstep(LAP_UNTIL[0], LAP_UNTIL[1], force)) return LAP;
  if (d2 >= CRESTS_BREAK_MOST * smoothstep(CRESTS_BREAK[0], CRESTS_BREAK[1], force)) return SLAP;
  return d3 < BURSTS_MOST * smoothstep(BURSTS[0], BURSTS[1], force) ? BURST : CREST;
}

let energy = 0;
const addEnergy = (w: WaveSet, f: number): void => { for (const a of w.amp) energy += (f * f * a * a) / 2; };

/** The sea's RMS height at time `t`, m: the root of every shown wave's energy (half its amplitude squared). */
export function seaRms(sea: SeaState, t: number): number {
  energy = 0;
  forEachShownSet(sea, t, addEnergy);
  return Math.sqrt(energy);
}

/** The `n`th seeded draw of stream `what` from `seed`, 0..1 (each watch's draws are counted, so each is new). */
export const seededDraw = (seed: number, n: number, what: number): number => hashToFloat(hash3i(seed, n, what, 0));

/** The watch's seeded draws, each kind its own stream (counted, so each draw is new). */
const DRAW = { angle: 0, reach: 1, chance: 2, kind1: 3, kind2: 4, kind3: 5 } as const;

export class SlapWatch {
  private readonly points: Point[] = [];
  private readonly sample = seaSample();
  private readonly seed: number;
  /** How many places have been drawn, and how many crests have passed: each draw is seeded by its count. */
  private placed = 0;
  private crests = 0;
  /** When the last sound started, s. */
  private last = -Infinity;

  constructor(seed: number) {
    this.seed = deriveSeed(seed, 'slaps');
    for (let i = 0; i < SLAP_POINTS; i++) this.points.push(this.place({ dx: 0, dz: 0, rise: 0 }));
  }

  /**
   * Look at the water around the listener at (x, z) at time `t` (call it every frame) and list the sounds to start now
   * in `out` (cleared first). `force` is the force of the sea (ambience.ts `seaForce`).
   */
  listen(sea: SeaState, t: number, x: number, z: number, force: number, out: SlapEvent[] = []): SlapEvent[] {
    out.length = 0;
    const rms = seaRms(sea, t), s = this.sample;
    for (const p of this.points) {
      seaAt(sea, x + p.dx, z + p.dz, t, s);
      const rise = s.velocity[1], crest = p.rise > 0 && rise <= 0 && s.height > CREST_LEAST * rms;
      p.rise = rise;
      if (!crest) continue;
      const n = this.crests++;
      if (this.pick(DRAW.chance, n) >= SLAP_CHANCE || t - this.last < SLAP_GAP) continue;
      this.last = t;
      const kind = slapKind(force, this.pick(DRAW.kind1, n), this.pick(DRAW.kind2, n), this.pick(DRAW.kind3, n));
      const gain = clamp(s.height / (USUAL_CREST * rms), CREST_LOUDNESS[0], CREST_LOUDNESS[1]);
      out.push({ kind, at: [x + p.dx + s.shift[0], s.height, z + p.dz + s.shift[1]], gain });
      this.place(p);
    }
    return out;
  }

  private pick(what: number, n: number): number {
    return seededDraw(this.seed, n, what);
  }

  /** Give a point a new seeded place around the listener; it waits to see the water rise there before it hears a crest. */
  private place(p: Point): Point {
    const n = this.placed++, angle = TAU * this.pick(DRAW.angle, n), reach = lerp(SLAP_REACH[0], SLAP_REACH[1], this.pick(DRAW.reach, n));
    p.dx = reach * Math.cos(angle);
    p.dz = reach * Math.sin(angle);
    p.rise = 0;
    return p;
  }
}
