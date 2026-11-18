// @ts-nocheck -- three's TSL typings infer vector widths poorly for this much shader math; checked by rendering it (npm run shot).
/**
 * The sea's shader (plan N1.3, N1.4).
 *
 * The vertex stage places one tile of the grid (seaGrid.ts) and displaces it by the simulated waves exactly as
 * `seaAt` does (seaWaves.ts), sliding its vertices onto the coarser grid in the outer part of its range and letting
 * waves fade that the grid there cannot hold; the earth's curve then takes the far sea down to a true horizon. It
 * also works out where the surface bunches enough to break white now and where it did a few seconds ago (seaFoam.ts):
 * the water a vertex stands for is the same water then, so foam stays on the water it formed on and fades behind
 * the crest.
 *
 * The fragment stage draws the water as light finds it. Its normal comes per pixel from every simulated wave and the
 * fine waves below them (seaFine.ts), each faded out where a pixel is too coarse to hold it; what is faded becomes
 * roughness instead, so the far sea blurs the sky it reflects and spreads the sun's glitter into a path as the real
 * sea does (Cox and Munk). On it: the sky's reflection from the light rig's environment map, the sun's (or the moon's)
 * glitter, the deep water's own colour lit by the sun and the sky, light through the thin tops of crests, gust patches
 * that roughen it (seaGusts.ts), foam, and the air's haze toward the horizon. From below: the sky through Snell's
 * window, the dark of total reflection around it, and the murk of the deep.
 */
import {
  ClampToEdgeWrapping, DataTexture, DoubleSide, InstancedBufferAttribute, LinearFilter, LinearMipmapLinearFilter, MeshBasicNodeMaterial,
  RGFormat, RGBAFormat, RepeatWrapping, BackSide, Vector2, Vector3, Vector4, type Texture,
} from 'three/webgpu';
import {
  Break, Fn, If, Loop, abs, attribute, clamp, cos, cross, dFdx, dFdy, dot, exp, exp2, float, frontFacing, length, max, min, mix, mod,
  log, normalize, pmremTexture, positionGeometry, positionLocal, pow, reflect, refract, saturate, select, sin, smoothstep, sqrt, texture,
  uniform, uniformArray, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl';
import { fullSky } from '@futuremagic/sky/rig';
import { EARTH_RADIUS } from './earth';
import { seaCut } from './seaCut';
import { SEA_LOD_RANGE, SEA_MAX_TILES, SEA_MORPH_START, SEA_TILE_CELLS, SEA_WAVE_FULL_CELLS, SEA_WAVE_GONE_CELLS } from './seaGrid';
import { SEA_DRAWN_WAVES, SEA_WAVE_STRIDE } from './seaWaves';
import { SEA_FINE_DRAWN, SEA_FINE_STRIDE } from './seaFine';
import { FOAM_TEXELS, FOAM_WRAP, foamPattern } from './seaFoam';
import { RIPPLE_LONGEST, RIPPLE_REPEATS, RIPPLE_REPEATS_SECOND, RIPPLE_SHORTEST, RIPPLE_RANGE, RIPPLE_TEXELS, ripplePattern } from './seaRipples';
import { GUST_GROWTH_TOP, GUST_SPAN, GUST_STRENGTH_TOP, GUST_TEXELS, gustMap } from './seaGusts';

/** Numbers per tile in the tile list: corner x and z from the sea's origin (m), side (m), level (read as x, y, z, w). */
export const SEA_TILE_STRIDE = 4;
/** Where each number of a tile sits in its entry. */
export const TILE_AT = { x: 0, z: 1, size: 2, level: 3 } as const;
/** The name of the sea mesh's per-tile attribute. */
export const SEA_TILE_ATTRIBUTE = 'tile';

/** A turn, rad. */
const TURN = 2 * Math.PI;

// --- Foam that lingers: how long ago the vertex stage looks back, s, and how much of its foam is left by then.
const FOAM_LAG_NEAR = 1.6;
const FOAM_LAG_FAR = 4;
const FOAM_LEFT_NEAR = 0.8;
const FOAM_LEFT_FAR = 0.5;

// --- The pixel's view of the waves.
/** A wave is drawn fully where a pixel spans at most 1/PIXEL_FULL of it, and not at all past 1/PIXEL_GONE. */
const PIXEL_FULL = 8;
const PIXEL_GONE = 3.5;
/** The smallest pixel on the water, m (keeps the sums sane straight under the eye). */
const PIXEL_LEAST = 1e-4;
/** Roughness every pixel keeps (mean square slope): the sun's own disc (0.27° across) and a little more. */
const ROUGH_LEAST = 0.00003;

// --- Water and light.
/** Reflectance of water looked at straight down (Fresnel at normal incidence, n = 1.33). */
const FRESNEL_DOWN = 0.02;
/** Schlick's power of the Fresnel falloff. */
const FRESNEL_POWER = 5;
/** Water's refractive index. */
const WATER_INDEX = 1.33;
/**
 * The reflection of the sky at a grazing look, as Karis's fit of a rough surface's reflectance (Unreal 4, "Mobile
 * shading", 2014): the share of the sky a rough sea gives back falls at a grazing angle, where its facets face the eye.
 */
const ENV_C0 = [-1, -0.0275, -0.572, 0.022] as const;
const ENV_C1 = [1, 0.0425, 1.04, -0.04] as const;
const ENV_GRAZE = -9.28;
const ENV_A = -1.04;
const ENV_B = 1.04;
/** A reflected ray that points into the sea meets the back of the next wave: it sees the sky at least this high. */
const REFLECT_UP_LEAST = 0.03;
/**
 * The deep water's own colour: the share of the light falling on it that its body sends back up (linear RGB), clear
 * open ocean, and in a gale, stirred with fine bubbles and spray (greener, lighter, greyer).
 */
const DEEP = [0.0012, 0.0055, 0.018] as const;
const DEEP_STIRRED = [0.006, 0.016, 0.022] as const;
/** Water full of bubbles under fresh foam: a bright green-blue. */
const AERATED = [0.06, 0.16, 0.16] as const;
/** How much of the foam's bubbles colour the water under and behind it. */
const AERATED_SHARE = 0.6;
/** Light through the thin tops of crests (linear RGB per unit of sunlight), and how it falls off. */
const THROUGH = [0.01, 0.045, 0.04] as const;
/** How sharply the light through a crest gathers toward the sun's side, and toward the crest's lit edge. */
const THROUGH_TOWARD = 4;
const THROUGH_EDGE = 3;
/** The share of it that shows looking away from the sun, from the crest's body. */
const THROUGH_BODY = 0.04;
/** Foam's albedo: fresh white foam, and the grey of a thin old lace. */
const FOAM_ALBEDO = 0.75;
/** How many metres one tile of the foam's pattern covers, at its two scales: whole fractions of 256 m (seaView.ts FOAM_WRAP). */
const FOAM_TILE = 8;
const FOAM_TILE_FINE = 2.56;
/** Fresh foam shows where its bunching (0..1) beats the breakup noise, with an edge this soft. */
const FOAM_EDGE = 0.12;
/** The breakup noise at the fine scale that joins the coarse one, so a sheet of foam has holes of every size. */
const BREAKUP_FINE = 0.35;
/**
 * Where most of the breakup noise lies (it runs about this low and high), stretched to 0..1; and how much of it even the
 * thickest fresh foam beats, so a breaking crest is never one white sheet but always shows water through its holes.
 */
const BREAKUP_LOW = 0.3;
const BREAKUP_HIGH = 0.7;
const FOAM_FULLEST = 0.8;
/** How much the bubbles grain fresh foam (0 none, 1 holes right through). */
const BUBBLE_DEPTH = 0.25;
/** The foam's pattern blurs into its mean share where a pixel covers this much of the water, m (sharp to blurred), and that share. */
const FOAM_SHARP = 0.4;
const FOAM_BLURRED = 2.5;
const FOAM_FAR_SHARE = 0.5;
/** Far off, fresh foam's share of a pixel: thin at its rim and never a solid sheet, as the broken-up foam it stands for. */
const FOAM_FAR_FRESH = 0.8;
/** The stretches of crest that break: the broad noise's tile (m, a whole fraction of 1024), and the part of its range that turns them on. */
const BREAKING_TILE = 64;
const BREAKING_LOW = 0.42;
const BREAKING_HIGH = 0.58;
/** Old foam: how much of its shape is the lace's strands, the rest the soft breakup's patches. */
const LACE_SHARE = 0.45;
/** Old foam's lace: how soft its strands' edges are as it thins. */
const LACE_SOFT = 0.35;
/** The gust patches: how much darker the water under a gust's heart is, on top of its roughness. */
const GUST_DARKEN = 0.1;
/** Where the gust map ends: its last tenth fades to no gust. */
const GUST_EDGE = 0.4;
const GUST_EDGE_END = 0.5;
/** Halves and quarters of the uv square (named for the guard). */
const HALF = 0.5;
/** Seeds: the foam's pattern (the same on every sea). */
const FOAM_SEED = 1805;
const RIPPLE_SEED = 1806;
/** The haze's colour: the sky just above the horizon in the direction looked, blurred. */
const HAZE_UP = 0.02;
const HAZE_BLUR = 0.6;
/** Snell's window from below: where it ends, as the cosine of the angle off the normal the sky still shows through. */
const WINDOW_EDGE = 0.66;
const WINDOW_SOFT = 0.12;
/** Under water the light is lost per metre (red first) and the murk thickens per metre. */
const ABSORB = [0.25, 0.055, 0.035] as const;
const MURK_THICK = 0.04;
/** The murk's colour: the share of the day's light the water scatters back toward the eye (linear RGB). */
const MURK = [0.004, 0.035, 0.045] as const;
/** The deep below is darker than the water toward the surface: its share of the murk straight down. */
const MURK_DOWN = 0.15;

/** Samples the foam texture takes along a pixel's long side, seen at a grazing angle. */
const FOAM_ANISOTROPY = 8;
/** The microfacet reflection's 4 · n·l · n·v (n·l cancels against the light's own). */
const BRDF_DENOMINATOR = 4;
/** Make a three vector from a constant's numbers. */
const v3 = (c: readonly number[]) => vec3(c[0], c[1], c[2]);

/** A seeded pattern (the foam's, the ripples') as a tiling, mipmapped texture. */
function tilingTexture(data: Uint8Array, texels: number, format: typeof RGFormat | typeof RGBAFormat): Texture {
  const t = new DataTexture(data, texels, texels, format);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter;
  t.minFilter = LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = FOAM_ANISOTROPY;
  t.needsUpdate = true;
  return t;
}

/** The gust map as a texture, written anew each frame by SeaView. */
function gustTexture(): DataTexture {
  const t = new DataTexture(gustMap().data, GUST_TEXELS, GUST_TEXELS, RGFormat);
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.magFilter = t.minFilter = LinearFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** What the sea's shader reads, written each frame by SeaView. */
export const SEA_INPUTS = {
  /**
   * Per tile: corner x and z from the sea's origin, side, level (seaGrid.ts `seaTiles`). The sea's mesh carries it
   * as its geometry's `tile` attribute: three uploads a geometry's attributes when they change, not a node's.
   */
  tiles: new InstancedBufferAttribute(new Float32Array(SEA_MAX_TILES * SEA_TILE_STRIDE), SEA_TILE_STRIDE),
  /** Per wave: kx, kz, phase now at the origin, height; and reach, |k|, omega (seaWaves.ts). */
  wave: uniformArray(Array.from({ length: SEA_DRAWN_WAVES }, () => new Vector4()), 'vec4'),
  more: uniformArray(Array.from({ length: SEA_DRAWN_WAVES }, () => new Vector4()), 'vec4'),
  count: uniform(0, 'int'),
  lift: uniform(0),
  /** Per fine wave, long to short: kx, kz, phase now at the origin, height; and |k|, the slope of it and all shorter, gust share (seaFine.ts). */
  fine: uniformArray(Array.from({ length: SEA_FINE_DRAWN }, () => new Vector4()), 'vec4'),
  fineMore: uniformArray(Array.from({ length: SEA_FINE_DRAWN }, () => new Vector4()), 'vec4'),
  fineCount: uniform(0, 'int'),
  fineExcess: uniform(0),
  /** The ripples' slope (seaRipples.ts), and where each of their two layers has drifted to (in their tiles). */
  ripples: uniform(0),
  rippleDrift: uniform(new Vector4()),
  /** The eye from the sea's origin: x and z, and its height over the calm sea (m). */
  eye: uniform(new Vector3()),
  /** Twice the deviation of the surface's height (m): a crest this high is a tall one. */
  crest: uniform(1),
  /** Foam: the stretch below which it forms and how far further down it is fully white (seaFoam.ts `foamLevels`). */
  foamLevel: uniform(-1),
  foamRamp: uniform(1),
  /** How far the foam's pattern has drifted with the wind, m (x, z). */
  foamDrift: uniform(new Vector2()),
  /** How stirred the water is by the wind, 0 clear to 1 a gale's. */
  stirred: uniform(0),
  /** The gust map (seaGusts.ts) and its corner from the sea's origin, m. */
  gusts: gustTexture(),
  gustCorner: uniform(new Vector2()),
  /** Light: the direction toward the key light (sun or moon) and its light as it falls (colour times strength). */
  sunDir: uniform(new Vector3(0, 1, 0)),
  sun: uniform(new Vector3()),
  /** The strength the scene's lit materials take the sky's environment map at (the rig's environmentIntensity). */
  skyLight: uniform(1),
  /** How thick the air's haze is, per m. */
  haze: uniform(0),
};
if (SEA_WAVE_STRIDE !== SEA_TILE_STRIDE || SEA_FINE_STRIDE !== SEA_TILE_STRIDE) throw new Error('the wave and tile lists are read as vec4');

/** The sky's environment map (SkyView), set before the warm-up builds the sea. */
let skyMap: Texture | null = null;
/** Hand the sea the light rig's environment map: its reflections and the light of the sky come from it. */
export function useSeaSky(env: Texture): void { skyMap = env; }

/** Beckmann's distribution of facets at `nh` (cosine to the half vector) for a mean square slope `m2`. */
function beckmann(nh, m2) {
  const c2 = nh.mul(nh).max(PIXEL_LEAST), t2 = float(1).sub(c2).div(c2);
  return exp(t2.div(m2).negate()).div(float(Math.PI).mul(m2).mul(c2).mul(c2));
}

/** Smith's shadowing of Beckmann facets seen at cosine `c` (Walter et al. 2007's rational fit). */
const SMITH_KNEE = 1.6;
const SMITH = [3.535, 2.181, 2.276, 2.577] as const;
function smith(c, m2) {
  const a = c.div(sqrt(m2.mul(c.mul(c).oneMinus().max(PIXEL_LEAST))));
  const fit = a.mul(SMITH[0]).add(a.mul(a).mul(SMITH[1])).div(float(1).add(a.mul(SMITH[2])).add(a.mul(a).mul(SMITH[3])));
  return select(a.lessThan(SMITH_KNEE), fit, float(1));
}

/** Schlick's Fresnel for water at cosine `c`. */
const fresnel = (c) => float(FRESNEL_DOWN).add(float(1 - FRESNEL_DOWN).mul(pow(float(1).sub(saturate(c)), FRESNEL_POWER)));

export function makeSeaMaterial(): MeshBasicNodeMaterial {
  if (!skyMap) throw new Error('the sea was built before the sky\'s environment map (useSeaSky)');
  const I = SEA_INPUTS, env = skyMap;
  const m = new MeshBasicNodeMaterial({ side: DoubleSide, fog: false });
  m.name = 'sea';

  const vCalm = varyingProperty('vec2', 'vSeaCalm'), vToEye = varyingProperty('vec3', 'vSeaToEye');
  const vFoam = varyingProperty('vec2', 'vSeaFoam'), vCrest = varyingProperty('float', 'vSeaCrest');
  m.positionNode = Fn(() => {
    // --- Where this vertex lies on the calm sea, slid onto the coarser grid by how far it is from the eye.
    const tile = attribute(SEA_TILE_ATTRIBUTE, 'vec4');
    const index = positionGeometry.xz;
    const size = tile.z, cell = size.div(SEA_TILE_CELLS);
    const plain = tile.xy.add(index.mul(cell));
    const range = size.mul(SEA_LOD_RANGE);
    const away = length(vec3(plain.x.sub(I.eye.x), I.eye.y, plain.y.sub(I.eye.z)));
    const morph = clamp(away.sub(range.mul(SEA_MORPH_START)).div(range.mul(1 - SEA_MORPH_START)), 0, 1);
    const calm = tile.xy.add(index.sub(mod(index, 2).mul(morph)).mul(cell)).toVar();
    // The grid's cell here: a wave shorter than a few of these is faded out, not drawn as noise.
    const span = cell.mul(morph.add(1));

    // --- The waves, summed as seaAt sums them (src/sim/sea/sea.ts), each weighted by how well the grid holds it;
    // and the sideways stretch now and a little while ago, for the foam.
    const h = float(0).toVar(), sx = float(0).toVar(), sz = float(0).toVar();
    const xx = float(0).toVar(), xz = float(0).toVar(), zz = float(0).toVar();
    const xx1 = float(0).toVar(), xz1 = float(0).toVar(), zz1 = float(0).toVar();
    const xx2 = float(0).toVar(), xz2 = float(0).toVar(), zz2 = float(0).toVar();
    Loop({ start: 0, end: I.count, type: 'int', condition: '<' }, ({ i }) => {
      const w = I.wave.element(i), more = I.more.element(i);
      const fade = smoothstep(SEA_WAVE_GONE_CELLS, SEA_WAVE_FULL_CELLS, float(TURN).div(more.y.mul(span)));
      const th = w.x.mul(calm.x).add(w.y.mul(calm.y)).add(w.z);
      const sn = sin(th), cs = cos(th), q = more.x.mul(fade);
      const qs = q.mul(sn);
      h.addAssign(w.w.mul(fade).mul(cs));
      sx.subAssign(w.x.mul(qs));
      sz.subAssign(w.y.mul(qs));
      const kxx = w.x.mul(w.x).mul(q), kxz = w.x.mul(w.y).mul(q), kzz = w.y.mul(w.y).mul(q);
      xx.subAssign(kxx.mul(cs)); xz.subAssign(kxz.mul(cs)); zz.subAssign(kzz.mul(cs));
      // The same water a little while ago: its phase was ahead by omega times the lag.
      const c1 = cos(th.add(more.z.mul(FOAM_LAG_NEAR))), c2 = cos(th.add(more.z.mul(FOAM_LAG_FAR)));
      xx1.subAssign(kxx.mul(c1)); xz1.subAssign(kxz.mul(c1)); zz1.subAssign(kzz.mul(c1));
      xx2.subAssign(kxx.mul(c2)); xz2.subAssign(kxz.mul(c2)); zz2.subAssign(kzz.mul(c2));
    });
    const flat = vec2(calm.x.add(sx), calm.y.add(sz));
    const fromEye = flat.sub(I.eye.xz);
    // The earth's curve (earth.ts `earthDrop`): the sea falls away from the eye to a true horizon.
    const drop = dot(fromEye, fromEye).div(2 * EARTH_RADIUS);
    const placed = vec3(flat.x, h.add(I.lift).sub(drop), flat.y);
    // How bunched the water is (1 calm, lower on a crest) and how much of that turns it white (seaFoam.ts).
    const stretch = (a, b, c) => float(1).add(a).mul(float(1).add(c)).sub(b.mul(b));
    const white = (j) => float(1).sub(smoothstep(I.foamLevel.sub(I.foamRamp.mul(HALF)), I.foamLevel.add(I.foamRamp.mul(HALF)), j));
    const fresh = white(stretch(xx, xz, zz));
    const old = max(white(stretch(xx1, xz1, zz1)).mul(FOAM_LEFT_NEAR), white(stretch(xx2, xz2, zz2)).mul(FOAM_LEFT_FAR));
    vCalm.assign(calm);
    vFoam.assign(vec2(fresh, old));
    vCrest.assign(h.div(I.crest));
    vToEye.assign(I.eye.sub(placed));
    return placed;
  })();

  // No water inside a hull (seaCut.ts): the surface's point here is the eye less the way to it.
  m.maskNode = seaCut(I.eye.sub(vToEye));

  m.colorNode = Fn(() => {
    const calm = vCalm, toEye = vToEye, far = length(toEye), V = toEye.div(far);
    // How much water one pixel covers, m: waves shorter than a few of these are roughness, not shape.
    const across_ = length(dFdx(calm)), along_ = length(dFdy(calm));
    const pixel = max(across_, along_).max(PIXEL_LEAST);
    // The pixel's narrow side: the foam's texture is filtered along the long one (anisotropic), so this sets its blur.
    const pixelNarrow = min(across_, along_);
    const full = pixel.mul(PIXEL_FULL), gone = pixel.mul(PIXEL_GONE);

    // --- The gusts here: how much they grow the fine waves, and their strength.
    const gu = calm.sub(I.gustCorner).div(GUST_SPAN);
    const inMap = float(1).sub(smoothstep(GUST_EDGE, GUST_EDGE_END, max(abs(gu.x.sub(HALF)), abs(gu.y.sub(HALF)))));
    const gust = texture(I.gusts, gu);
    const grow = float(1).add(gust.x.mul(GUST_GROWTH_TOP).mul(inMap));
    const gustStrength = gust.y.mul(GUST_STRENGTH_TOP).mul(inMap);

    // Foam's pattern here.
    const p = calm.add(I.foamDrift);
    const coarse = texture(FOAM, p.div(FOAM_TILE)), fine = texture(FOAM, p.div(FOAM_TILE_FINE));

    // --- The surface's slope and stretch per pixel: every simulated wave, then the fine ones, long to short.
    const hx = float(0).toVar(), hz = float(0).toVar(), xx = float(0).toVar(), xz = float(0).toVar(), zz = float(0).toVar();
    const rough = I.fineExcess.mul(grow).mul(grow).add(ROUGH_LEAST).toVar();
    Loop({ start: 0, end: I.count, type: 'int', condition: '<' }, ({ i }) => {
      const w = I.wave.element(i), more = I.more.element(i);
      const fade = smoothstep(gone, full, float(TURN).div(more.y));
      const th = w.x.mul(calm.x).add(w.y.mul(calm.y)).add(w.z);
      const sn = sin(th), cs = cos(th), as = w.w.mul(fade).mul(sn), qc = more.x.mul(fade).mul(cs);
      hx.subAssign(w.x.mul(as)); hz.subAssign(w.y.mul(as));
      xx.subAssign(w.x.mul(w.x).mul(qc)); xz.subAssign(w.x.mul(w.y).mul(qc)); zz.subAssign(w.y.mul(w.y).mul(qc));
      const slope = w.w.mul(more.y);
      rough.addAssign(float(1).sub(fade.mul(fade)).mul(slope).mul(slope).div(2));
    });
    Loop({ start: 0, end: I.fineCount, type: 'int', condition: '<' }, ({ i }) => {
      const w = I.fine.element(i), more = I.fineMore.element(i);
      const length_ = float(TURN).div(more.x);
      // This wave and every shorter one are below the pixel: all of them are roughness.
      If(length_.lessThan(gone), () => {
        rough.addAssign(more.y.mul(grow).mul(grow));
        Break();
      });
      const fade = smoothstep(gone, full, length_);
      const a = w.w.mul(mix(float(1), grow, more.z));
      const as = a.mul(fade).mul(sin(w.x.mul(calm.x).add(w.y.mul(calm.y)).add(w.z)));
      hx.subAssign(w.x.mul(as)); hz.subAssign(w.y.mul(as));
      const slope = a.mul(more.x);
      rough.addAssign(float(1).sub(fade.mul(fade)).mul(slope).mul(slope).div(2));
    });
    // The ripples: two layers of their texture, the second smaller and turned a quarter, each drifting its own way.
    // Its mipmaps filter what a pixel cannot show; that share of their slope is roughness instead.
    const r1 = texture(RIPPLES, p.mul(RIPPLE_REPEATS / FOAM_WRAP).add(I.rippleDrift.xy)).xy;
    const r2 = texture(RIPPLES, vec2(p.y, p.x.negate()).mul(RIPPLE_REPEATS_SECOND / FOAM_WRAP).add(I.rippleDrift.zw)).xy;
    // Each layer's slopes have a deviation of 1 along each axis; the two together √2, scaled to the ripples' slope.
    const rippleAmp = sqrt(I.ripples).mul(grow).mul(RIPPLE_RANGE);
    hx.addAssign(r1.x.sub(r2.y).mul(rippleAmp));
    hz.addAssign(r1.y.add(r2.x).sub(1).mul(rippleAmp));
    const rippleDrawn = saturate(log(float(RIPPLE_LONGEST).div(full)).div(Math.log(RIPPLE_LONGEST / RIPPLE_SHORTEST)));
    rough.addAssign(I.ripples.mul(grow).mul(grow).mul(float(1).sub(rippleDrawn)));
    const along = vec3(xx.add(1), hx, xz), across = vec3(xz, hz, zz.add(1));
    const up = normalize(cross(across, along));

    // --- The light.
    const L = I.sunDir;
    // The light a matte, level surface sends back per unit of albedo: the sun's, and the sky's through the
    // environment map at the strength lit materials take it (three: the map's colour times its intensity).
    const skyDown = pmremTexture(env, vec3(0, 1, 0), float(1)).rgb.mul(I.skyLight);
    const daylight = I.sun.mul(max(L.y, 0)).div(Math.PI).add(skyDown);
    // The water's body: what it sends back up of the light that enters it, coloured by the deep, stirred in a gale,
    // and green-white where foam has filled it with bubbles.
    // Not all of a crest breaks at once: a broad noise picks the stretches that do.
    const breaking = smoothstep(BREAKING_LOW, BREAKING_HIGH, texture(FOAM, p.div(BREAKING_TILE)).y);
    const foamNow = vFoam.x.mul(breaking), foamOld = vFoam.y.mul(breaking);
    const bubbles = saturate(foamNow.add(foamOld)).mul(AERATED_SHARE);
    const albedo = mix(mix(v3(DEEP), v3(DEEP_STIRRED), I.stirred), v3(AERATED), bubbles);
    const body = albedo.mul(daylight);

    // From above.
    const above = Fn(() => {
      const N = up, ndv = max(dot(N, V), PIXEL_LEAST);
      const roughness = sqrt(sqrt(rough));
      // The sky reflected, blurred by the roughness the pixel cannot draw; its strength by Karis's fit.
      const R0 = reflect(V.negate(), N), R = normalize(vec3(R0.x, max(R0.y, REFLECT_UP_LEAST), R0.z));
      const sky = fullSky(pmremTexture(env, R, roughness).rgb);
      const r = roughness.mul(vec4(...ENV_C0)).add(vec4(...ENV_C1));
      const a004 = min(r.x.mul(r.x), exp2(ndv.mul(ENV_GRAZE))).mul(r.x).add(r.y);
      const AB = vec2(ENV_A, ENV_B).mul(a004).add(r.zw);
      const skyShare = AB.x.mul(FRESNEL_DOWN).add(AB.y);
      // The sun's (or the moon's) glitter: Beckmann facets over the pixel's roughness.
      const H = normalize(V.add(L)), nl = dot(N, L);
      const glitter = beckmann(dot(N, H), rough).mul(fresnel(dot(V, H))).mul(smith(ndv, rough)).mul(smith(max(nl, 0), rough)).div(ndv.mul(BRDF_DENOMINATOR));
      const sunUp = smoothstep(0, PIXEL_LEAST, L.y);
      // Light through the thin tops of crests, strongest looking toward the sun through a wave's edge.
      const crest = saturate(vCrest);
      const toward = pow(saturate(dot(V.negate(), L)), THROUGH_TOWARD);
      const edge = pow(saturate(float(HALF).sub(nl.mul(HALF))), THROUGH_EDGE);
      const through = v3(THROUGH).mul(I.sun).mul(crest).mul(toward.mul(edge).add(crest.mul(THROUGH_BODY).mul(ndv)));
      const water = body.add(through).mul(float(1).sub(skyShare));
      const lit = water.add(sky.mul(skyShare)).add(I.sun.mul(glitter).mul(sunUp));
      // Gusts: their roughness darkens the water by itself (it reflects higher, darker sky); a touch more for the eye.
      const gusted = lit.sub(lit.mul(gustStrength).mul(GUST_DARKEN));
      // Foam: fresh white foam broken up by its noise, then a lace that thins as it fades.
      // Where the pattern is finer than a pixel, its share instead of its shape.
      const blurred = smoothstep(FOAM_SHARP, FOAM_BLURRED, pixelNarrow);
      const breakup = smoothstep(BREAKUP_LOW, BREAKUP_HIGH, mix(coarse.y, fine.y, BREAKUP_FINE));
      const freshShape = smoothstep(0, FOAM_EDGE, foamNow.mul(FOAM_FULLEST).sub(breakup)).mul(mix(float(1), fine.z, BUBBLE_DEPTH));
      const freshCover = mix(freshShape, foamNow.mul(foamNow).mul(FOAM_FAR_FRESH), blurred);
      const ragged = mix(coarse.y, coarse.x, LACE_SHARE);
      const oldShape = smoothstep(float(1).sub(foamOld), float(1).sub(foamOld).add(LACE_SOFT), ragged).mul(foamOld);
      const oldCover = mix(oldShape, foamOld.mul(foamOld).mul(FOAM_FAR_SHARE), blurred);
      const cover = max(freshCover, oldCover);
      const foamLit = I.sun.mul(saturate(dot(N, L))).div(Math.PI).add(skyDown).mul(FOAM_ALBEDO);
      return mix(gusted, foamLit, cover);
    })();

    // From below: the sky through Snell's window, the deep reflected around it, the murk with distance.
    const murk = v3(MURK).mul(daylight);
    const below = Fn(() => {
      const N = up.negate(), I_ = V.negate();
      const T = refract(I_, N, WATER_INDEX);
      const inWindow = smoothstep(WINDOW_EDGE - WINDOW_SOFT, WINDOW_EDGE + WINDOW_SOFT, abs(dot(V, N)));
      const sky = fullSky(pmremTexture(env, normalize(T.add(vec3(0, PIXEL_LEAST, 0))), sqrt(sqrt(rough))).rgb);
      const seen = mix(murk, sky.mul(float(1).sub(fresnel(dot(V, N).abs()))), inWindow);
      const kept = exp(v3(ABSORB).mul(far).negate());
      return mix(seen.mul(kept), murk, float(1).sub(exp(far.mul(-MURK_THICK))));
    })();

    // The air's haze toward the horizon, the colour of the sky just above it in the direction looked.
    const hazeColour = fullSky(pmremTexture(env, normalize(vec3(V.x.negate(), HAZE_UP, V.z.negate())), float(HAZE_BLUR)).rgb);
    const hazed = mix(above, hazeColour, float(1).sub(exp(far.mul(I.haze).negate())));
    return vec4(select(frontFacing, hazed, below), 1);
  })();
  return m;
}

/** The foam's pattern, made once. */
const FOAM = tilingTexture(foamPattern(FOAM_SEED), FOAM_TEXELS, RGBAFormat);
const RIPPLES = tilingTexture(ripplePattern(RIPPLE_SEED), RIPPLE_TEXELS, RGFormat);

/**
 * The deep around an eye under water (plan N1.4): a sphere about the eye in the murk's colour, lighter toward the
 * surface and dark straight down, drawn behind the sea's underside; shown only while the eye is below the surface.
 */
export function makeDeepMaterial(): MeshBasicNodeMaterial {
  const I = SEA_INPUTS;
  const m = new MeshBasicNodeMaterial({ side: BackSide, fog: false, depthWrite: false });
  m.name = 'deep';
  m.colorNode = Fn(() => {
    const d = normalize(positionLocal), L = I.sunDir;
    const light = I.sun.mul(max(L.y, 0)).div(Math.PI).add(pmremTexture(skyMap!, vec3(0, 1, 0), float(1)).rgb.mul(I.skyLight));
    return vec4(v3(MURK).mul(light).mul(mix(float(MURK_DOWN), float(1), saturate(d.y.add(1).div(2)))), 1);
  })();
  return m;
}
