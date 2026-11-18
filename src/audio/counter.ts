/**
 * The slap under her counter (plan N2.8): her stern overhangs the water above the sternpost, and when a sea rises
 * fast toward it as her stern comes down, it slaps up under the planking with a hollow smack. Watched at the counter's
 * lowest edge (the wing transom over the sternpost's face): the water's height under it, followed frame to frame.
 * Pure: the same sea gives the same slaps.
 */
import { clamp, lerp } from '@futuremagic/core';
import { TRANSOM } from '../sim/rules/ships';
import { surfaceAt, seaSample, type SeaState } from '../sim/sea/sea';
import { hullEnds } from '../sim/ship/hull';
import { toWorld, type ShipPose } from '../sim/ship/motion';
import { shipY, shipZ } from '../sim/ship/section';
import type { SlapEvent } from './slaps';
import { COUNTER, COUNTER_CLOSING, COUNTER_FULL, COUNTER_GAP, COUNTER_LOUDNESS, COUNTER_REACH } from './shipTuning';

/** The counter's lowest edge on her centreline, ship space: the wing transom where it meets the sternpost. */
export const COUNTER_EDGE: readonly [number, number, number] = [0, shipY(TRANSOM.wing), shipZ(hullEnds(TRANSOM.wing).aft)];

/** Whether the sea slaps the counter: it stands within COUNTER_REACH of it and closes faster than COUNTER_CLOSING. */
export const slapsCounter = (gap: number, closing: number): boolean => gap < COUNTER_REACH && closing > COUNTER_CLOSING;

/** A slap's loudness for the speed the sea closes on the counter, m/s. */
export const counterLoudness = (closing: number): number => lerp(COUNTER_LOUDNESS[0], COUNTER_LOUDNESS[1], clamp(closing / COUNTER_FULL, 0, 1));

export class CounterWatch {
  private readonly water = seaSample();
  private readonly at: [number, number, number] = [0, 0, 0];
  private gap: number | null = null;
  private clock = 0;
  private last = -Infinity;

  /** One frame of `dt` s at time `t` with her at `pose`: a slap to start now, in `out` (cleared first). */
  slaps(pose: ShipPose, sea: SeaState, t: number, dt: number, out: SlapEvent[] = []): SlapEvent[] {
    out.length = 0;
    const [x, y, z] = toWorld(pose, COUNTER_EDGE[0], COUNTER_EDGE[1], COUNTER_EDGE[2], this.at);
    const gap = y - surfaceAt(sea, x, z, t, this.water).height, was = this.gap;
    this.gap = gap;
    if (was === null || dt <= 0) return out;
    this.clock += dt;
    const closing = (was - gap) / dt;
    if (!slapsCounter(gap, closing) || this.clock - this.last < COUNTER_GAP) return out;
    this.last = this.clock;
    out.push({ kind: COUNTER, at: [x, this.water.height, z], gain: counterLoudness(closing) });
    return out;
  }
}
