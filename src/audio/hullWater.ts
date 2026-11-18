/**
 * The water along her sides (plan N2.8): its sound follows how fast the water moves past her planking, her way through
 * it and the sea rising and falling against her side (relative to her side as she heaves and rolls), heard as its root
 * mean square over a couple of seconds so it breathes with the seas. On deck it is heard from over each side, placed
 * at her waterline abreast of the ear; below deck it is the sea against her planking heard from inside, all round.
 * Each is two takes blended by a slow seeded swing (ambience.ts `takeAngle`), so no loop is heard. Pure.
 */
import { clamp, lerp } from '@futuremagic/core';
import { surfaceAt, seaSample, type SeaState } from '../sim/sea/sea';
import { HULL_AFT, HULL_FORE, hullHalfBreadth } from '../sim/ship/hull';
import { toWorld, type ShipPose } from '../sim/ship/motion';
import { shipZ } from '../sim/ship/section';
import { LOAD_WATERLINE } from '../sim/rules/ships';
import { TAKES, takeAngle } from './ambience';
import {
  FLOW_FULL, FLOW_SMOOTH, HULL_GLIDE, HULL_INSIDE, HULL_RUN, INSIDE_GAIN, RISE_FLOW, SIDE_END_MARGIN,
} from './shipTuning';

/** A bed of the ship's sound now: which take, under which key, how loud, placed (world) or all round, on which bus. */
export interface ShipBed {
  readonly id: string;
  readonly key: string;
  readonly level: number;
  readonly glide: number;
  readonly at: readonly [number, number, number] | null;
  readonly ref: number;
  readonly bus: 'world' | 'body';
}

/** Her two sides: port (-x) and starboard (+x), each with its own name for its beds' keys and swings. */
const SIDES = [{ name: 'port', sign: -1 }, { name: 'starboard', sign: 1 }] as const;

/** The water's speed along her side from her way (m/s) and the RMS of its rise and fall against her side (m/s). */
export const flowOf = (way: number, riseRms: number): number => Math.hypot(way, RISE_FLOW * riseRms);

/** How full the water's sound is for a flow, 0..1: the root of its share of FLOW_FULL. */
export const flowShare = (flow: number): number => Math.sqrt(clamp(flow / FLOW_FULL, 0, 1));

/** The run along her side heard on deck, for a flow, before the room and the take's share. */
export const runLevel = (flow: number): number => HULL_RUN.gain * flowShare(flow);

/** The sea against her planking heard below deck, for a flow, before the room and the take's share. */
export const insideLevel = (flow: number): number => lerp(INSIDE_GAIN[0], INSIDE_GAIN[1], flowShare(flow));

export class HullWater {
  private readonly water = seaSample();
  private readonly at: [number, number, number][] = SIDES.map(() => [0, 0, 0]);
  private readonly gaps: (number | null)[] = SIDES.map(() => null);
  /** Each side's mean square of the water's rise against it, (m/s)². */
  private readonly square: number[] = SIDES.map(() => 0);

  constructor(private readonly seed: number) {}

  /**
   * One frame of `dt` s at time `t`: her at `pose` making `way` m/s through the water, the ear at `eye` (ship space),
   * `below` 0 on deck to 1 below. The beds to set now, into `out` (cleared first); a bed at level 0 is listed too.
   */
  beds(pose: ShipPose, sea: SeaState, t: number, dt: number, way: number, eye: readonly [number, number, number], below: number, out: ShipBed[] = []): ShipBed[] {
    out.length = 0;
    const along = clamp(-eye[2], HULL_AFT + SIDE_END_MARGIN, HULL_FORE - SIDE_END_MARGIN);
    const half = hullHalfBreadth(along, LOAD_WATERLINE), fade = dt > 0 ? 1 - Math.exp(-dt / FLOW_SMOOTH) : 0;
    let flows = 0;
    SIDES.forEach((side, i) => {
      const [x, y, z] = toWorld(pose, side.sign * half, 0, shipZ(along), this.at[i]);
      const gap = surfaceAt(sea, x, z, t, this.water).height - y, was = this.gaps[i]!;
      this.gaps[i] = gap;
      if (was !== null && dt > 0) {
        const rise = (gap - was) / dt;
        this.square[i]! += (rise * rise - this.square[i]!) * fade;
      }
      const flow = flowOf(way, Math.sqrt(this.square[i]!));
      flows += flow;
      this.pushTakes(out, HULL_RUN.id, side.name, runLevel(flow) * (1 - below), t, [x, y, z], 'world');
    });
    this.pushTakes(out, HULL_INSIDE, 'inside', insideLevel(flows / SIDES.length) * below, t, null, 'body');
    return out;
  }

  /** The two takes of a bed at `level`, shared by its swing (named `swing`), onto `out`. */
  private pushTakes(out: ShipBed[], id: string, swing: string, level: number, t: number, at: readonly [number, number, number] | null, bus: 'world' | 'body'): void {
    const angle = takeAngle(this.seed, `${id}@${swing}`, t);
    TAKES.forEach((k, i) => {
      const share = i === 0 ? Math.cos(angle) : Math.sin(angle), take = `${id}-${k}`;
      out.push({ id: take, key: `${take}@${swing}`, level: level * share, glide: HULL_GLIDE, at, ref: HULL_RUN.ref, bus });
    });
  }
}
