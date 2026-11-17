/**
 * The sea's waves as the vertex stage draws them at one moment (plan N1.3): the swell and every wind layer of
 * N1.1's sea in one flat list, each wave's height and reach already weighted by its layer (`layerWeights`), and its
 * phase worked out here in double precision for a point near the eye. The vertex stage then needs only
 * θ = kx·x + kz·z + phase for x and z measured from that point, small numbers float32 holds exactly, so the
 * surface it draws is `seaAt`'s however far the ship sails and however long the match runs. Pure.
 */
import { forEachShownSet, type SeaState } from '../sim/sea/sea';
import type { WaveSet } from '../sim/sea/waves';

/**
 * Room for waves drawn at once: the swell and two wind sets while one fades into the other (sea.ts shows at most two
 * layers at a time), with room to spare.
 */
export const SEA_DRAWN_WAVES = 64;
/** Numbers per wave in each of the table's two lists (one vec4 each). */
export const SEA_WAVE_STRIDE = 4;
/** Where each number of a wave sits in its entry of `wave`: kx, kz, phase, height (the vertex stage reads x, y, z, w). */
export const WAVE_AT = { kx: 0, kz: 1, phase: 2, height: 3 } as const;
/** And in its entry of `more`: reach and |k|. */
export const MORE_AT = { reach: 0, k: 1 } as const;

/** The waves of one moment, as the vertex stage reads them. */
export interface SeaWaveTable {
  /** Per wave: kx and kz (rad/m), the phase at the table's origin now (rad, −π..π), and its height (m, weighted). */
  readonly wave: Float32Array;
  /** Per wave: how far it moves the water sideways (`reach`, m, weighted), |k| (rad/m), and two unused. */
  readonly more: Float32Array;
  /** How many waves are in the lists. */
  count: number;
  /** How far the mean level rises to make up for the Gerstner troughs, m (every set's lift, weighted as `seaAt` does). */
  lift: number;
  /** The most the surface can rise, sink or move sideways from its calm place, m (the sum of the heights). */
  extent: number;
}

/** An empty table, to fill with `fillSeaWaves`. */
export function seaWaveTable(): SeaWaveTable {
  return { wave: new Float32Array(SEA_DRAWN_WAVES * SEA_WAVE_STRIDE), more: new Float32Array(SEA_DRAWN_WAVES * SEA_WAVE_STRIDE), count: 0, lift: 0, extent: 0 };
}

const TURN = 2 * Math.PI;

/** Add one wave set, weighted by `f`, with phases for the origin (ox, oz) at time t. */
function addSet(table: SeaWaveTable, w: WaveSet, f: number, ox: number, oz: number, t: number): void {
  for (let i = 0; i < w.kx.length; i++) {
    if (table.count >= SEA_DRAWN_WAVES) throw new Error(`the sea has more than ${SEA_DRAWN_WAVES} waves to draw (SEA_DRAWN_WAVES)`);
    const kx = w.kx[i]!, kz = w.kz[i]!, at = table.count * SEA_WAVE_STRIDE;
    const phase = kx * ox + kz * oz - w.omega[i]! * t + w.phase[i]!;
    table.wave[at + WAVE_AT.kx] = kx;
    table.wave[at + WAVE_AT.kz] = kz;
    table.wave[at + WAVE_AT.phase] = phase - TURN * Math.round(phase / TURN);
    table.wave[at + WAVE_AT.height] = f * w.amp[i]!;
    table.more[at + MORE_AT.reach] = f * w.reach[i]!;
    table.more[at + MORE_AT.k] = Math.hypot(kx, kz);
    table.extent += f * w.amp[i]!;
    table.count++;
  }
  table.lift += f * f * w.lift;
}

/**
 * Fill `table` with the sea's waves at time `t` (s of the shared clock), their phases for x and z measured from the
 * calm point (ox, oz). The swell at full strength, then every wind layer that shows, as `seaAt` sums them.
 */
export function fillSeaWaves(sea: SeaState, t: number, ox: number, oz: number, table: SeaWaveTable): SeaWaveTable {
  table.count = 0;
  table.lift = 0;
  table.extent = 0;
  forEachShownSet(sea, t, (waves, factor) => addSet(table, waves, factor, ox, oz, t));
  return table;
}
