/**
 * Sounds that happen at a time of the match's clock and are heard later by the speed of sound (gunfire N5.6, damage
 * N6.8): kept until they are near, then handed to the engine with the rest of the wait as their delay; one more than
 * `LATE` behind (a tab that slept, a jump of the browser checks) is left out. Pure.
 */
import { LATE, LOOK_AHEAD } from './gunTuning';
import type { PlacedShot } from './heard';
import type { SlapKind } from './tuning';

type Vec3 = readonly [number, number, number];
type Vec = readonly number[];

/** A sound to start, with its playback rate. */
export interface DueShot extends PlacedShot {
  readonly pitch: number;
}

/** The distance between two points of the world, m. */
export const worldDistance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The nearest `n` of `list` (each with its distance `d`), nearest first; sorts `list`. */
export const nearest = <T extends { readonly d: number }>(list: T[], n: number): T[] => list.sort((a, b) => a.d - b.d).slice(0, n);

export class DueSounds {
  private readonly due: { readonly at: number; readonly sound: DueShot }[] = [];

  /** A take of `kind` heard at `at` (the match's clock, s) from `where`, at `share` of its gain and played at `pitch`. */
  keep(at: number, kind: SlapKind, where: Vec, bus: 'body' | 'world', pitch: number, share = 1): void {
    this.due.push({ at, sound: { id: kind.id, at: [where[0]!, where[1]!, where[2]!], ref: kind.ref, gain: kind.gain * share, bus, delay: 0, pitch } });
  }

  /** The sounds near at `t` into `out`, each with its delay from now; those already too late are dropped. */
  take(t: number, out: DueShot[]): void {
    for (let i = this.due.length - 1; i >= 0; i--) {
      const d = this.due[i]!;
      if (d.at > t + LOOK_AHEAD) continue;
      this.due.splice(i, 1);
      if (d.at < t - LATE) continue;
      out.push({ ...d.sound, delay: Math.max(0, d.at - t) });
    }
  }

  get length(): number {
    return this.due.length;
  }
}
