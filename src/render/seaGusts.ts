/**
 * The wind's gusts as the sea shows them (plan N1.4, N1.6): darker, ruffled patches drifting over the water. Each
 * frame the gusts near the eye (`gustsNear`) are laid into a small map around it, which the sea's material reads: how
 * much each gust roughens the fine waves there (`gustRoughening`) and how strong it is. Pure.
 */
import { gustShape, gustsNear, type WindState } from '../sim/wind';
import { gustRoughening } from './seaFine';

/** Texels along each side of the gust map, and the side of one texel, m: the map covers 6.4 km around the eye. */
export const GUST_TEXELS = 128;
export const GUST_TEXEL = 50;
/** The map's side, m. */
export const GUST_SPAN = GUST_TEXELS * GUST_TEXEL;
/** Numbers per texel: how much the fine waves grow (red) and the gust's strength (green), as bytes. */
export const GUST_CHANNELS = 2;
/** The largest growth and strength a byte holds: growth is stored as (scale − 1) / GUST_GROWTH_TOP. */
export const GUST_GROWTH_TOP = 6;
export const GUST_STRENGTH_TOP = 2;
/** A byte's largest value. */
const BYTE = 255;

/** The gust map of one moment. */
export interface GustMap {
  /** GUST_TEXELS² texels of GUST_CHANNELS bytes, row by row along x, rows along z. */
  readonly data: Uint8Array;
  /** The world point at the map's corner (its texel 0's outer corner), m. */
  x0: number;
  z0: number;
}

/** An empty map. */
export function gustMap(): GustMap {
  return { data: new Uint8Array(GUST_TEXELS * GUST_TEXELS * GUST_CHANNELS), x0: 0, z0: 0 };
}

const strength = new Float32Array(GUST_TEXELS * GUST_TEXELS);

/**
 * Lay the gusts of `wind` at time `t` (s) into `map`, centred on the eye at world (x, z) on a fixed lattice of
 * GUST_TEXEL (so the map does not swim as the eye moves). `speed` is the mean wind (m/s) and `coarse` the slope the
 * simulated waves carry, for how much each gust roughens the water.
 */
export function drawGusts(wind: WindState, t: number, x: number, z: number, speed: number, coarse: number, map: GustMap): GustMap {
  map.x0 = (Math.round(x / GUST_TEXEL) - GUST_TEXELS / 2) * GUST_TEXEL;
  map.z0 = (Math.round(z / GUST_TEXEL) - GUST_TEXELS / 2) * GUST_TEXEL;
  strength.fill(0);
  for (const g of gustsNear(wind, x, z, t, (GUST_SPAN / 2) * Math.SQRT2)) {
    // Texel centres sit at x0 + (i + ½) · GUST_TEXEL.
    const lo = (v: number, at: number) => Math.max(0, Math.ceil((v - g.radius - at) / GUST_TEXEL - 1 / 2));
    const hi = (v: number, at: number) => Math.min(GUST_TEXELS - 1, Math.floor((v + g.radius - at) / GUST_TEXEL - 1 / 2));
    for (let j = lo(g.z, map.z0); j <= hi(g.z, map.z0); j++) {
      const dz = map.z0 + (j + 1 / 2) * GUST_TEXEL - g.z;
      for (let i = lo(g.x, map.x0); i <= hi(g.x, map.x0); i++) {
        const dx = map.x0 + (i + 1 / 2) * GUST_TEXEL - g.x;
        strength[j * GUST_TEXELS + i] += g.strength * gustShape(Math.hypot(dx, dz) / g.radius);
      }
    }
  }
  for (let i = 0; i < strength.length; i++) {
    const s = strength[i]!, grow = s > 0 ? gustRoughening(speed, coarse, s) - 1 : 0;
    map.data[i * GUST_CHANNELS] = Math.round(BYTE * Math.min(1, grow / GUST_GROWTH_TOP));
    map.data[i * GUST_CHANNELS + 1] = Math.round(BYTE * Math.min(1, s / GUST_STRENGTH_TOP));
  }
  return map;
}
