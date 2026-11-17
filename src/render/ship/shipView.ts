/**
 * The slice drawn and riding the sea (plan N2.0): her meshes, one per kind, in a group posed by the stand-in motion
 * (sim/ship/standIn.ts), the eye carried with her, the sun's shadow map fitted round her, the lantern's flicker,
 * and the sea kept out of her hull. N2.4 replaces the slice with the whole ship; this view stays.
 */
import { Color, Euler, Group, Matrix4, Mesh, Quaternion, Vector3, type DirectionalLight, type PerspectiveCamera } from 'three/webgpu';
import { Rng } from '@futuremagic/core';
import type { SeaState } from '../../sim/sea/sea';
import { followWater, restingPose, waterPlane, type StandInPose } from '../../sim/ship/standIn';
import { DECK_AT_SIDE, LOAD_WATERLINE } from '../../sim/rules/ships';
import { halfBreadth, shipY } from '../../sim/ship/section';
import type { Look } from '../../app/look';
import type { Standpoint } from '../../app/standpoints';
import { SHIP_COPPER, SHIP_GLOW, SHIP_IRON, SHIP_ROPE, SHIP_WOOD } from '../materials';
import { SEA_CUT } from '../seaCut';
import { SHIP_INPUTS } from './shipMaterials';
import type { SliceParts } from './slice';
import type { Kind } from '@futuremagic/stage';
import type { Gathered } from './gathered';

/** Where she lies: her middle on the sea and her heading (bow north). */
const AT = { x: 0, z: 0, heading: 0 } as const;
/** How much of her pitch and roll the eye takes: a man on deck keeps his head nearer level than the deck. */
const RIDE = 0.65;
/** The sun's shadow map: its texels, how far round her middle it reaches (m), how far off the sun's camera stands. */
const SHADOW_MAP = 2048;
const SHADOW_REACH = 12;
const SUN_DISTANCE = 60;
/** The shadow's bias against acne, in depth and along the normal (m). */
const SHADOW_BIAS = -0.0006;
const SHADOW_NORMAL_BIAS = 0.004;
/** The middle of what casts shadows, ship space: halfway up her lower mast. */
const SHADOW_MIDDLE = new Vector3(0, 5, 0);
/** The candle's light (linear RGB of a flame, about 1900 K) and its strength on the rig's scale. */
const FLAME = new Color().setRGB(1, 0.52, 0.17);
const LANTERN_STRENGTH = 0.15;
/** The horn's glow, as seen, on the same scale. */
const GLOW_STRENGTH = 2.5;
/** The flame's flicker: how deep, and its two rates, Hz. */
const FLICKER = { depth: 0.12, slow: 1.3, fast: 7.7 } as const;
/** The sea is cut a little beyond her closed ends, so it never shows through them where it meets them, m. */
const CUT_BEYOND = 0.03;
/** A turn, rad. */
const TURN = 2 * Math.PI;
/** Seed of the flicker's phases. */
const FLICKER_SEED = 1797;

export class ShipView {
  /** Her meshes in ship space; it goes in through `stage.add`. */
  readonly group = new Group();
  pose: StandInPose = restingPose();
  /** How far the eye is below her deck, 0..1, for the light (the sky rig's `inside`). */
  below = 0;
  private readonly inverse = new Matrix4();
  private readonly look = new Quaternion();
  private readonly ride = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly eye = new Vector3();
  private readonly phases: [number, number];
  private time = 0;

  constructor(private readonly parts: SliceParts) {
    const add = (kind: Kind, g: Gathered, shadow: { cast: boolean; receive: boolean }) => {
      const m = new Mesh(g.geometry(), kind.make());
      m.name = kind.name;
      m.castShadow = shadow.cast;
      m.receiveShadow = shadow.receive;
      this.group.add(m);
    };
    for (const [kind, g] of [[SHIP_WOOD, parts.wood], [SHIP_IRON, parts.iron], [SHIP_COPPER, parts.copper], [SHIP_GLOW, parts.glow], [SHIP_ROPE, parts.ropes]] as const) add(kind, g, kind.shadow);
    this.group.name = 'ship';
    const rng = new Rng(FLICKER_SEED);
    this.phases = [rng.float() * TURN, rng.float() * TURN];
    SHIP_INPUTS.hatch.value.set(parts.hatch.centre.x, parts.hatch.centre.z, parts.hatch.width / 2, parts.hatch.length / 2);
    SHIP_INPUTS.flame.value.copy(parts.flame);
    SEA_CUT.box.value.set(parts.zFore - CUT_BEYOND, parts.zAft + CUT_BEYOND, shipY(DECK_AT_SIDE));
    SEA_CUT.on.value = 1;
  }

  /** Bytes of her meshes' vertex and index buffers, for the HUD and the plan's notes. */
  get bytes(): number {
    let n = 0;
    this.group.traverse((o) => {
      const g = (o as Mesh).geometry;
      if (!g) return;
      for (const a of Object.values(g.attributes)) n += (a.array as Float32Array).byteLength;
      n += (g.index?.array as Uint32Array | undefined)?.byteLength ?? 0;
    });
    return n;
  }

  /** Triangles of all her meshes, for the HUD and the plan's notes. */
  get triangles(): number {
    const p = this.parts;
    return p.wood.triangles + p.iron.triangles + p.copper.triangles + p.glow.triangles + p.ropes.triangles;
  }

  /**
   * Once a frame: her pose on the water at `t`, the eye at `where` looking `look`, the sun's shadow round her, and
   * what her shaders read. `seaOrigin`: where the sea's own frame stands (seaView.ts).
   */
  update(sea: SeaState, t: number, dt: number, camera: PerspectiveCamera, where: Standpoint, look: Look, sun: DirectionalLight, sunDir: Vector3, gain: number, radPerPixel: number, seaOrigin: Vector3): void {
    this.time += dt;
    this.pose = followWater(this.pose, waterPlane(sea, AT.x, AT.z, AT.heading, t), dt);
    const g = this.group;
    g.position.set(AT.x, this.pose.heave, AT.z);
    // Pitch: bow up turns her about +x the other way (bow is -z); roll to starboard turns her about -z the other way.
    this.euler.set(this.pose.pitch, -AT.heading, -this.pose.roll, 'YXZ');
    g.quaternion.setFromEuler(this.euler);
    g.updateMatrixWorld(true);
    this.inverse.copy(g.matrixWorld).invert();

    // The eye rides with her, its tilt eased toward level.
    this.eye.set(...where.eye);
    camera.position.copy(this.eye).applyMatrix4(g.matrixWorld);
    this.euler.set(this.pose.pitch * RIDE, -AT.heading, -this.pose.roll * RIDE, 'YXZ');
    this.ride.setFromEuler(this.euler);
    this.euler.set(look.pitch, look.yaw, 0, 'YXZ');
    this.look.setFromEuler(this.euler);
    camera.quaternion.copy(this.ride).multiply(this.look);
    camera.updateMatrixWorld();
    const [ex, ey] = where.eye;
    this.below = ey < shipY(DECK_AT_SIDE) && Math.abs(ex) < halfBreadth(ey + LOAD_WATERLINE) ? 1 : 0;

    // The sun's shadow map round her, the sun's camera along its light.
    const middle = SHADOW_MIDDLE.clone().applyMatrix4(g.matrixWorld);
    sun.target.position.copy(middle);
    sun.position.copy(middle).addScaledVector(sunDir, SUN_DISTANCE);
    sun.target.updateMatrixWorld();

    // What her shaders read: the eye in ship space, a pixel's angle, the lantern's flicker.
    SHIP_INPUTS.eye.value.copy(camera.position).applyMatrix4(this.inverse);
    SHIP_INPUTS.pixel.value = radPerPixel;
    const f = 1 + FLICKER.depth * (Math.sin(this.time * FLICKER.slow * TURN + this.phases[0]) + Math.sin(this.time * FLICKER.fast * TURN + this.phases[1])) / 2;
    SHIP_INPUTS.lantern.value.copy(FLAME).multiplyScalar(LANTERN_STRENGTH * gain * f);
    SHIP_INPUTS.glow.value.copy(FLAME).multiplyScalar(GLOW_STRENGTH * f);
    SEA_CUT.toShip.value.copy(this.inverse).multiply(new Matrix4().makeTranslation(seaOrigin.x, seaOrigin.y, seaOrigin.z));
  }
}

/** The sun casts the shadow her decks and rig throw: set before the warm-up (it is part of every lit shader's key). */
export function shadowingSun(sun: DirectionalLight): void {
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  const c = sun.shadow.camera;
  c.left = -SHADOW_REACH; c.right = SHADOW_REACH; c.top = SHADOW_REACH; c.bottom = -SHADOW_REACH;
  c.near = SUN_DISTANCE - SHADOW_REACH * 2;
  c.far = SUN_DISTANCE + SHADOW_REACH * 2;
  c.updateProjectionMatrix();
  sun.shadow.bias = SHADOW_BIAS;
  sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
}
