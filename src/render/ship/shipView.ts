/**
 * The ship drawn and riding the sea (plan N2.0, N2.4): her meshes, a group per zone (zones.ts), posed by her floating
 * (sim/ship/motion.ts, stepped at the simulation's fixed rate and drawn between steps); each frame only the zones that can be seen are drawn (visibility.ts); the eye carried
 * with her; her own sun's shadow map fitted round her and turned with her; the light below deck handed to her
 * shaders; her doors on their hinges; and the far ship, a coarse outside crossfaded in by distance so it never pops.
 *
 * However she is laid (floating on her own, or sailed by a match), she keeps her track and watches the water at her
 * side (render/wake.ts, plan N2.5) for the sea's wake map and the spray from her bow.
 *
 * The other captain's ship is a second ShipView of the same build (plan N3.8, `index` 1): her outside only, the same
 * meshes' buffers, her moving frames and sails in her own rows of the per-ship textures, posed from the match, sunk by
 * the earth's curve as she draws away, and crossfaded to her far level by her distance through the glass.
 */
import {
  Color, Euler, Group, Matrix4, Mesh, Quaternion, Vector2, Vector3, Vector4, type DirectionalLight, type Material, type Object3D, type PerspectiveCamera,
} from 'three/webgpu';
import { Rng } from '@futuremagic/core';
import type { SeaState } from '../../sim/sea/sea';
import { lyingStill, poseBetween, shipOrigin, startMotion, stepMotion, toWorld, type ShipMotion, type ShipPose } from '../../sim/ship/motion';
import { STEP_SECONDS, apartOnWater } from '../../sim/units';
import { ChurnWatch, STEM_Z, Track, type Slam, type WakeSource } from '../wake';
import type { SprayBow } from '../spray';
import type { ShipWater } from '../seaView';
import { shipPlan } from '../../sim/ship/plan';
import { LOAD_WATERLINE } from '../../sim/rules/ships';
import type { Look } from '../../app/look';
import type { Standpoint } from '../../app/standpoints';
import {
  SHIP_COPPER, SHIP_COPPER_FADING, SHIP_GLOW, SHIP_IRON, SHIP_IRON_FADING, SHIP_ROPE, SHIP_SAILS, SHIP_SAILS_FADING, SHIP_SAILS_HOLED, SHIP_WOOD, SHIP_WOOD_FADING,
  SHIP_WOOD_HOLED,
} from '../materials';
import type { Damage } from '../../sim/damage';
import { DamageView } from './damageView';
import type { QualityKnobs } from '../../app/quality';
import { SailsView } from './sailsView';
import { SAIL_TIME, setShipSails } from './sailMaterial';
import { SEA_CUT } from '../seaCut';
import { MOST_LAMPS, MOST_SKIES, SHIP_INPUTS, setShipFrame } from './shipMaterials';
import { rigPlan } from '../../sim/ship/rig';
import { swingMatrix, swingsOf, type Swing } from './swings';
import { RUDDER_ID, rudderMatrix } from './stern';
import type { Kind } from '@futuremagic/stage';
import { geometryOf, packedTriangles, type Packed } from './gathered';
import type { ShipBuild, ZoneBuild } from './ship';
import { OUTSIDE, zoneAt, zoneOfSpaces } from './zones';
import { Visibility } from './visibility';
import { outsideX } from './hullSide';
import { sideTop } from '../../sim/ship/hull';
import { shipY } from '../../sim/ship/section';
import { earthDrop } from '../earth';

/** Where she lies: her middle on the sea and her heading (bow north), lying still (no sailing yet). */
const AT = { x: 0, z: 0, heading: 0 } as const;
const STILL = lyingStill(AT.heading);
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
/** The far ship crossfades in from this distance of the eye from her middle (the quality level may bring it nearer), over this share of it more, m. */
const FADE_FROM = 130;
const FADE_SPAN = 0.3;
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
/**
 * The other ship joins her own in the sun's shadow map while their middles are within this, m (alongside): the map
 * then covers both, a little coarser. Further off the other ship is drawn without shadows of her own.
 */
const SHARED_SHADOW_WITHIN = 80;


/** Her kinds, and what each draws with while it is being crossfaded. */
const KINDS = { wood: SHIP_WOOD, iron: SHIP_IRON, copper: SHIP_COPPER, glow: SHIP_GLOW, ropes: SHIP_ROPE } as const;
const FADING: ReadonlyMap<Kind, Kind> = new Map([[SHIP_WOOD, SHIP_WOOD_FADING], [SHIP_IRON, SHIP_IRON_FADING], [SHIP_COPPER, SHIP_COPPER_FADING]]);

/** One mesh of hers: what it draws with plain (the holed kind once her damage cuts her: `showDamage`) and crossfading. */
interface Part {
  readonly mesh: Mesh;
  plain: Material;
  readonly fading: Material | null;
}

/** Her way through the water, m/s: ahead and to starboard (her leeway). */
export type ShipWay = Pick<WakeSource, 'ahead' | 'leeway'>;

/**
 * The spyglass at the eye (app/glass.ts `Spyglass`): how far it is raised (0..1), and, given her pitch and roll now
 * (rad) and the frame's seconds, the tilt of her deck the captain's hands do not take out of the glass.
 */
export interface Steadying {
  readonly raised: number;
  hold(pitch: number, roll: number, dt: number): readonly [pitch: number, roll: number];
}

export class ShipView {
  /** Her meshes in ship space; it goes in through `stage.add`. */
  readonly group = new Group();
  /** The glass held steady against her motion while raised (app/glass.ts); null: no glass. */
  steadying: Steadying | null = null;
  /** How much the eye magnifies now (the glass): her level of detail is chosen by her distance over it. */
  zoom = 1;
  private readonly held = new Quaternion();
  /** Her pose as drawn this frame: between her last two steps. */
  drawn: ShipPose;
  /**
   * Where her pose comes from when a match sails her (`?sail`, app/pageMatch.ts): her pose at the clock's time. Null:
   * she floats on her own, lying still where she is.
   */
  poseFrom: ((t: number) => ShipPose) | null = null;
  private motion: ShipMotion = startMotion(AT.x, AT.z, AT.heading);
  private previous: ShipMotion = this.motion;
  /** Where she has been, and the water at her side (render/wake.ts), for her wake. */
  private readonly track = new Track();
  private readonly churn = new ChurnWatch();
  /** Slams at her bow since the last frame (for the spray). */
  readonly slams: Slam[] = [];
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
  /** What moves on her outside, drawn near and far (`addMoving`). */
  private readonly moving: Object3D[] = [];
  private readonly farParts: Part[] = [];
  private readonly doors = new Map<string, { pivot: Group; shut: number; opens: number; zones: readonly [string, string]; angle: number }>();
  /** The spars that turn (swings.ts): each one's groups near and far, its brace or swing (rad) and hoist (1 hoisted). */
  private readonly swings = new Map<string, { swing: Swing; groups: Group[]; angle: number; hoist: number; matrix: Matrix4 }>();
  /** Her sails and flags (plan N3.10): how they stand is told through `sails.stand` and `sails.blow`. */
  readonly sails: SailsView;
  /** The sails' meshes near, fine and coarse (one shown, a quality knob), and far. */
  private readonly sailMeshes: { fine: Mesh; coarse: Mesh; far: Mesh };
  private swingsMoved = true;
  /** Her damage drawn (plan N6.5): her marks in her blocks of the damage maps, and whether she is drawn holed yet. */
  private readonly marks: DamageView;
  private holed = { hull: false, sails: false };
  /** Her rudder's groups near and far, and where it lies (rad, + its after edge to starboard). */
  private readonly rudder = { groups: [] as Group[], angle: Number.NaN, matrix: new Matrix4() };
  /** Each zone's ranges in her shaders' light lists. */
  private readonly ranges: Map<string, Vector4>;
  private readonly visibility: Visibility;
  private readonly plan = shipPlan();
  private readonly spaceZones = zoneOfSpaces(this.plan);
  private readonly inverse = new Matrix4();
  private readonly look = new Quaternion();
  private readonly tilt = new Quaternion();
  private readonly headUp = new Vector3();
  private readonly ride = new Quaternion();
  private readonly euler = new Euler(0, 0, 0, 'YXZ');
  private readonly eye = new Vector3();
  private readonly toClip = new Matrix4();
  private readonly box: Vector3[] = [];
  private readonly phases: [number, number];
  private time = 0;
  readonly triangles: number;

  /**
   * `index`: whose ship she is among those drawn: 0 the captain's own (every zone, her doors, her lanterns, the sea cut
   * out of her), 1 the other captain's, seen only from outside (her outside, rig and sails; plan N3.8).
   */
  constructor(build: ShipBuild, readonly index = 0) {
    this.drawn = this.motion.pose;
    this.marks = new DamageView(index);
    this.group.name = index === 0 ? 'ship' : 'other ship';
    const own = index === 0;
    const ranges = own ? this.lights(build) : new Map<string, Vector4>();
    this.ranges = ranges;
    let tris = 0;
    for (const z of build.zones.filter((x) => own || x.name === OUTSIDE)) {
      const g = new Group();
      g.name = `zone ${z.name}`;
      for (const p of this.meshes(z, g, ranges.get(z.name))) if (z.name === OUTSIDE) this.outside.push(p);
      tris += zoneTriangles(z);
      this.zones.set(z.name, g);
      this.group.add(g);
    }
    for (const d of own ? build.doors : []) {
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
    // The turning spars: each in a group of its own, near inside her outside (seen and crossfaded with it), and on the far ship.
    // Her rudder too, turned by her helm (setRudder).
    const turning = (id: string): Group[] => {
      const groups: Group[] = [];
      for (const [list, into, parts, fading] of [[build.swings, this.zones.get(OUTSIDE)!, this.outside, false], [build.farSwings, this.far, this.farParts, true]] as const) {
        const z = list.find((x) => x.name === id);
        if (!z) continue;
        const g = new Group();
        g.name = `swing ${id}`;
        g.matrixAutoUpdate = false;
        const made = this.meshes(z, g, undefined, fading);
        for (const p of made) p.mesh.userData.toShip = g.matrix;
        parts.push(...made);
        if (!fading) tris += zoneTriangles(z);
        into.add(g);
        groups.push(g);
      }
      return groups;
    };
    for (const swing of swingsOf(rigPlan(this.plan))) {
      this.swings.set(swing.id, { swing, groups: turning(swing.id), angle: 0, hoist: 1, matrix: new Matrix4() });
    }
    this.rudder.groups.push(...turning(RUDDER_ID));
    // The sails and flags: near in her outside (fine or coarse), and on the far ship; shaped on the GPU, so never culled by their flat bounds.
    this.sails = new SailsView(rigPlan(this.plan));
    const sail = (packed: Packed, into: Group, parts: Part[], fading: boolean): Mesh => {
      const m = this.mesh(fading ? SHIP_SAILS_FADING : SHIP_SAILS, packed);
      m.frustumCulled = false;
      into.add(m);
      parts.push({ mesh: m, plain: SHIP_SAILS.make(), fading: SHIP_SAILS_FADING.make() });
      return m;
    };
    this.sailMeshes = {
      fine: sail(build.sails.fine, this.zones.get(OUTSIDE)!, this.outside, false),
      coarse: sail(build.sails.coarse, this.zones.get(OUTSIDE)!, this.outside, false),
      far: sail(build.sails.far, this.far, this.farParts, true),
    };
    this.sailMeshes.coarse.visible = false;
    tris += packedTriangles(build.sails.fine);
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
    if (own) SEA_CUT.on.value = 1;
    this.group.traverse((o) => { o.userData.ship = index; });
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
      if (kind === SHIP_ROPE) this.ropeMeshes.push(m);
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

  /**
   * Puts `object` (in her space) into zone `name` (zones.ts): drawn when that zone is seen, its meshes lit by the
   * zone's lanterns and openings, and below deck only timber casting (her fittings, furnishings.ts).
   */
  addToZone(name: string, object: Object3D): void {
    const zone = this.zones.get(name);
    if (!zone) throw new Error(`she has no zone ${name}`);
    const light = this.ranges.get(name);
    object.traverse((o) => {
      if (!(o as Mesh).isMesh) return;
      o.userData.light = light;
      o.userData.ship = this.index;
      o.castShadow &&= light === undefined || ((o as Mesh).material as Material).name === SHIP_WOOD.name;
    });
    zone.add(object);
  }

  /**
   * Puts `object` (in her space: her guns and lids, gunsView.ts) on her outside, drawn whenever her outside or her far
   * level is, near and far alike (it is not crossfaded: it has its own levels of detail).
   */
  addMoving(object: Object3D): void {
    object.traverse((o) => { o.userData.ship = this.index; });
    this.moving.push(object);
    this.group.add(object);
  }

  /**
   * The group drawn for the zone a space of hers is in (her outside for the weather deck): what stands in that space
   * is drawn when this group is (`visible`, set each frame by what can be seen: visibility.ts).
   */
  zoneGroupOf(space: string): Group {
    return this.zones.get(this.spaceZones.get(space) ?? OUTSIDE)!;
  }

  /** Swings a door to `angle` rad open (0 shut). */
  setDoor(id: string, angle: number): void {
    const d = this.doors.get(id);
    if (!d) return;
    d.angle = angle;
    d.pivot.rotation.y = d.shut + d.opens * angle;
    d.pivot.updateMatrix();
  }

  /** Puts her rudder over to `angle` rad (+: its after edge to starboard, turning her to starboard; stern.ts `rudderMatrix`). */
  setRudder(angle: number): void {
    if (angle === this.rudder.angle) return;
    this.rudder.angle = angle;
    rudderMatrix(angle, this.rudder.matrix);
    for (const g of this.rudder.groups) g.matrix.copy(this.rudder.matrix);
  }

  /** Braces a yard round, or swings the boom or gaff, to `angle` rad (swings.ts: + a yard's starboard arm aft, the boom's end to starboard). */
  setBrace(id: string, angle: number): void { this.setSwing(id, 'angle', angle); }

  /** Hoists a topsail or topgallant yard (1) or lowers it onto its cap (0), or anything between. */
  setHoist(id: string, share: number): void { this.setSwing(id, 'hoist', share); }

  private setSwing(id: string, key: 'angle' | 'hoist', value: number): void {
    const w = this.swings.get(id);
    if (!w || w[key] === value) return;
    w[key] = value;
    this.swingsMoved = true;
  }

  /**
   * Her damage as the match has it (plan N6.5; null: none): holes, panels stove in and bulwarks smashed out drawn on
   * her timber, holes and splits in her canvas; once something of hers is cut through, her outside and her sails draw
   * with the holed kinds (compiled at load, so nothing compiles now). Once a frame; nothing is done while it stands.
   */
  showDamage(d: Damage | null): void {
    const shown = this.marks.marksFor(d);
    const toKind = (parts: readonly Part[], from: Kind, to: Kind) => {
      for (const p of parts) if (p.plain === from.make()) p.plain = to.make();
    };
    if (shown.hullCut && !this.holed.hull) { this.holed.hull = true; toKind(this.outside, SHIP_WOOD, SHIP_WOOD_HOLED); }
    if (shown.sailsCut && !this.holed.sails) { this.holed.sails = true; toKind(this.outside, SHIP_SAILS, SHIP_SAILS_HOLED); }
  }

  /** The turning spars' ids. */
  get swingIds(): string[] { return [...this.swings.keys()]; }

  /** The turning spars' frames into their groups and her ropes' shaders, when one has moved. */
  private moveSwings(): void {
    if (!this.swingsMoved) return;
    this.swingsMoved = false;
    for (const w of this.swings.values()) {
      const m = swingMatrix(w.swing, w.angle, w.hoist, w.matrix);
      for (const g of w.groups) g.matrix.copy(m);
      setShipFrame(w.swing.frame, m, this.index);
    }
  }
  /** Where the far ship starts to fade in, m (quality.ts `shipFarFrom`). */
  private fadeFrom = FADE_FROM;
  /** Her rope meshes, whose shadow is a quality knob. */
  private readonly ropeMeshes: Mesh[] = [];

  /** The quality level's knobs for her (quality.ts): whether her ropes and sails cast shadows, how fine her sails' grids are, and how far off the far ship starts. */
  setQuality(k: Pick<QualityKnobs, 'ropeShadows' | 'shipFarFrom' | 'sailGrid' | 'sailShadows'>): void {
    for (const m of this.ropeMeshes) m.castShadow = k.ropeShadows && m.userData.light === undefined;
    this.fadeFrom = k.shipFarFrom;
    const fine = k.sailGrid === 'fine';
    this.sailMeshes.fine.visible = fine;
    this.sailMeshes.coarse.visible = !fine;
    for (const m of Object.values(this.sailMeshes)) m.castShadow = k.sailShadows;
  }

  /** Her sails stepped `dt` s, their yards hoisted as they are drawn; then, the spars placed, each sail's numbers and its lines' frames. */
  private moveSails(dt: number): void {
    this.sails.follow(dt);
    for (const [id, share] of this.sails.hoists()) this.setHoist(id, share);
    this.moveSwings();
    this.sails.write((id) => this.swings.get(id)?.matrix ?? null, this.group.quaternion, this.time, (f, m) => setShipFrame(f, m, this.index));
    setShipSails(this.sails.rows, this.index);
    if (this.index === 0) SAIL_TIME.value = this.time;
  }

  /**
   * Her pose at `t` and her group placed on the water, sunk by `sink` m (the earth's curve), her spars and sails
   * moved: what every ship drawn does each frame.
   */
  private lay(sea: SeaState, t: number, dt: number, sink = 0): void {
    this.time += dt;
    this.float(sea, t);
    const g = this.group;
    g.position.set(...shipOrigin(this.drawn, this.origin));
    g.position.y -= sink;
    // Pitch: bow up turns her about +x the other way (bow is -z); roll to starboard turns her about -z the other way.
    this.euler.set(this.drawn.pitch, -this.drawn.heading, -this.drawn.roll, 'YXZ');
    g.quaternion.setFromEuler(this.euler);
    g.updateMatrixWorld(true);
    this.inverse.copy(g.matrixWorld).invert();
    this.moveSails(dt);
    // The water at her side, whoever lays her (plan N2.5): its churn, her wet line, slams at her bow.
    this.slams.length = 0;
    this.churn.keepUp(this.drawn, sea, t, this.slams);
  }

  /**
   * Once a frame for the other captain's ship (plan N3.8): her pose at `t`, sunk below the eye's level by the
   * earth's curve as the sea is (render/earth.ts), so she goes hull-down far off, and near or far drawn by her
   * distance from `camera` over the glass's magnification. Call it after her own ship has placed the eye.
   */
  follow(sea: SeaState, t: number, dt: number, camera: PerspectiveCamera): void {
    const at = this.poseFrom ? this.poseFrom(t) : this.drawn;
    this.lay(sea, t, dt, earthDrop(apartOnWater(at, camera.position)));
    this.zones.get(OUTSIDE)!.visible = true;
    this.crossfade(camera.position.distanceTo(this.group.position) / this.zoom);
    this.trianglesDrawn = this.countDrawn();
  }

  /**
   * Once a frame: her pose on the water at `t`, the eye at `where` looking `look`, what of her is drawn, and what
   * her shaders read. `seaOrigin`: where the sea's own frame stands (seaView.ts). The sun's shadow is fitted after
   * every ship is placed (`shade`).
   */
  update(sea: SeaState, t: number, dt: number, camera: PerspectiveCamera, where: Standpoint, look: Look, gain: number, radPerPixel: number, seaOrigin: Vector3): void {
    this.lay(sea, t, dt);
    const g = this.group;

    // The eye: on board it rides with her, its tilt eased toward level; off her it stands still where she lies.
    this.eye.set(...where.eye);
    if (where.off) {
      // Sailed by a match, the eye off her keeps its place beside her as she goes.
      const at = this.poseFrom ? this.drawn : AT;
      camera.position.copy(this.eye).applyAxisAngle(UP, -at.heading).add(new Vector3(at.x, 0, at.z));
      this.euler.set(0, -at.heading, 0, 'YXZ');
    } else {
      camera.position.copy(this.eye).applyMatrix4(g.matrixWorld);
      this.euler.set(this.drawn.pitch * RIDE, -this.drawn.heading, -this.drawn.roll * RIDE, 'YXZ');
    }
    this.ride.setFromEuler(this.euler);
    // A body on her deck holds its head its own way (app/body.ts): her turn, then the head's tilt in her frame.
    if (where.up && !where.off) this.ride.copy(g.quaternion).multiply(this.tilt.setFromUnitVectors(UP, this.headUp.set(...where.up)));
    // The glass raised: the hands hold it against her motion, all but what they are too slow for (app/glass.ts).
    const glass = this.steadying;
    if (glass && !where.off) {
      const [pitch, roll] = glass.hold(this.drawn.pitch, this.drawn.roll, dt);
      if (glass.raised > 0) this.ride.slerp(this.held.setFromEuler(this.euler.set(pitch, -this.drawn.heading, -roll, 'YXZ')), glass.raised);
    }
    this.euler.set(look.pitch, look.yaw, 0, 'YXZ');
    this.look.setFromEuler(this.euler);
    camera.quaternion.copy(this.ride).multiply(this.look);
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

    // Which of her zones are seen, and whether near or far she is drawn.
    const eyeShip = camera.position.clone().applyMatrix4(this.inverse);
    const zone = zoneAt(this.plan, this.spaceZones, -eyeShip.z, eyeShip.x, eyeShip.y + LOAD_WATERLINE);
    this.below = zone !== null && zone !== OUTSIDE ? 1 : 0;
    const distance = camera.position.distanceTo(g.position) / this.zoom;
    this.toClip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(g.matrixWorld);
    const seen = distance > INSIDE_REACH ? new Set([OUTSIDE]) : this.visibility.seen(zone, this.toClip, (id) => (this.doors.get(id)?.angle ?? 0) > DOOR_OPEN, eyeShip);
    for (const [name, group] of this.zones) group.visible = !seen || seen.has(name);
    for (const d of this.doors.values()) {
      d.pivot.visible = !seen || seen.has(d.zones[0]) || seen.has(d.zones[1]);
      // A door is lit by the lamps of the room it is seen from.
      const lit = this.ranges.get(zone !== null && d.zones.includes(zone) ? zone : d.zones[0]);
      for (const m of d.pivot.children) m.userData.light = lit;
    }
    this.crossfade(distance);
    this.trianglesDrawn = this.countDrawn();

    SHIP_INPUTS.pixel.value = radPerPixel;
    SHIP_INPUTS.time.value = this.time;
    const f = 1 + FLICKER.depth * (Math.sin(this.time * FLICKER.slow * TURN + this.phases[0]) + Math.sin(this.time * FLICKER.fast * TURN + this.phases[1])) / 2;
    SHIP_INPUTS.lantern.value.copy(FLAME).multiplyScalar(LANTERN_STRENGTH * gain);
    SHIP_INPUTS.glow.value.copy(FLAME).multiplyScalar(GLOW_STRENGTH * f);
    SEA_CUT.toShip.value.copy(this.inverse).multiply(new Matrix4().setPosition(seaOrigin));
  }

  /** Her floating stepped up to the clock at the fixed rate, and her pose drawn one step behind it, between steps. */
  private float(sea: SeaState, t: number): void {
    if (this.poseFrom) {
      this.drawn = this.poseFrom(t);
      return;
    }
    if (!(t - this.stepped < MOST_STEPS * STEP_SECONDS)) this.stepped = t - STEP_SECONDS;
    while (this.stepped + STEP_SECONDS <= t) {
      this.previous = this.motion;
      this.motion = stepMotion(this.motion, sea, this.stepped, STILL);
      this.stepped += STEP_SECONDS;
    }
    this.drawn = poseBetween(this.previous.pose, this.motion.pose, (t - this.stepped) / STEP_SECONDS);
  }

  /** What her wake needs of her now (seaView.ts `ShipWater`), with her `way` through the water: her track, her pose, the water at her side. */
  water(way: ShipWay): ShipWater {
    const c = this.churn.churnNow();
    return { track: this.track, source: { pose: this.drawn, ahead: way.ahead, leeway: way.leeway, bowChurn: c.bow, sideChurn: c.side }, churn: this.churn.lists, toShip: this.inverse };
  }

  /** Her bow as the spray needs it (spray.ts `SprayBow`), with her `way`: her stem at the waterline, her heading, her velocity. */
  bow(way: ShipWay): SprayBow {
    const p = this.drawn, fx = Math.sin(p.heading), fz = -Math.cos(p.heading);
    return {
      stem: toWorld(p, 0, 0, STEM_Z), fx, fz,
      // Ahead along her heading, her leeway to starboard of it (starboard is (−fz, fx)).
      vx: way.ahead * fx - way.leeway * fz, vz: way.ahead * fz + way.leeway * fx, speed: Math.hypot(way.ahead, way.leeway),
    };
  }

  /** Near her the whole of her is drawn; over the fade's span the far ship is dithered in as she is dithered out. */
  private crossfade(distance: number): void {
    const t = Math.min(1, Math.max(0, (distance - this.fadeFrom) / (this.fadeFrom * FADE_SPAN)));
    const near = this.zones.get(OUTSIDE)!;
    near.visible &&= t < 1;
    this.far.visible = t > 0;
    for (const p of this.outside) {
      p.mesh.material = t > 0 && p.fading ? p.fading : p.plain;
      p.mesh.userData.fade = t > 0 ? new Vector2(0, 1 - t) : undefined;
    }
    for (const p of this.farParts) p.mesh.userData.fade = new Vector2(1 - t, 1);
    for (const o of this.moving) o.visible = near.visible || this.far.visible;
  }

  /** Whether her whole outside (not only her far level) is drawn this frame. */
  get nearDrawn(): boolean {
    return this.zones.get(OUTSIDE)!.visible;
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

  /** Her bounding box's corners as she lies now (the world). */
  private corners(): Vector3[] {
    return this.box.map((c) => c.clone().applyMatrix4(this.group.matrixWorld));
  }

  /**
   * The sun's shadow camera fitted round her, its frame turned with her heading so the map hugs her length; round
   * `other` too while she is alongside (`SHARED_SHADOW_WITHIN`). Once a frame, after every ship is placed.
   */
  shade(sun: DirectionalLight, sunDir: Vector3, other: ShipView | null = null): void {
    const g = this.group, centre = new Vector3();
    const near = other !== null && other.group.visible && other.group.position.distanceTo(g.position) < SHARED_SHADOW_WITHIN;
    const corners = [...this.corners(), ...(near ? other.corners() : [])];
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
