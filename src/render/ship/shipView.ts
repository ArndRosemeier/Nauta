/**
 * The ship drawn and riding the sea (plan N2.0, N2.4): her meshes, a group per zone (zones.ts), posed by her floating
 * (sim/ship/motion.ts, stepped at the simulation's fixed rate and drawn between steps); each frame only the zones that can be seen are drawn (visibility.ts); the eye carried
 * with her; her own sun's shadow map fitted round her and turned with her; the light below deck handed to her
 * shaders; her doors on their hinges; and the far ship, a coarse outside crossfaded in by distance so it never pops.
 */
import {
  Color, Euler, Group, Matrix4, Mesh, Quaternion, Vector2, Vector3, Vector4, type DirectionalLight, type Material, type PerspectiveCamera,
} from 'three/webgpu';
import { Rng } from '@futuremagic/core';
import type { SeaState } from '../../sim/sea/sea';
import { poseBetween, shipOrigin, startMotion, stepMotion, type ShipMotion, type ShipPose } from '../../sim/ship/motion';
import { STEP_SECONDS } from '../../sim/units';
import { shipPlan } from '../../sim/ship/plan';
import { LOAD_WATERLINE } from '../../sim/rules/ships';
import type { Look } from '../../app/look';
import type { Standpoint } from '../../app/standpoints';
import {
  SHIP_COPPER, SHIP_COPPER_FADING, SHIP_GLOW, SHIP_IRON, SHIP_IRON_FADING, SHIP_ROPE, SHIP_WOOD, SHIP_WOOD_FADING,
} from '../materials';
import { SEA_CUT } from '../seaCut';
import { MOST_LAMPS, MOST_SKIES, SHIP_INPUTS } from './shipMaterials';
import type { Kind } from '@futuremagic/stage';
import { geometryOf, packedTriangles, type Packed } from './gathered';
import type { ShipBuild, ZoneBuild } from './ship';
import { OUTSIDE, zoneAt, zoneOfSpaces } from './zones';
import { Visibility } from './visibility';
import { outsideX } from './hullSide';
import { sideTop } from '../../sim/ship/hull';
import { shipY } from '../../sim/ship/section';

/** Where she lies: her middle on the sea and her heading (bow north), lying still (no sailing yet). */
const AT = { x: 0, z: 0, heading: 0 } as const;
const COURSE = { heading: AT.heading, speed: 0 } as const;
/** Steps one frame may catch up; after a longer stall (a hidden tab) she jumps to the clock instead. */
const MOST_STEPS = 8;
/** How much of her pitch and roll the eye takes: a man on deck keeps his head nearer level than the deck. */
const RIDE = 0.65;
/** Her own shadow map: its texels (a quality knob for N1.8), the margin round her, how far off the sun's camera stands (m). */
const SHADOW_MAP = 4096;
const SHADOW_MARGIN = 0.5;
const SUN_DISTANCE = 120;
/** The shadow's bias against acne, in depth and along the normal (m). */
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.006;
/** The candle's light (linear RGB of a flame, about 1900 K) and its strength on the rig's scale. */
const FLAME = new Color().setRGB(1, 0.52, 0.17);
const LANTERN_STRENGTH = 0.15;
/** The horn's glow, as seen, on the same scale. */
const GLOW_STRENGTH = 2.5;
/** The horn's flicker: how deep, and its two rates, Hz. */
const FLICKER = { depth: 0.12, slow: 1.3, fast: 7.7 } as const;
/** A turn, rad. */
const TURN = 2 * Math.PI;
/** Seed of the flames' phases. */
const FLICKER_SEED = 1797;
/** The far ship crossfades in between these distances of the eye from her middle, m. */
const FADE = { from: 130, to: 170 } as const;
/** Beyond this distance from her middle no room inside her is drawn, m (no opening of hers shows anything at that range). */
const INSIDE_REACH = 60;
/** A door counts as open, and its doorway as a portal, from this angle on, rad. */
const DOOR_OPEN = 0.05;
/**
 * The doors as they stand until the walker swings them (N2.3), rad open: the captain's door and the cockpit's open,
 * a few cabins ajar; the magazine, the bread room and the stores shut.
 */
const DOORS_AJAR: Readonly<Record<string, number>> = {
  'cabin-door': 1.45, 'lieutenant-door': 0.7, 'surgeon-door': 0.45, 'cockpit-door': 1.1, 'spirit-door': 1.3, 'fore-hold-door': 1.2,
  'boatswain-door': 0.4, 'gunner-door': 0.9,
};
/** Numbers per lamp and opening in the build's lists. */
const XYZ = 3;

/** Her kinds, and what each draws with while it is being crossfaded. */
const KINDS = { wood: SHIP_WOOD, iron: SHIP_IRON, copper: SHIP_COPPER, glow: SHIP_GLOW, ropes: SHIP_ROPE } as const;
const FADING: ReadonlyMap<Kind, Kind> = new Map([[SHIP_WOOD, SHIP_WOOD_FADING], [SHIP_IRON, SHIP_IRON_FADING], [SHIP_COPPER, SHIP_COPPER_FADING]]);

/** One mesh of hers: what it draws with plain and crossfading. */
interface Part {
  readonly mesh: Mesh;
  readonly plain: Material;
  readonly fading: Material | null;
}

export class ShipView {
  /** Her meshes in ship space; it goes in through `stage.add`. */
  readonly group = new Group();
  /** Her pose as drawn this frame: between her last two steps. */
  drawn: ShipPose;
  private motion: ShipMotion = startMotion(AT.x, AT.z, AT.heading);
  private previous: ShipMotion = this.motion;
  /** The shared clock's time of her last step (NaN until the first frame). */
  private stepped = Number.NaN;
  private readonly origin: [number, number, number] = [0, 0, 0];
  /** How far the eye is below her deck, 0..1, for the light (the sky rig's `inside`). */
  below = 0;
  /** Triangles drawn this frame (the zones seen). */
  trianglesDrawn = 0;
  private readonly zones = new Map<string, Group>();
  private readonly outside: Part[] = [];
  private readonly far = new Group();
  private readonly farParts: Part[] = [];
  private readonly doors = new Map<string, { pivot: Group; shut: number; opens: number; zones: readonly [string, string]; angle: number }>();
  private readonly visibility: Visibility;
  private readonly plan = shipPlan();
  private readonly spaceZones = zoneOfSpaces(this.plan);
  private readonly inverse = new Matrix4();
  private readonly look = new Quaternion();
  private readonly ride = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly eye = new Vector3();
  private readonly toClip = new Matrix4();
  private readonly box: Vector3[] = [];
  private readonly phases: [number, number];
  private time = 0;
  readonly triangles: number;

  constructor(build: ShipBuild) {
    this.drawn = this.motion.pose;
    this.group.name = 'ship';
    const ranges = this.lights(build);
    let tris = 0;
    for (const z of build.zones) {
      const g = new Group();
      g.name = `zone ${z.name}`;
      for (const p of this.meshes(z, g, ranges.get(z.name))) if (z.name === OUTSIDE) this.outside.push(p);
      tris += zoneTriangles(z);
      this.zones.set(z.name, g);
      this.group.add(g);
    }
    for (const d of build.doors) {
      const pivot = new Group();
      pivot.position.set(...d.hinge);
      const angle = DOORS_AJAR[d.id] ?? 0;
      pivot.rotation.y = d.shut + d.opens * angle;
      pivot.updateMatrix();
      for (const [kind, packed] of [[SHIP_WOOD, d.wood], [SHIP_IRON, d.iron]] as const) {
        if (!packed.index.length) continue;
        const m = this.mesh(kind, packed);
        m.userData.light = ranges.get(d.zones[0]);
        m.userData.toShip = pivot.matrix;
        pivot.add(m);
        tris += packedTriangles(packed);
      }
      this.doors.set(d.id, { pivot, shut: d.shut, opens: d.opens, zones: d.zones, angle });
      this.group.add(pivot);
    }
    this.far.name = 'far ship';
    this.farParts.push(...this.meshes(build.far, this.far, undefined, true));
    this.far.visible = false;
    this.group.add(this.far);
    this.triangles = tris;
    this.visibility = new Visibility(build.portals, (along) => ({ half: outsideX(along, sideTop(along)), top: shipY(sideTop(along)) }));
    // Her bounds for the shadow map, from her outside.
    const b = this.zones.get(OUTSIDE)!;
    b.updateMatrixWorld(true);
    const min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity);
    b.traverse((o) => { const bb = (o as Mesh).geometry?.boundingBox; if (bb) { min.min(bb.min); max.max(bb.max); } });
    for (let k = 0; k < 2 * 2 * 2; k++) this.box.push(new Vector3(k & 1 ? max.x : min.x, k & 2 ? max.y : min.y, k & (2 * 2) ? max.z : min.z));
    const rng = new Rng(FLICKER_SEED);
    this.phases = [rng.float() * TURN, rng.float() * TURN];
    SEA_CUT.on.value = 1;
  }

  /** One mesh of a kind from packed vertices. */
  private mesh(kind: Kind, packed: Packed): Mesh {
    const m = new Mesh(geometryOf(packed), kind.make());
    m.name = kind.name;
    m.castShadow = kind.shadow.cast;
    m.receiveShadow = kind.shadow.receive;
    return m;
  }

  /** A zone's meshes, one per kind it has, into `into`; `fading`: they always draw crossfading (the far ship). */
  private meshes(z: ZoneBuild, into: Group, light: Vector4 | undefined, fading = false): Part[] {
    const out: Part[] = [];
    for (const [name, kind] of Object.entries(KINDS)) {
      const packed = z[name as keyof typeof KINDS];
      if (!packed.index.length) continue;
      const fade = FADING.get(kind)?.make() ?? null;
      const m = this.mesh(fading && fade ? (FADING.get(kind)!) : kind, packed);
      m.userData.light = light;
      // Below deck only her timber casts: the sun comes in through her openings alone, and her timber is what stops it.
      m.castShadow &&= light === undefined || kind === SHIP_WOOD;
      into.add(m);
      out.push({ mesh: m, plain: kind.make(), fading: fade });
    }
    return out;
  }

  /** Her lanterns and sky openings into her shaders' lists, grouped by zone; each zone's ranges in them. */
  private lights(build: ShipBuild): Map<string, Vector4> {
    const ranges = new Map<string, Vector4>(), rng = new Rng(FLICKER_SEED);
    let lamp = 0, sky = 0;
    for (const z of build.zones) {
      if (z.name === OUTSIDE) continue;
      const l0 = lamp, s0 = sky;
      for (const l of build.lamps) if (l.zone === z.name && lamp < MOST_LAMPS) (SHIP_INPUTS.lamps.array as Vector4[])[lamp++]!.set(...l.at, rng.float() * TURN);
      for (const s of build.skies) {
        if (s.zone !== z.name || sky >= MOST_SKIES) continue;
        (SHIP_INPUTS.skyPlace.array as Vector4[])[sky]!.set(s.x, s.z, s.halfWidth, s.halfLength);
        (SHIP_INPUTS.skyKind.array as Vector4[])[sky++]!.set(s.y, s.strength, 0, 0);
      }
      ranges.set(z.name, new Vector4(l0, lamp, s0, sky));
    }
    return ranges;
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

  /** Swings a door to `angle` rad open (0 shut). */
  setDoor(id: string, angle: number): void {
    const d = this.doors.get(id);
    if (!d) return;
    d.angle = angle;
    d.pivot.rotation.y = d.shut + d.opens * angle;
    d.pivot.updateMatrix();
  }

  /**
   * Once a frame: her pose on the water at `t`, the eye at `where` looking `look`, what of her is drawn, the sun's
   * shadow round her, and what her shaders read. `seaOrigin`: where the sea's own frame stands (seaView.ts).
   */
  update(sea: SeaState, t: number, dt: number, camera: PerspectiveCamera, where: Standpoint, look: Look, sun: DirectionalLight, sunDir: Vector3, gain: number, radPerPixel: number, seaOrigin: Vector3): void {
    this.time += dt;
    this.float(sea, t);
    const g = this.group;
    g.position.set(...shipOrigin(this.drawn, this.origin));
    // Pitch: bow up turns her about +x the other way (bow is -z); roll to starboard turns her about -z the other way.
    this.euler.set(this.drawn.pitch, -this.drawn.heading, -this.drawn.roll, 'YXZ');
    g.quaternion.setFromEuler(this.euler);
    g.updateMatrixWorld(true);
    this.inverse.copy(g.matrixWorld).invert();

    // The eye: on board it rides with her, its tilt eased toward level; off her it stands still where she lies.
    this.eye.set(...where.eye);
    if (where.off) {
      camera.position.copy(this.eye).applyAxisAngle(UP, -AT.heading).add(new Vector3(AT.x, 0, AT.z));
      this.euler.set(0, -AT.heading, 0, 'YXZ');
    } else {
      camera.position.copy(this.eye).applyMatrix4(g.matrixWorld);
      this.euler.set(this.drawn.pitch * RIDE, -this.drawn.heading, -this.drawn.roll * RIDE, 'YXZ');
    }
    this.ride.setFromEuler(this.euler);
    this.euler.set(look.pitch, look.yaw, 0, 'YXZ');
    this.look.setFromEuler(this.euler);
    camera.quaternion.copy(this.ride).multiply(this.look);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // Which of her zones are seen, and whether near or far she is drawn.
    const eyeShip = camera.position.clone().applyMatrix4(this.inverse);
    const zone = zoneAt(this.plan, this.spaceZones, -eyeShip.z, eyeShip.x, eyeShip.y + LOAD_WATERLINE);
    this.below = zone !== null && zone !== OUTSIDE ? 1 : 0;
    const distance = camera.position.distanceTo(g.position);
    this.toClip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(g.matrixWorld);
    const seen = distance > INSIDE_REACH ? new Set([OUTSIDE]) : this.visibility.seen(zone, this.toClip, (id) => (this.doors.get(id)?.angle ?? 0) > DOOR_OPEN, eyeShip);
    for (const [name, group] of this.zones) group.visible = !seen || seen.has(name);
    for (const d of this.doors.values()) d.pivot.visible = !seen || seen.has(d.zones[0]) || seen.has(d.zones[1]);
    this.crossfade(distance);
    this.trianglesDrawn = this.countDrawn();

    this.fitShadow(sun, sunDir);
    SHIP_INPUTS.pixel.value = radPerPixel;
    SHIP_INPUTS.time.value = this.time;
    const f = 1 + FLICKER.depth * (Math.sin(this.time * FLICKER.slow * TURN + this.phases[0]) + Math.sin(this.time * FLICKER.fast * TURN + this.phases[1])) / 2;
    SHIP_INPUTS.lantern.value.copy(FLAME).multiplyScalar(LANTERN_STRENGTH * gain);
    SHIP_INPUTS.glow.value.copy(FLAME).multiplyScalar(GLOW_STRENGTH * f);
    SEA_CUT.toShip.value.copy(this.inverse).multiply(new Matrix4().setPosition(seaOrigin));
  }

  /** Her floating stepped up to the clock at the fixed rate, and her pose drawn one step behind it, between steps. */
  private float(sea: SeaState, t: number): void {
    if (!(t - this.stepped < MOST_STEPS * STEP_SECONDS)) this.stepped = t - STEP_SECONDS;
    while (this.stepped + STEP_SECONDS <= t) {
      this.previous = this.motion;
      this.motion = stepMotion(this.motion, sea, this.stepped, COURSE);
      this.stepped += STEP_SECONDS;
    }
    this.drawn = poseBetween(this.previous.pose, this.motion.pose, (t - this.stepped) / STEP_SECONDS);
  }

  /** Near her the whole of her is drawn; between FADE.from and FADE.to the far ship is dithered in as she is dithered out. */
  private crossfade(distance: number): void {
    const t = Math.min(1, Math.max(0, (distance - FADE.from) / (FADE.to - FADE.from)));
    const near = this.zones.get(OUTSIDE)!;
    near.visible &&= t < 1;
    this.far.visible = t > 0;
    for (const p of this.outside) {
      p.mesh.material = t > 0 && p.fading ? p.fading : p.plain;
      p.mesh.userData.fade = t > 0 ? new Vector2(0, 1 - t) : undefined;
    }
    for (const p of this.farParts) p.mesh.userData.fade = new Vector2(1 - t, 1);
  }

  /** Triangles of the meshes drawn this frame. */
  private countDrawn(): number {
    let n = 0;
    const walk = (o: Group | Mesh) => {
      if (!o.visible) return;
      if ((o as Mesh).isMesh) n += ((o as Mesh).geometry.index?.count ?? 0) / XYZ;
      for (const c of o.children) walk(c as Group);
    };
    walk(this.group);
    return n;
  }

  /** The sun's shadow camera fitted round her, its frame turned with her heading so the map hugs her length. */
  private fitShadow(sun: DirectionalLight, sunDir: Vector3): void {
    const g = this.group, centre = new Vector3();
    const corners = this.box.map((c) => c.clone().applyMatrix4(g.matrixWorld));
    for (const c of corners) centre.add(c);
    centre.divideScalar(corners.length);
    sun.target.position.copy(centre);
    sun.position.copy(centre).addScaledVector(sunDir, SUN_DISTANCE);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
    const cam = sun.shadow.camera;
    cam.up.set(0, 0, -1).applyQuaternion(g.quaternion);
    const look = new Matrix4().lookAt(sun.position, centre, cam.up), inv = look.clone().transpose();
    let l = Infinity, r = -Infinity, b = Infinity, t = -Infinity, n = Infinity, f = -Infinity;
    for (const c of corners) {
      const p = c.clone().sub(sun.position).applyMatrix4(inv);
      l = Math.min(l, p.x); r = Math.max(r, p.x); b = Math.min(b, p.y); t = Math.max(t, p.y); n = Math.min(n, -p.z); f = Math.max(f, -p.z);
    }
    cam.left = l - SHADOW_MARGIN; cam.right = r + SHADOW_MARGIN; cam.bottom = b - SHADOW_MARGIN; cam.top = t + SHADOW_MARGIN;
    cam.near = Math.max(SHADOW_MARGIN, n - SHADOW_MARGIN); cam.far = f + SHADOW_MARGIN;
    cam.updateProjectionMatrix();
  }
}

const UP = new Vector3(0, 1, 0);

/** Triangles of a zone's meshes. */
function zoneTriangles(z: ZoneBuild): number {
  return packedTriangles(z.wood) + packedTriangles(z.iron) + packedTriangles(z.copper) + packedTriangles(z.glow) + packedTriangles(z.ropes);
}

/** The sun casts the shadow her hull and rig throw: set before the warm-up (it is part of every lit shader's key). */
export function shadowingSun(sun: DirectionalLight): void {
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  sun.shadow.bias = SHADOW_BIAS;
  sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
}
