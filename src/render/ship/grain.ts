/**
 * The look of her timber as one small texture, made at load from a seed (no image to download): in red the grain's
 * growth rings, in green the fine pores, in blue the grime of years at sea, in alpha a second, larger grime. It covers
 * GRAIN_SPAN metres of wood and repeats seamlessly; the wood kind lays it in metres (shipMaterials.ts), shifted per
 * plank so no two planks look alike.
 */
import { DataTexture, LinearMipmapLinearFilter, LinearFilter, RGBAFormat, RepeatWrapping, UnsignedByteType } from 'three/webgpu';
import { Noise, hash2f } from '@futuremagic/core';

/** Metres of wood the texture covers: along the grain and across it. */
export const GRAIN_SPAN = { along: 2, across: 0.5 } as const;
/** Texels along and across. */
const SIZE = { along: 512, across: 256 } as const;
/** Growth rings across the span (a whole number, so they repeat): about one every 10 mm, flat sawn pine. */
const RINGS = 48;
/** How far the rings wander across the grain as they run along it, in rings, and over how many waves per span. */
const WANDER = 1.6;
const WANDER_WAVES = 1.2;
/** How the ring spacing breathes across the span: its depth, in rings, and its waves per span (a whole number). */
const BREATH = 1.5;
const BREATH_WAVES = 4;
/** The share of a ring that is dark late wood (each ring its own, between these), and how soft its edge is. */
const LATE = { least: 0.12, most: 0.42 } as const;
const LATE_SOFT = 0.12;
/** Pores: noise this fine (per m) along and across. */
const PORE = { along: 90, across: 900 } as const;
/** Grime blotches per metre (fine and coarse), and the grime noise's octaves. */
const GRIME = { fine: 6, coarse: 1.6, octaves: 4 } as const;
/** The grime and the rings' wander are worked out on a grid this many times coarser and smoothed up (they have no fine detail). */
const GRIME_COARSER = 8;
/** Octaves of the rings' wander. */
const WANDER_OCTAVES = 3;
/** The texture's noise seed. */
const SEED = 1797;
/** Channels per texel, and the largest value of one. */
const RGBA = 4;
const FULL = 255;
/** A turn, rad. */
const TURN = 2 * Math.PI;
/** Simplex noise reaches about ±1: half of it, to bring it to 0..1. */
const HALF = 1 / 2;
/** How much anisotropic filtering the grain gets (it is seen at grazing angles on the deck). */
const ANISOTROPY = 8;

/** Noise round a circle of `period` m, so it repeats there: `x` along the circle, `y` straight. */
function looped(noise: Noise, x: number, period: number, y: number, scale: number, octaves: number): number {
  const a = (x / period) * TURN, r = (period * scale) / TURN;
  return noise.fbm3(Math.cos(a) * r, Math.sin(a) * r, y * scale, octaves);
}

/** Noise that repeats over `pu` along x and `pv` along y: blended across the second wrap. */
function tiled(noise: Noise, x: number, pu: number, y: number, pv: number, scale: number, octaves: number): number {
  const w = y / pv;
  return (1 - w) * looped(noise, x, pu, y, scale, octaves) + w * looped(noise, x, pu, y - pv, scale, octaves);
}

export function makeGrainTexture(): DataTexture {
  const noise = new Noise(SEED);
  const data = new Uint8Array(SIZE.along * SIZE.across * RGBA);
  // The grime, coarse: one more row and column than it covers, so it wraps when smoothed up.
  const gu = SIZE.along / GRIME_COARSER, gv = SIZE.across / GRIME_COARSER;
  const grime = (scale: number, octaves: number) => {
    const g = new Float32Array((gu + 1) * (gv + 1));
    for (let j = 0; j <= gv; j++) for (let i = 0; i <= gu; i++) {
      g[j * (gu + 1) + i] = HALF + HALF * tiled(noise, ((i % gu) / gu) * GRAIN_SPAN.along, GRAIN_SPAN.along, ((j % gv) / gv) * GRAIN_SPAN.across, GRAIN_SPAN.across, scale, octaves);
    }
    return (i: number, j: number) => {
      const x = i / GRIME_COARSER, y = j / GRIME_COARSER, x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const at = (a: number, b: number) => g[b * (gu + 1) + a]!;
      return (1 - fy) * ((1 - fx) * at(x0, y0) + fx * at(x0 + 1, y0)) + fy * ((1 - fx) * at(x0, y0 + 1) + fx * at(x0 + 1, y0 + 1));
    };
  };
  const fine = grime(GRIME.fine, GRIME.octaves), coarse = grime(GRIME.coarse, GRIME.octaves);
  // The rings wander across the grain as they run along it, each part of the board its own way.
  const wander = grime(WANDER_WAVES / GRAIN_SPAN.along, WANDER_OCTAVES);
  for (let j = 0; j < SIZE.across; j++) {
    const v = (j / SIZE.across) * GRAIN_SPAN.across, fv = j / SIZE.across;
    const ring0 = fv * RINGS + BREATH * Math.sin(fv * BREATH_WAVES * TURN);
    for (let i = 0; i < SIZE.along; i++) {
      const u = (i / SIZE.along) * GRAIN_SPAN.along;
      const ring = ring0 + WANDER * (wander(i, j) - HALF) / HALF, f = ring - Math.floor(ring);
      // Late wood: a dark band at the end of each ring, soft toward the next spring's growth; good years, wide rings.
      const share = LATE.least + (LATE.most - LATE.least) * hash2f(SEED, ((Math.floor(ring) % RINGS) + RINGS) % RINGS, 0);
      const late = Math.min(1, Math.max(0, (f - (1 - share)) / LATE_SOFT)) * Math.min(1, Math.max(0, (1 - f) / LATE_SOFT));
      const pore = HALF + HALF * noise.n3(u * PORE.along, v * PORE.across, 0);
      const at = (j * SIZE.along + i) * RGBA;
      data[at] = Math.round(late * FULL);
      data[at + 1] = Math.round(pore * FULL);
      data[at + 2] = Math.round(fine(i, j) * FULL);
      data[at + RGBA - 1] = Math.round(coarse(i, j) * FULL);
    }
  }
  const t = new DataTexture(data, SIZE.along, SIZE.across, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = ANISOTROPY;
  t.needsUpdate = true;
  return t;
}
