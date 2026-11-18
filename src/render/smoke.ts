// @ts-nocheck -- three's TSL typings infer vector widths poorly for shader math; checked by rendering it (npm run shot).
/**
 * Powder smoke (plan N5.5): each gun's fire pours a cloud out of her port that hangs, drifts with the wind and swells
 * as it thins, until a broadside's smoke hides the other ship and the wind clears it.
 *
 * - **Poured:** a gun throws a few big puffs out along her bore (the first puff of gunfire.ts is the burst inside it);
 *   the air stops them within ten metres or so of her side, and from then on they go with the wind.
 * - **Hangs and drifts:** a puff's velocity eases to the wind's (`flown`, as the spray's), rising a little as it is
 *   warm, wandering on slow seeded eddies that grow with its age.
 * - **Swells and thins:** its radius grows as smoke spreads (with the square root of its age), its density falls as its
 *   powder is spread through it (the cloud seen through is as thick as it is wide), and it is gone after about a minute and a half.
 * - **Lit:** by the sun and the sky (soft, brighter on its sunward side, and glowing a little when the sun is behind
 *   it), and by the guns' flashes: each flash lights the smoke within some metres of it for a tenth of a second.
 * - **Hides:** the quality knob (`plenty`) is how many puffs a gun pours, never how thick the cloud is: fewer puffs are
 *   each denser, so a broadside hides the other ship at every level.
 *
 * One instanced mesh of quads facing the eye, a ring of puffs the CPU writes as guns fire (gunfire.ts's way). A puff
 * the eye is inside of is faded out, so the cloud thins around the eye instead of a quad filling the view.
 *
 * A burning ship's fires (plan N6.5, fireView.ts) pour into the same ring (`pourPuff`): black soot, and flames, small
 * puffs glowing with their own light that rise fast and burn out in a second. A puff's kind rides in its seed's
 * hundreds (`PUFF_KIND`), so one shader draws all three.
 */
import { Rng } from '@futuremagic/core';
import {
  InstancedBufferAttribute, Vector3, Vector4, type Material, type Mesh, type MeshBasicNodeMaterial, type Texture,
} from 'three/webgpu';
import {
  Loop, attribute, cameraFar, cameraNear, cameraViewMatrix, exp, float, int, ivec2, length, max, mix, modelViewMatrix, oneMinus, perspectiveDepthToViewZ,
  saturate, screenCoordinate, select, sin, smoothstep, sqrt, textureLoad, uniform, uniformArray, varyingProperty, vec2, vec3, vec4,
} from 'three/tsl';
import type { Wind } from '../sim/wind';
import type { Flash } from '../app/shotsSeen';
import { ageOf, eyeQuad, facingEye, flown, flownMaterial, flownMesh, keepFlown, passCorner } from './spray';
import { SEA_INPUTS, daylight } from './seaMaterial';

/** The puffs in the ring: a broadside of nine guns pours about 70, both ships fire every 40 s or so, and a puff lasts 90 s. */
export const MOST_PUFFS = 1024;
/**
 * Fires' puffs (fireView.ts) have rings of their own after the guns', so a burning ship never eats her gun smoke: one
 * for long lives (her soot) and one for short (flames), a puff going to the long one when it lives longer than
 * `LONG_LIFE` s. The flames' comes last, so they are drawn over the soot they burn in (puffs are drawn in their
 * order, unsorted). Each is sized so it comes round no sooner than its puffs die out with two ships each burning in
 * two places.
 */
export const FIRE_RINGS = { short: 256, long: 768 } as const;
const LONG_LIFE = 2;
/** Numbers per puff in each of its attributes. */
export const PUFF_STRIDE = 4;
/** A puff's attributes: where and when it starts (x, y, z from the origin, s); how it is thrown (m/s) and its first radius (m); its life (s), seed, density and how fast it rises (m/s). */
export const PUFF_ATTRIBUTE = 'puff';
export const PUFF_THROW = 'puffThrow';
export const PUFF_LOOK = 'puffLook';

/**
 * A gun's smoke at full plenty: how many puffs, thrown out along her bore at these speeds (m/s) with this spread
 * (m/s), their first radius (m), the air's drag on them (1/s: stopped in a few metres), how much they rise (m/s).
 */
const PUFFS = 10;
const THROW_SPEED = [6, 26] as const;
const THROW_SPREAD = 1.6;
const FIRST_RADIUS = [2, 3.5] as const;
const DRAG = 0.9;
const RISE = [0.15, 0.5] as const;
/**
 * How a puff swells: its radius grows by this many m per square root of a second; how long it lasts (s); the density
 * at its middle while it is young (at full plenty), how thin it may get before it is no more than haze.
 */
const SPREAD = 1.8;
const LIFE = [70, 100] as const;
const DENSITY = 0.85;
const THINNEST = 0.03;
/** It fades in over this long (s) and out over the last share of its life. */
const FADE_IN = 0.15;
const FADE_OUT = 0.35;
/** The eddies it wanders on: their speed (m/s per second of age, up to the most) and how slow they turn (rad/s). */
const EDDY = 0.08;
const EDDY_MOST = 1.6;
const EDDY_TURN = [0.05, 0.2] as const;
/** The eddies' three directions turn at these shares of a puff's rate; up and down it wanders this share as far; and they grow in reach until this age (s). */
const EDDY_RATES = [1, 0.7, 1.3] as const;
const EDDY_UP = 0.4;
const EDDY_GROWN = 10;
/** The smoke's albedo (grey-white powder smoke); how much of the sun's light comes through it seen against the sun. */
const ALBEDO = 0.72;
const AGAINST_SUN = 0.6;
/** Its shading: the share of its light on its shaded side, so it reads round without being lit through. */
const SHADED = 0.45;
/** Its edge: lumps of this size (shares of its radius) on its outline. */
const LUMP = 0.45;
/** Its body: full density inside this share of its radius' reach from the edge (the body ramps up from the edge this many times faster). */
const BODY_RAMP = 1.5;
/** A puff the eye comes within this many of its radii of is faded out (gone at the inner). */
const NEAR_FADE = [0.4, 1.1] as const;
/**
 * The flashes lighting the smoke: how many at once, how far their light reaches (m; it falls off as the square beyond),
 * how long it lasts (s, falling exponentially), its strength (on the light rig's scale) and colour (burning powder).
 */
export const MOST_FLASH_LIGHTS = 16;
const FLASH_REACH = 9;
const FLASH_DECAY = 0.06;
const FLASH_LIGHT = 30;
const FLASH_COLOUR = [1, 0.5, 0.18] as const;
/** After the gunfire, before the sea's underside: blended over the ship and sea. */
const SMOKE_ORDER = 12;
/** Seed of the puffs' scatter. */
const SMOKE_SEED = 1797;
/** A long six pours a smaller cloud than a carronade (a sixth of the powder but a longer bore). */
const LONG_SIX_SHARE = 0.6;
/** Drawn at half resolution (`?smoke=half`): a puff's chord in front of the scene is faded over at least this (m). */
const SOFT_LEAST = 0.5;
/** Where each number sits. */
const X = 0, Y = 1, Z = 2, W = 3;
/** A puff's kind, in its seed's hundreds (the seed's own part is under `KIND_STEP`): powder smoke, a fire's soot, a fire's flame. */
export const PUFF_KIND = { powder: 0, soot: 1, flame: 2 } as const;
const KIND_STEP = 100;
/** Soot's albedo (black smoke from burning timber, tar and canvas), and how much less it spreads than powder smoke (a fire's smoke stands in a column). */
const SOOT_ALBEDO = 0.008;
const SOOT_SPREAD = 0.45;
/** A flame's own light (on the light rig's scale), its colour young and burnt out, and how much less it spreads than smoke. */
const FLAME_LIGHT = 10;
const FLAME_YOUNG = [1, 0.5, 0.12] as const;
const FLAME_OLD = [0.75, 0.16, 0.03] as const;
const FLAME_SPREAD = 0.15;
/** Every puff starts long dead, this far back, s. */
const DEAD = -1000;
/** Every flash light starts this long ago (s): dark. */
const DARK = -100;

/** What the smoke's shader reads each frame. */
export const SMOKE_INPUTS = {
  /** The clock (s) and the wind's velocity (m/s, x and z). */
  now: uniform(0),
  wind: uniform(new Vector3()),
  /** The last flashes: where (from the origin) and when (s). */
  flashes: uniformArray(Array.from({ length: MOST_FLASH_LIGHTS }, () => new Vector4(0, 0, 0, DARK)), 'vec4'),
};

/**
 * The scene's depth at half resolution (halfSmoke.ts, `?smoke=half`), or null: the smoke drawn in the main pass at full
 * resolution, hidden by the depth buffer. Set before the smoke's kind is made, as the sea's sky is (useSeaSky).
 */
let sceneDepth: Texture | null = null;
export function useSmokeDepth(depth: Texture | null): void { sceneDepth = depth; }

/** The smoke's material: quads facing the eye, flown in the vertex stage, lit there; round, lumpy and soft in the fragment stage. */
export function makeSmokeMaterial(): MeshBasicNodeMaterial {
  const I = SMOKE_INPUTS, S = SEA_INPUTS;
  const vCorner = varyingProperty('vec2', 'vPuffCorner'), vDensity = varyingProperty('float', 'vPuffDensity');
  const vDeep = varyingProperty('vec2', 'vPuffDeep');
  const depth = sceneDepth;
  const vLight = varyingProperty('vec3', 'vPuffLight'), vGlow = varyingProperty('float', 'vPuffGlow'), vSunSide = varyingProperty('vec3', 'vPuffSunSide'), vSeed = varyingProperty('float', 'vPuffSeed');
  const vAlbedo = varyingProperty('float', 'vPuffAlbedo');
  return flownMaterial('smoke', true, () => {
    const p = attribute(PUFF_ATTRIBUTE, 'vec4'), th = attribute(PUFF_THROW, 'vec4'), look = attribute(PUFF_LOOK, 'vec4');
    const age = ageOf(I.now, p), life = look.x, seed = look.y;
    // Its kind (fireView.ts): powder smoke, soot, or a flame.
    const kind = seed.div(KIND_STEP).floor(), soot = kind.equal(PUFF_KIND.soot), flame = kind.greaterThanEqual(PUFF_KIND.flame);
    const alive = age.greaterThanEqual(0).and(age.lessThan(life));
    const t = max(age, 0);
    // Thrown out, stopped by the air, then with the wind, rising; wandering on its eddies.
    const centre = flown(p.xyz, th.xyz, vec3(I.wind.x, look.w, I.wind.z), float(DRAG), t).toVar();
    const turn = float(EDDY_TURN[0]).add(seed.fract().mul(EDDY_TURN[1] - EDDY_TURN[0]));
    const eddy = t.mul(EDDY).min(EDDY_MOST);
    const wave = (k: number) => sin(t.mul(turn).mul(EDDY_RATES[k]!).add(seed.mul(k + 1)));
    centre.addAssign(vec3(wave(0), wave(1).mul(EDDY_UP), wave(2)).mul(eddy).mul(t.min(EDDY_GROWN)));
    const radius = th.w.add(sqrt(t).mul(SPREAD).mul(select(flame, float(FLAME_SPREAD), select(soot, float(SOOT_SPREAD), float(1)))));
    // Its powder spread over its size; faded in, out at its end, and out where the eye is inside it.
    const spread = th.w.div(radius);
    const fade = smoothstep(float(0), float(FADE_IN), t).mul(oneMinus(smoothstep(life.mul(1 - FADE_OUT), life, t)));
    const eye = modelViewMatrix.mul(vec4(centre, 1)).xyz;
    const near = smoothstep(radius.mul(NEAR_FADE[0]), radius.mul(NEAR_FADE[1]), length(eye));
    vDensity.assign(max(look.z.mul(spread), select(look.z.greaterThan(0), float(THINNEST), float(0))).mul(fade).mul(near));
    // The day's light on it (the sun through a cloud is brighter seen toward the sun), and the flashes'.
    const toEye = eye.negate().normalize(), sunView = cameraViewMatrix.mul(vec4(S.sunDir, 0)).xyz;
    const against = saturate(sunView.dot(toEye).negate());
    vSunSide.assign(sunView);
    const lit = vec3(0).toVar();
    Loop({ start: int(0), end: int(MOST_FLASH_LIGHTS) }, ({ i }) => {
      const f = I.flashes.element(i), since = ageOf(I.now, f);
      const d = length(centre.sub(f.xyz)).div(FLASH_REACH);
      lit.addAssign(select(since.greaterThanEqual(0), exp(since.div(-FLASH_DECAY)), float(0)).div(d.mul(d).add(1)));
    });
    vGlow.assign(against.mul(against).mul(AGAINST_SUN).add(1));
    // A flame burns with its own light, yellow young and red as it dies.
    const burnt = saturate(t.div(life));
    const own = select(flame, mix(vec3(...FLAME_YOUNG), vec3(...FLAME_OLD), burnt).mul(oneMinus(burnt).mul(FLAME_LIGHT)), vec3(0));
    vLight.assign(vec3(...FLASH_COLOUR).mul(lit).mul(FLASH_LIGHT).add(own));
    vAlbedo.assign(select(flame, float(0), select(soot, float(SOOT_ALBEDO), float(ALBEDO))));
    passCorner(vCorner);
    vSeed.assign(seed);
    vDeep.assign(vec2(eye.z.negate(), radius));
    return facingEye(centre, select(alive, radius, float(0)));
  }, () => {
    // Lumps on its outline: three soft lobes at seeded places, and round inside them.
    const c = vCorner, s = vSeed;
    const lobe = (k: number) => {
      const o = vec2(sin(s.mul(k + 1).add(k)), sin(s.mul(k + 2).add(k * 2))).mul(1 - LUMP);
      return saturate(oneMinus(length(c.sub(o)).div(LUMP)));
    };
    const body = saturate(oneMinus(length(c))).mul(BODY_RAMP).min(1);
    const shape = max(body.mul(body), max(lobe(0), max(lobe(1), lobe(2))).mul(body.sqrt()));
    // Rounded: a normal as if it were a ball facing the eye, lit on its sunward side.
    const n = vec3(c, sqrt(saturate(oneMinus(c.dot(c)))));
    // At half resolution there is no depth buffer: the share of the ball's chord through this pixel in front of the
    // scene's nearest surface shows, so the smoke thins softly where it meets the hull or the sea.
    const seen = depth ? (() => {
      const scene = perspectiveDepthToViewZ(textureLoad(depth, ivec2(screenCoordinate.xy)).x, cameraNear, cameraFar).negate();
      const chord = vDeep.y.mul(n.z).mul(2);
      return saturate(scene.sub(vDeep.x.sub(vDeep.y.mul(n.z))).div(max(chord, SOFT_LEAST)));
    })() : float(1);
    const a = saturate(vDensity.mul(shape).mul(seen));
    const shade = mix(float(SHADED), float(1), saturate(n.dot(vSunSide).mul(1 / 2).add(1 / 2)));
    // The day's light is read here: the sky's map is sampled in the fragment stage only.
    return vec4(daylight().mul(vAlbedo).mul(vGlow).add(vLight).mul(shade).mul(a), a);
  });
}

/**
 * How many puffs a gun pours at the quality level's `plenty` (a share, 1 the most), and how dense each is young:
 * fewer puffs are each as dense as so many together would be (seen through, `1 − (1 − density)^puffs` is the same at
 * every level), so the knob is density, never whether the smoke hides.
 */
export function puffsPoured(plenty: number): { puffs: number; density: number } {
  const puffs = Math.max(1, Math.round(PUFFS * Math.min(1, plenty)));
  return { puffs, density: 1 - (1 - DENSITY) ** (PUFFS / puffs) };
}

/** A fire's puff (`SmokeView.pourPuff`): its kind, where (world) and when, how thrown, how big, how long, how dense, how fast it rises, its scatter. */
export interface FirePuff {
  readonly kind: 'soot' | 'flame';
  readonly at: readonly [number, number, number];
  readonly t: number;
  readonly throwing: readonly [number, number, number];
  readonly radius: number;
  readonly life: number;
  readonly density: number;
  readonly rise: number;
  readonly seed: number;
}

/** Every puff drawn: the guns' ring and the fires'. */
const ALL_PUFFS = MOST_PUFFS + FIRE_RINGS.short + FIRE_RINGS.long;

/** Powder smoke drawn: the ring of puffs, from the sea's origin. */
export class SmokeView {
  readonly mesh: Mesh;
  private readonly origin = new Vector3();
  private readonly puff: InstancedBufferAttribute;
  private readonly throwOf: InstancedBufferAttribute;
  private readonly look: InstancedBufferAttribute;
  private next = 0;
  /** The next puff of each fire ring (counted from its own start). */
  private nextShort = 0;
  private nextLong = 0;
  private lights = 0;
  private readonly rng = new Rng(SMOKE_SEED);
  private written = false;
  /** The share of puffs a gun pours (the quality level, quality.ts `gunfireShare`): each is denser for fewer. */
  plenty = 1;

  constructor(material: Material) {
    const g = eyeQuad();
    [this.puff, this.throwOf, this.look] = [PUFF_ATTRIBUTE, PUFF_THROW, PUFF_LOOK].map((n) => {
      const a = new InstancedBufferAttribute(new Float32Array(ALL_PUFFS * PUFF_STRIDE), PUFF_STRIDE);
      g.setAttribute(n, a);
      return a;
    }) as [InstancedBufferAttribute, InstancedBufferAttribute, InstancedBufferAttribute];
    const d = this.puff.array as Float32Array, l = this.look.array as Float32Array;
    for (let i = 0; i < ALL_PUFFS; i++) { d[i * PUFF_STRIDE + W] = DEAD; l[i * PUFF_STRIDE + X] = 1; }
    this.mesh = flownMesh(g, material, 'smoke', ALL_PUFFS, SMOKE_ORDER);
  }

  /** Once a frame: the clock `t`, the wind and the sea's `origin`; the flashes whose time has come pour their smoke and light it. */
  showSmoke(t: number, wind: Wind, origin: Vector3, flashes: readonly Flash[], longSix: (f: Flash) => boolean): void {
    const [dx, dz] = keepFlown(SMOKE_INPUTS, t, wind, this.origin, origin, [this.puff], [this.mesh]);
    if (dx !== 0 || dz !== 0) for (const f of SMOKE_INPUTS.flashes.array as Vector4[]) { f.x -= dx; f.z -= dz; }
    for (const f of flashes) this.pour(f, longSix(f) ? LONG_SIX_SHARE : 1);
    if (this.written) { this.puff.needsUpdate = this.throwOf.needsUpdate = this.look.needsUpdate = true; this.written = false; }
  }

  /**
   * One puff of a fire (fireView.ts): soot or a flame, at `at` (world) at time `t`, thrown at `throwing` (m/s), its
   * first radius (m), life (s), density young and how fast it rises (m/s); `seed` (0..KIND_STEP) its own scatter.
   */
  pourPuff(p: FirePuff): void {
    const long = p.life > LONG_LIFE, o = this.origin;
    const k = (long ? MOST_PUFFS + this.nextLong : MOST_PUFFS + FIRE_RINGS.long + this.nextShort) * PUFF_STRIDE;
    if (long) this.nextLong = (this.nextLong + 1) % FIRE_RINGS.long;
    else this.nextShort = (this.nextShort + 1) % FIRE_RINGS.short;
    const pd = this.puff.array as Float32Array, pt = this.throwOf.array as Float32Array, pl = this.look.array as Float32Array;
    pd[k + X] = p.at[X] - o.x; pd[k + Y] = p.at[Y] - o.y; pd[k + Z] = p.at[Z] - o.z; pd[k + W] = p.t;
    pt[k + X] = p.throwing[X]; pt[k + Y] = p.throwing[Y]; pt[k + Z] = p.throwing[Z]; pt[k + W] = p.radius;
    pl[k + X] = p.life; pl[k + Y] = PUFF_KIND[p.kind] * KIND_STEP + (p.seed % KIND_STEP); pl[k + Z] = p.density; pl[k + W] = p.rise;
    this.written = true;
  }

  /** A gun's smoke poured out of her port along her bore, and her flash's light on it; `power`: her share of a carronade's. */
  private pour(f: Flash, power: number): void {
    const r = this.rng, [dx, dy, dz] = f.dir, o = this.origin;
    const light = (SMOKE_INPUTS.flashes.array as Vector4[])[this.lights]!;
    this.lights = (this.lights + 1) % MOST_FLASH_LIGHTS;
    light.set(f.at[X] - o.x, f.at[Y] - o.y, f.at[Z] - o.z, f.t);
    const { puffs: n, density } = puffsPoured(this.plenty);
    const pd = this.puff.array as Float32Array, pt = this.throwOf.array as Float32Array, pl = this.look.array as Float32Array;
    for (let q = 0; q < n; q++) {
      const k = this.next * PUFF_STRIDE, speed = r.range(THROW_SPEED[0], THROW_SPEED[1]) * power;
      this.next = (this.next + 1) % MOST_PUFFS;
      pd[k + X] = f.at[X] - o.x; pd[k + Y] = f.at[Y] - o.y; pd[k + Z] = f.at[Z] - o.z; pd[k + W] = f.t;
      pt[k + X] = dx * speed + r.gaussian(0, THROW_SPREAD); pt[k + Y] = dy * speed + r.gaussian(0, THROW_SPREAD); pt[k + Z] = dz * speed + r.gaussian(0, THROW_SPREAD);
      pt[k + W] = r.range(FIRST_RADIUS[0], FIRST_RADIUS[1]) * Math.sqrt(power);
      pl[k + X] = r.range(LIFE[0], LIFE[1]); pl[k + Y] = r.range(0, 2 * Math.PI); pl[k + Z] = density; pl[k + W] = r.range(RISE[0], RISE[1]);
    }
    this.written = true;
  }
}
