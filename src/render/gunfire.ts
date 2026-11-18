// @ts-nocheck -- three's TSL typings infer vector widths poorly for shader math; checked by rendering it (npm run shot).
/**
 * Gunfire drawn (plan N5.4a): what app/shotsSeen.ts hands over each frame.
 *
 * - **The flash** at a gun's muzzle the instant she fires: a burst of fire out along her bore, gone in a tenth of a
 *   second, added to the light (it is fire, not lit by the day).
 * - **The first puff** with it: grey-white smoke thrown out of the port along the bore, slowed fast by the air and
 *   carried off by the wind as it swells and thins (the smoke that hangs and drifts is N5.5's).
 * - **Splinters** where shot strikes a ship: a flash of dust and a spray of oak shards flung out from where it struck,
 *   falling.
 * - **The ball** in flight: a dark streak along the stretch of its path the eye smears in a frame, never thinner than a
 *   pixel and faded by how much of the pixel it covers (as her ropes are).
 *
 * The flash, puffs and splinters are one mesh of quads facing the eye, a ring of starts the CPU writes as they come and
 * the vertex stage flies (as the spray, spray.ts: drag toward the wind, gravity), with premultiplied alpha so fire
 * adds and smoke covers in one draw. The balls are a second mesh the CPU writes each frame (a few dozen at most).
 */
import { Rng } from '@futuremagic/core';
import {
  BufferGeometry, CustomBlending, InstancedBufferAttribute, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor, Vector3,
  type Material,
} from 'three/webgpu';
import {
  Fn, abs, attribute, cameraProjectionMatrix, cross, float, length, max, mix, modelViewMatrix, normalize, positionGeometry, saturate,
  select, smoothstep, uniform, varyingProperty, vec3, vec4,
} from 'three/tsl';
import { GRAVITY } from '../sim/units';
import type { Wind } from '../sim/wind';
import type { BallSeen, Flash, Splash, Strike } from '../app/shotsSeen';
import { eyeQuad, facingEye, flown, shiftStarts, type SprayView } from './spray';
import type { WakeMap } from './wakeMap';
import { daylight } from './seaMaterial';
import { SHIP_INPUTS } from './ship/shipMaterials';

/** The bits in the ring: a broadside of nine guns throws about 250, a hit about 30, and none lives past 3 s. */
export const MOST_BITS = 2048;
/** The balls drawn at once: a broadside of grape is 81. */
export const MOST_BALLS = 256;
/** Numbers per bit in each of its attributes, and per ball. */
export const BIT_STRIDE = 4;
/** A bit's attributes: where and when it starts (x, y, z from the origin, s); how it is flung (m/s) and its size (m); what it is (kind, life s, drag 1/s, how hard gravity pulls: a share). */
export const BIT_ATTRIBUTE = 'bit';
export const BIT_FLING = 'bitFling';
export const BIT_LOOK = 'bitLook';
/** A ball's attributes: its streak's back end and diameter (m), its front end and 1 while it flies. */
export const BALL_FROM = 'ballFrom';
export const BALL_TO = 'ballTo';

/** What a bit is. */
const FLASH = 0, PUFF = 1, SHARD = 2, DUST = 3;

/**
 * The flash: its size at the muzzle (m, a carronade's; a long six's a share of it), how far along the bore its fire
 * reaches (its quads strung out so far, m), how many quads, how long it lasts (s), how bright (on the light rig's scale,
 * where the noon sun on white is about 1) and its colour (linear RGB of burning powder, about 1600 K).
 */
const FLASH_SIZE = 1.6;
const FLASH_REACH = 3;
const FLASH_QUADS = 4;
const FLASH_LIFE = 0.12;
const FLASH_GLOW = 9;
const FLASH_COLOUR = [1, 0.45, 0.12] as const;
/** A long six's flash and puff are smaller than a carronade's: a sixth of the powder. */
const LONG_SIX_SHARE = 0.55;
/**
 * The puff: quads thrown out of the port along the bore (speed m/s, spread m/s), their size (m) at the start, how they
 * swell (times their size after a second), how long they last (s), the air's drag on them (1/s), how much they rise
 * (gravity's share, negative: warm smoke lifts), how dense, and the smoke's albedo.
 */
const PUFF_QUADS = 14;
const PUFF_SPEED = [8, 40] as const;
const PUFF_SPREAD = 2.5;
const PUFF_SIZE = [0.6, 1.4] as const;
const PUFF_SWELL = 3.2;
const PUFF_LIFE = [2.2, 3] as const;
const PUFF_DRAG = 2.4;
const PUFF_FALL = -0.02;
const PUFF_DENSITY = 0.7;
const SMOKE_ALBEDO = 0.62;
/** Splinters: how many shards and dust puffs a strike throws, their speed out (m/s) and spread, sizes (m), lives (s), drag (1/s), and their albedo (oak, dust). */
const SHARDS = 18;
const SHARD_SPEED = [6, 22] as const;
const SHARD_SIZE = [0.04, 0.14] as const;
const SHARD_LIFE = [1, 1.8] as const;
const SHARD_DRAG = 0.4;
const DUSTS = 6;
const DUST_SPEED = 4;
const DUST_SIZE = [0.4, 0.9] as const;
const DUST_LIFE = [0.6, 1.1] as const;
const DUST_DRAG = 3;
const DUST_SWELL = 2.5;
const SHARD_ALBEDO = [0.2, 0.13, 0.07] as const;
const DUST_ALBEDO = [0.42, 0.36, 0.28] as const;
/** A shard's edge is hard; a puff's soft. */
const SHARD_EDGE = 0.25;
/** The last share of a bit's life it fades over. */
const FADE_OUT = 0.6;
/** After the spray, before the sea's underside: drawn over the ship and the sea, sorted by nothing (premultiplied). */
const GUNFIRE_ORDER = 11;
/** A ball is drawn this much darker than the day lights it (black iron), and never thinner than this many pixels. */
const BALL_ALBEDO = 0.04;
const BALL_PIXELS = 1.4;
/** A ball's white water on the sea at first, m of radius per m of its diameter; a skip's share of a plunge's. */
const PATCH_PER_DIAMETER = 8;
const PATCH_SKIP = 0.7;
/** A length this small is none, m. */
const TINY = 1e-6;
/** Seed of the bits' scatter. */
const GUNFIRE_SEED = 1798;
/** Where each number sits. */
const X = 0, Y = 1, Z = 2, W = 3;
/** Every bit starts long dead, this far back, s. */
const DEAD = -100;

/** What the gunfire's shaders read each frame. */
export const GUNFIRE_INPUTS = {
  /** The clock (s) and the wind's velocity (m/s, x and z). */
  now: uniform(0),
  wind: uniform(new Vector3()),
};

/** Premultiplied alpha: fire adds (alpha 0), smoke and shards cover. */
function premultiplied(m: MeshBasicNodeMaterial): MeshBasicNodeMaterial {
  m.transparent = true;
  m.depthWrite = false;
  m.fog = false;
  m.blending = CustomBlending;
  m.blendSrc = OneFactor;
  m.blendDst = OneMinusSrcAlphaFactor;
  // The colours are premultiplied already: three's own premultiplying (`premultipliedAlpha`) would black out the fire.
  m.premultipliedAlpha = false;
  return m;
}

/** The bits' material: quads facing the eye, flown in the vertex stage; fire, smoke, dust or a shard by their kind. */
export function makeGunfireMaterial(): MeshBasicNodeMaterial {
  const I = GUNFIRE_INPUTS;
  const m = premultiplied(new MeshBasicNodeMaterial());
  m.name = 'gunfire';
  const vCorner = varyingProperty('vec2', 'vBitCorner'), vAge = varyingProperty('float', 'vBitAge'), vKind = varyingProperty('float', 'vBitKind');
  m.vertexNode = Fn(() => {
    const bit = attribute(BIT_ATTRIBUTE, 'vec4'), fling = attribute(BIT_FLING, 'vec4'), look = attribute(BIT_LOOK, 'vec4');
    const age = I.now.sub(bit.w), life = look.y, k = look.z;
    const alive = select(age.greaterThanEqual(0).and(age.lessThan(life)), float(1), float(0));
    // dv/dt = k·(wind − v) − fall·g: v drifts to u = wind − fall·g/k; x = x0 + u·t + (v0 − u)·(1 − e^(−k·t))/k.
    const t = max(age, 0), u = vec3(I.wind.x, look.w.mul(-GRAVITY).div(k), I.wind.z);
    const centre = flown(bit.xyz, fling.xyz, u, k, t);
    const swell = select(look.x.equal(PUFF), float(PUFF_SWELL - 1), select(look.x.equal(DUST), float(DUST_SWELL - 1), select(look.x.equal(FLASH), float(1), float(0))));
    const size = fling.w.mul(swell.mul(t).add(1));
    vCorner.assign(positionGeometry.xy);
    vAge.assign(age.div(life));
    vKind.assign(look.x);
    return facingEye(centre, size.mul(alive));
  })();
  m.colorNode = Fn(() => {
    const r = length(vCorner), fade = float(1).sub(smoothstep(float(1 - FADE_OUT), float(1), vAge));
    const soft = saturate(float(1).sub(r)).pow(2);
    const hard = float(1).sub(smoothstep(float(1 - SHARD_EDGE), float(1), r));
    const day = daylight();
    // Fire: bright, added (alpha 0), dying fast.
    const left = saturate(float(1).sub(vAge)), fire = vec3(...FLASH_COLOUR).mul(FLASH_GLOW).mul(soft).mul(left).mul(left);
    const smoke = soft.mul(PUFF_DENSITY).mul(fade);
    const dust = soft.mul(fade).mul(1 / 2);
    const shard = hard.mul(fade);
    // The kind, rounded: a varying need not come through exactly.
    const kind = vKind.add(1 / 2).floor(), isFire = kind.equal(FLASH), isPuff = kind.equal(PUFF), isShard = kind.equal(SHARD);
    const a = select(isFire, float(0), select(isPuff, smoke, select(isShard, shard, dust)));
    const albedo = select(isPuff, vec3(SMOKE_ALBEDO), select(isShard, vec3(...SHARD_ALBEDO), vec3(...DUST_ALBEDO)));
    return vec4(select(isFire, fire, day.mul(albedo).mul(a)), a);
  })();
  return m;
}

/** The balls' material: each a streak from its back end to its front, facing the eye, at least a pixel wide. */
export function makeBallMaterial(): MeshBasicNodeMaterial {
  const m = premultiplied(new MeshBasicNodeMaterial());
  m.name = 'shot in flight';
  const vCover = varyingProperty('float', 'vBallCover'), vAcross = varyingProperty('float', 'vBallAcross');
  m.vertexNode = Fn(() => {
    const a = attribute(BALL_FROM, 'vec4'), b = attribute(BALL_TO, 'vec4');
    // In the view's space (the eye at its origin): along the streak by the corner's x (−1 back, +1 front), across it
    // by y, and out a radius past each end.
    const pa = modelViewMatrix.mul(vec4(a.xyz, 1)).xyz, pb = modelViewMatrix.mul(vec4(b.xyz, 1)).xyz;
    const p = mix(pa, pb, positionGeometry.x.mul(1 / 2).add(1 / 2)), dir = pb.sub(pa), long = length(dir).greaterThan(TINY);
    const ahead = select(long, normalize(dir), vec3(0, 1, 0));
    const side = normalize(cross(ahead, normalize(p)).add(vec3(0, TINY, 0)));
    const least = length(p).mul(SHIP_INPUTS.pixel).mul(BALL_PIXELS / 2), radius = a.w.div(2), w = max(radius, least);
    vCover.assign(radius.div(w).mul(b.w));
    vAcross.assign(positionGeometry.y);
    return cameraProjectionMatrix.mul(vec4(p.add(side.mul(w).mul(positionGeometry.y)).add(ahead.mul(w).mul(positionGeometry.x)), 1));
  })();
  m.colorNode = Fn(() => {
    const a = saturate(float(1).sub(abs(vAcross))).mul(2).min(1).mul(vCover);
    return vec4(daylight().mul(BALL_ALBEDO).mul(a), a);
  })();
  return m;
}

/** A unit quad's geometry with instanced attributes of `stride` numbers each. */
function quads(count: number, names: readonly string[]): { geometry: BufferGeometry; attributes: InstancedBufferAttribute[] } {
  const g = eyeQuad();
  const attributes = names.map((n) => {
    const a = new InstancedBufferAttribute(new Float32Array(count * BIT_STRIDE), BIT_STRIDE);
    g.setAttribute(n, a);
    return a;
  });
  return { geometry: g, attributes };
}

/** Gunfire drawn: the bits' ring and the balls, both meshes from the sea's origin. */
export class GunfireView {
  readonly bits: Mesh;
  readonly balls: Mesh;
  private readonly origin = new Vector3();
  private readonly bit: InstancedBufferAttribute;
  private readonly fling: InstancedBufferAttribute;
  private readonly look: InstancedBufferAttribute;
  private readonly ballFrom: InstancedBufferAttribute;
  private readonly ballTo: InstancedBufferAttribute;
  private next = 0;
  private readonly rng = new Rng(GUNFIRE_SEED);
  private written = false;
  /** The share of puffs and splinters thrown (the quality level, quality.ts `gunfireShare`). */
  plenty = 1;

  constructor(bitMaterial: Material, ballMaterial: Material) {
    const b = quads(MOST_BITS, [BIT_ATTRIBUTE, BIT_FLING, BIT_LOOK]);
    [this.bit, this.fling, this.look] = b.attributes as [InstancedBufferAttribute, InstancedBufferAttribute, InstancedBufferAttribute];
    const d = this.bit.array as Float32Array, l = this.look.array as Float32Array;
    for (let i = 0; i < MOST_BITS; i++) { d[i * BIT_STRIDE + W] = DEAD; l[i * BIT_STRIDE + Y] = 1; l[i * BIT_STRIDE + Z] = 1; }
    this.bits = this.quadMesh(b.geometry, bitMaterial, 'gunfire', MOST_BITS);
    const s = quads(MOST_BALLS, [BALL_FROM, BALL_TO]);
    [this.ballFrom, this.ballTo] = s.attributes as [InstancedBufferAttribute, InstancedBufferAttribute];
    this.balls = this.quadMesh(s.geometry, ballMaterial, 'shot in flight', 1);
  }

  private quadMesh(g: BufferGeometry, material: Material, name: string, count: number): Mesh {
    const m = new Mesh(g, material);
    m.name = name;
    m.count = count;
    m.frustumCulled = false;
    m.renderOrder = GUNFIRE_ORDER;
    return m;
  }

  /**
   * Once a frame: the clock `t`, the wind, the sea's `origin`; the guns' flashes and the strikes whose time has come
   * (strikes as world points: `struck`), and the balls flying now.
   */
  showGunfire(t: number, wind: Wind, origin: Vector3, flashes: readonly Flash[], strikes: readonly { readonly s: Strike; readonly at: Vector3; readonly out: Vector3 }[], balls: readonly BallSeen[], longSix: (f: Flash) => boolean): void {
    if (!origin.equals(this.origin)) this.follow(origin);
    this.bits.position.copy(this.origin);
    this.balls.position.copy(this.origin);
    GUNFIRE_INPUTS.now.value = t;
    GUNFIRE_INPUTS.wind.value.set(wind.x * wind.speed, 0, wind.z * wind.speed);
    for (const f of flashes) this.muzzleBurst(f, longSix(f) ? LONG_SIX_SHARE : 1);
    for (const s of strikes) this.splinter(s.s.t, s.at, s.out);
    if (this.written) { this.bit.needsUpdate = this.fling.needsUpdate = this.look.needsUpdate = true; this.written = false; }
    const n = Math.min(MOST_BALLS, balls.length), a = this.ballFrom.array as Float32Array, b = this.ballTo.array as Float32Array, o = this.origin;
    for (let i = 0; i < n; i++) {
      const s = balls[i]!, k = i * BIT_STRIDE;
      a[k + X] = s.from[X] - o.x; a[k + Y] = s.from[Y] - o.y; a[k + Z] = s.from[Z] - o.z; a[k + W] = s.size;
      b[k + X] = s.to[X] - o.x; b[k + Y] = s.to[Y] - o.y; b[k + Z] = s.to[Z] - o.z; b[k + W] = 1;
    }
    // None flying: one ball left drawn, gone (its cover 0), so the mesh keeps its draw and shader.
    if (n === 0) b[W] = 0;
    this.balls.count = Math.max(1, n);
    this.ballFrom.needsUpdate = true; this.ballTo.needsUpdate = true;
  }

  /** One bit into the ring. */
  private throwBit(kind: number, at: readonly number[], v: readonly number[], size: number, t: number, life: number, drag: number, fall: number): void {
    const k = this.next * BIT_STRIDE, d = this.bit.array as Float32Array, f = this.fling.array as Float32Array, l = this.look.array as Float32Array;
    this.next = (this.next + 1) % MOST_BITS;
    d[k + X] = at[X]! - this.origin.x; d[k + Y] = at[Y]! - this.origin.y; d[k + Z] = at[Z]! - this.origin.z; d[k + W] = t;
    f[k + X] = v[X]!; f[k + Y] = v[Y]!; f[k + Z] = v[Z]!; f[k + W] = size;
    l[k + X] = kind; l[k + Y] = life; l[k + Z] = drag; l[k + W] = fall;
    this.written = true;
  }

  /** A gun's flash and first puff at her muzzle, along her bore; `power`: her share of a carronade's. The puff first: the ring draws in order, so the fire shows through its own smoke. */
  private muzzleBurst(f: Flash, power: number): void {
    const r = this.rng, [dx, dy, dz] = f.dir;
    const n = Math.max(1, Math.round(PUFF_QUADS * this.plenty));
    for (let q = 0; q < n; q++) {
      const speed = r.range(PUFF_SPEED[0], PUFF_SPEED[1]) * power;
      const v = [dx * speed + r.gaussian(0, PUFF_SPREAD), dy * speed + r.gaussian(0, PUFF_SPREAD), dz * speed + r.gaussian(0, PUFF_SPREAD)];
      this.throwBit(PUFF, f.at, v, r.range(PUFF_SIZE[0], PUFF_SIZE[1]) * power / this.plenty ** (1 / 2), f.t, r.range(PUFF_LIFE[0], PUFF_LIFE[1]), PUFF_DRAG, PUFF_FALL);
    }
    for (let q = 0; q < FLASH_QUADS; q++) {
      const along = (FLASH_REACH * power * q) / FLASH_QUADS;
      this.throwBit(FLASH, [f.at[X] + dx * along, f.at[Y] + dy * along, f.at[Z] + dz * along], [0, 0, 0], FLASH_SIZE * power * (1 - q / (FLASH_QUADS * 2)), f.t, FLASH_LIFE, 1, 0);
    }
  }

  /** Shot striking at `at` (the world) at `t`: dust and oak shards flung out of her along `out` (a unit direction off her side). */
  private splinter(t: number, at: Vector3, out: Vector3): void {
    const r = this.rng, p = [at.x, at.y, at.z];
    const n = Math.max(1, Math.round(SHARDS * this.plenty));
    for (let i = 0; i < n; i++) {
      const s = r.range(SHARD_SPEED[0], SHARD_SPEED[1]);
      const v = [out.x * s + r.gaussian(0, s / 2), out.y * s + r.gaussian(0, s / 2) + s / 2, out.z * s + r.gaussian(0, s / 2)];
      this.throwBit(SHARD, p, v, r.range(SHARD_SIZE[0], SHARD_SIZE[1]), t, r.range(SHARD_LIFE[0], SHARD_LIFE[1]), SHARD_DRAG, 1);
    }
    for (let i = 0; i < DUSTS; i++) {
      const v = [out.x * DUST_SPEED + r.gaussian(0, DUST_SPEED / 2), out.y * DUST_SPEED + r.gaussian(0, DUST_SPEED / 2), out.z * DUST_SPEED + r.gaussian(0, DUST_SPEED / 2)];
      this.throwBit(DUST, p, v, r.range(DUST_SIZE[0], DUST_SIZE[1]), t, r.range(DUST_LIFE[0], DUST_LIFE[1]), DUST_DRAG, 0);
    }
  }

  /** The frame follows the sea's origin: every bit moved by the step. */
  private follow(origin: Vector3): void {
    shiftStarts(this.bit, origin.x - this.origin.x, origin.z - this.origin.z);
    this.origin.copy(origin);
  }

}

/**
 * Balls falling into the sea: each a column of spray (spray.ts) and white water on the sea's own surface, in the wake
 * map of the ship it fell nearest (`near`: the ships' middles in the world, by wake map; null where a ship is not
 * drawn); `share` of the spray's drops (the quality level).
 */
export function fallInSea(splashes: readonly Splash[], spray: SprayView, wakes: readonly WakeMap[], near: readonly ({ readonly x: number; readonly z: number } | null)[], share: number): void {
  for (const s of splashes) {
    spray.splash(s.at, s.speed, s.size, s.skip, s.t, share);
    let best = -1, d = Infinity;
    near.forEach((p, i) => {
      const e = p ? Math.hypot(p.x - s.at[X], p.z - s.at[Z]) : Infinity;
      if (e < d) { d = e; best = i; }
    });
    if (best >= 0) wakes[best]?.splash(s.at[X], s.at[Z], s.t, s.size * PATCH_PER_DIAMETER * (s.skip ? PATCH_SKIP : 1));
  }
}
