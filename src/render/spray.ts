// @ts-nocheck -- three's TSL typings infer vector widths poorly for shader math; checked by rendering it (npm run shot).
/**
 * Spray (plan N2.5): when her bow slams into a sea (the water climbing her stem fast, render/wake.ts `ChurnWatch`),
 * a burst of drops is thrown up and out from her bow, carries on with her way, is slowed by the air and blown off by
 * the wind, falls and is gone; at speed a little flies from her bow wave all the time. Each drop is one quad facing
 * the eye, all of them one mesh and one draw; the CPU only writes a new drop's start (where, when, how fast, how big)
 * into a ring, and the vertex stage flies it (linear drag toward the wind, gravity), so a drop costs nothing after.
 */
import { Rng } from '@futuremagic/core';
import { BufferGeometry, Float32BufferAttribute, InstancedBufferAttribute, Mesh, MeshBasicNodeMaterial, NormalBlending, Vector3, type Material } from 'three/webgpu';
import {
  Fn, attribute, cameraProjectionMatrix, exp, float, length, max, modelViewMatrix, positionGeometry, saturate, smoothstep, uniform, varyingProperty, vec3, vec4,
} from 'three/tsl';
import { GRAVITY } from '../sim/units';
import type { Wind } from '../sim/wind';
import type { Slam } from './wake';
import { WAKE } from './wake';
import { daylight } from './seaMaterial';

/** The drops in the ring: a slam throws a few dozen, and a drop lives under three seconds. */
export const MOST_DROPS = 1024;
/** Numbers per drop in each of its two attributes. */
export const DROP_STRIDE = 4;
/** The names of a drop's attributes: where and when it starts (x, y, z from the spray's origin, s), how it is flung (velocity, m/s, and its size, m). */
export const DROP_ATTRIBUTE = 'drop';
export const FLING_ATTRIBUTE = 'fling';
/** How fast the air slows a drop toward the wind, 1/s (fine spray: it falls at g / this, about 6 m/s). */
const DRAG = 1.6;
/** A drop lives this long, s, and fades out over its last share. */
const LIFE = 2.6;
const FADE_OUT = 0.5;
/** It grows as it spreads: its size after a second, as a share of its start. */
const GROWTH = 1.5;
/** How dense a drop's puff is at its heart. */
const DENSITY = 0.55;
/** Spray's albedo (white water in the air). */
const ALBEDO = 0.8;
/** Drops a slam throws per m/s the water climbed her stem, and the most one throws. */
const DROPS_PER_RATE = 22;
const DROPS_MOST = 120;
/** How it is flung, m/s per m/s of the climb: up, out from her side, and the spread about that. */
const FLING_UP = 1.6;
const FLING_OUT = 0.9;
const FLING_SPREAD = 1.2;
/** Where on her bow it starts: scattered this far about the slam, m. */
const SCATTER = 0.6;
/** A drop's size, m, from to. */
const SIZE = [0.25, 0.7] as const;
/** At speed her bow wave throws a little spray all the time: from this share of her top speed, so many drops a second at it. */
const RUNNING_FROM = 0.6;
const RUNNING_RATE = 30;
/** After the spray, before the sea's underside (the sea is opaque; the drops blend over it). */
const SPRAY_ORDER = 10;
/** A quad's corners. */
const QUAD = [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0];
const QUAD_INDEX = [0, 1, 2, 0, 2, 2 + 1];
/** Numbers per corner. */
const XYZ = 3;
/** Seed of the drops' scatter. */
const SPRAY_SEED = 1798;
/** Where each number of a drop sits. */
const X = 0, Y = 1, Z = 2, W = 3;

/** What the drops' shader reads each frame. */
export const SPRAY_INPUTS = {
  /** The clock (s), the wind's velocity (m/s, x and z), all from the spray's origin's frame. */
  now: uniform(0),
  wind: uniform(new Vector3()),
};

/** The drops' material: quads facing the eye, flown in the vertex stage, soft round puffs lit by the day. */
export function makeSprayMaterial(): MeshBasicNodeMaterial {
  const I = SPRAY_INPUTS;
  const m = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: NormalBlending, fog: false });
  m.name = 'spray';
  const vCorner = varyingProperty('vec2', 'vSprayCorner'), vAlpha = varyingProperty('float', 'vSprayAlpha');
  m.vertexNode = Fn(() => {
    const drop = attribute(DROP_ATTRIBUTE, 'vec4'), fling = attribute(FLING_ATTRIBUTE, 'vec4');
    const age = I.now.sub(drop.w), alive = smoothstep(0, float(LIFE * FADE_OUT), float(LIFE).sub(age)).mul(age.greaterThanEqual(0).select(float(1), float(0)));
    // dv/dt = DRAG·(wind − v) + g: v drifts to u = wind + g/DRAG; x = x0 + u·t + (v0 − u)·(1 − e^(−DRAG·t))/DRAG.
    const t = max(age, 0), u = vec3(I.wind.x, float(-GRAVITY / DRAG), I.wind.z);
    const centre = drop.xyz.add(u.mul(t)).add(fling.xyz.sub(u).mul(float(1).sub(exp(t.mul(-DRAG)))).div(DRAG));
    const size = fling.w.mul(t.mul(GROWTH - 1).add(1));
    const view = modelViewMatrix.mul(vec4(centre, 1)).add(vec4(positionGeometry.xy.mul(size).mul(alive), 0, 0));
    vCorner.assign(positionGeometry.xy);
    vAlpha.assign(alive);
    return cameraProjectionMatrix.mul(view);
  })();
  m.colorNode = Fn(() => {
    const r = length(vCorner), puff = saturate(float(1).sub(r)).pow(2).mul(DENSITY).mul(vAlpha);
    return vec4(daylight().mul(ALBEDO), puff);
  })();
  return m;
}

/** Her bow as the spray needs it: her stem at the waterline (world), her heading's direction (x, z), her velocity over the water and speed through it. */
export interface SprayBow {
  readonly stem: readonly [number, number, number];
  readonly fx: number;
  readonly fz: number;
  readonly vx: number;
  readonly vz: number;
  readonly speed: number;
}

/** A ship the spray flies from: her slams since the last frame (world) and her bow. */
export interface SprayFrom {
  readonly slams: readonly Slam[];
  readonly bow: SprayBow;
}

/** The drops: a ring of starts, written as slams come, from every ship drawn; one mesh. */
export class SprayView {
  readonly mesh: Mesh;
  /** Where the spray's frame stands (the sea's origin; drops are kept from it so the numbers stay small). */
  private readonly origin = new Vector3();
  private readonly drops: InstancedBufferAttribute;
  private readonly flings: InstancedBufferAttribute;
  private next = 0;
  /** Each ship's share of a drop her bow wave has thrown at speed, not yet thrown. */
  private readonly running: number[] = [];
  private readonly rng = new Rng(SPRAY_SEED);

  constructor(material: Material) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(QUAD, XYZ));
    g.setIndex(QUAD_INDEX);
    // Every drop starts long dead.
    const dead = new Float32Array(MOST_DROPS * DROP_STRIDE);
    for (let i = 0; i < MOST_DROPS; i++) dead[i * DROP_STRIDE + W] = -LIFE * 2;
    this.drops = new InstancedBufferAttribute(dead, DROP_STRIDE);
    this.flings = new InstancedBufferAttribute(new Float32Array(MOST_DROPS * DROP_STRIDE), DROP_STRIDE);
    g.setAttribute(DROP_ATTRIBUTE, this.drops);
    g.setAttribute(FLING_ATTRIBUTE, this.flings);
    this.mesh = new Mesh(g, material);
    this.mesh.name = 'spray';
    this.mesh.count = MOST_DROPS;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = SPRAY_ORDER;
  }

  /**
   * Once a frame, for each ship (`from`): drops thrown by her slams (world), and at speed from her bow wave at her
   * stem (`bow`: where, her heading as a direction on the water, her velocity over it and her speed through it); the
   * wind blowing, the clock `t`, `dt` since the last frame, and `origin`, the sea's.
   */
  show(from: readonly SprayFrom[], wind: Wind, t: number, dt: number, origin: Vector3): void {
    if (!origin.equals(this.origin)) this.move(origin);
    this.mesh.position.copy(this.origin);
    SPRAY_INPUTS.now.value = t;
    SPRAY_INPUTS.wind.value.set(wind.x * wind.speed, 0, wind.z * wind.speed);
    let written = false;
    from.forEach(({ slams, bow }, ship) => {
      for (const s of slams) {
        const n = Math.min(DROPS_MOST, Math.round(s.rate * DROPS_PER_RATE));
        for (let i = 0; i < n; i++) this.throw(s.at, s.side, s.rate, bow, t);
        written ||= n > 0;
      }
      // At speed, her bow wave throws a little all the time, to either side.
      const share = bow.speed / WAKE.top;
      let running = this.running[ship] ?? 0;
      if (share > RUNNING_FROM) {
        running += (dt * RUNNING_RATE * (share - RUNNING_FROM)) / (1 - RUNNING_FROM);
        for (; running >= 1; running--) { this.throw(bow.stem, this.rng.sign(), bow.speed * (1 - RUNNING_FROM), bow, t); written = true; }
      }
      this.running[ship] = running;
    });
    if (written) { this.drops.needsUpdate = true; this.flings.needsUpdate = true; }
  }

  /** One drop from `at` (world), flung out to `side` by a climb of `rate` m/s, with her velocity. */
  private throw(at: readonly [number, number, number], side: number, rate: number, bow: SprayBow, t: number): void {
    const r = this.rng, i = this.next, d = this.drops.array as Float32Array, f = this.flings.array as Float32Array, k = i * DROP_STRIDE;
    this.next = (i + 1) % MOST_DROPS;
    // Out from her side: starboard of her heading is (−fz, fx).
    const outX = -side * bow.fz, outZ = side * bow.fx, out = 1, vx = bow.vx, vz = bow.vz;
    d[k + X] = at[X] - this.origin.x + r.range(-SCATTER, SCATTER);
    d[k + Y] = at[Y] + r.range(0, SCATTER);
    d[k + Z] = at[Z] - this.origin.z + r.range(-SCATTER, SCATTER);
    d[k + W] = t;
    f[k + X] = vx + (rate * FLING_OUT * outX) / out + r.gaussian(0, FLING_SPREAD);
    f[k + Y] = rate * FLING_UP * r.range(1 / 2, 1) + r.gaussian(0, FLING_SPREAD);
    f[k + Z] = vz + (rate * FLING_OUT * outZ) / out + r.gaussian(0, FLING_SPREAD);
    f[k + W] = r.range(SIZE[0], SIZE[1]);
  }

  /** The spray's frame follows the sea's origin: every drop moved by the step. */
  private move(origin: Vector3): void {
    const d = this.drops.array as Float32Array, dx = origin.x - this.origin.x, dz = origin.z - this.origin.z;
    for (let i = 0; i < MOST_DROPS; i++) { d[i * DROP_STRIDE + X] -= dx; d[i * DROP_STRIDE + Z] -= dz; }
    this.drops.needsUpdate = true;
    this.origin.copy(origin);
  }
}
