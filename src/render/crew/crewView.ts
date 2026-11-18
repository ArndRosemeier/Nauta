/**
 * The trial's crews drawn (plan N4.0): every man an Actors character, her own crew on her decks and the other on her
 * twin's place off her bow (src/app/crew.ts), each drawn at the level of detail and animated at the rate the quality
 * level's crew knobs give (src/app/crewLevels.ts). Men below deck are drawn only when the room they stand in is seen
 * (her zones, render/ship/visibility.ts).
 *
 * Loading: the first character loads the pack, every other shares it and its worker. The men are mustered behind the
 * loading screen, and a few of them at each level of detail, between them wearing everything the crew wears, go into
 * the Stage's warm-up, so no shader is built on the render path (docs/SHADERS.md) when a man changes level.
 */
import { Group, Mesh, Vector3, type Object3D, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
import { Character, type CharacterCatalog } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import type { ShipView } from '../ship/shipView';
import { WALK_SPEED, walkerPlace, type Man } from '../../app/crew';
import { PACK_CLIPS, PACK_GARMENTS, PACK_HAIR, lookOf } from '../../app/crewLooks';
import { CROWD, FULL, MEDIUM, crewLevels, type CrewOverride, type ManLevel, type ManSeen } from '../../app/crewLevels';
import type { CrewKnobs } from '../../app/quality';

/** Where the build serves the pack (`npm run packs` fills public/packs). */
const PACK = 'packs/human/manifest.json';
/** Workers that make the men's shapes side by side, and men dressed at once (the page builds one's meshes while the workers shape the others). */
const WORKERS = 4;
const LANES = 8;
/** The heading's turn of her twin's crew: about +y. */
const UP = new Vector3(0, 1, 0);
/** Triangles are counted from index counts. */
const TRIANGLE = 3;
/** A texel's bytes (RGBA8), and what its mip levels add on top. */
const TEXEL = 4;
const MIPS = 4 / 3;

/** One man as drawn. */
interface Drawn {
  readonly man: Man;
  readonly ch: Character;
  /** Where he stands and which way he faces: his character inside (Actors keeps its own height, his feet on the floor). */
  readonly place: Group;
  /** What decides whether he is drawn: his room's zone group (hers), or null on her twin. */
  readonly zone: Group | null;
  shadow: boolean;
  level: number;
}

/** What the HUD and the trial read off the crew each frame. */
export interface CrewStats {
  mustered: number;
  seen: number;
  full: number;
  medium: number;
  crowd: number;
  /** Men whose clip advanced this frame, on average (the sum of 1/step over those drawn). */
  animated: number;
  shadows: number;
  /** The page's time for the crew this frame: placing, choosing levels and Actors' updates, ms. */
  ms: number;
}

export class CrewView {
  /** Her crew's men ride in this group, which follows her pose; it goes in through `stage.add`. */
  readonly aboard = new Group();
  /** Her twin's crew (when not aboard): her pose, shifted off her bow by `offset`. */
  readonly twin = new Group();
  readonly stats: CrewStats = { mustered: 0, seen: 0, full: 0, medium: 0, crowd: 0, animated: 0, shadows: 0, ms: 0 };
  /** How many crews are drawn (the trial's phases: 0, 1 or 2). */
  crews = 2;
  override: CrewOverride = {};
  private readonly seen: ManSeen[] = [];
  private readonly levels: ManLevel[] = [];
  private readonly eye = new Vector3();
  private readonly at = new Vector3();
  private readonly walk: [number, number, number] = [0, 0, 0];
  private readonly shift = new Vector3();
  private time = 0;
  /** A step array per rate, shared by every man at that rate (Actors reads `animationSteps[level]`). */
  private readonly stepArrays = new Map<number, number[]>();

  private constructor(private readonly ship: ShipView, private readonly drawn: Drawn[], private readonly offset: { x: number; z: number } | null) {
    this.aboard.name = 'crew aboard';
    this.twin.name = 'crew on her twin';
    this.aboard.matrixAutoUpdate = false;
    for (const d of drawn) {
      d.place.add(d.ch.object);
      d.place.position.set(...d.man.at);
      d.place.rotation.y = d.man.facing;
      (d.man.crew === 1 && offset ? this.twin : this.aboard).add(d.place);
    }
    this.stats.mustered = drawn.length;
  }

  /**
   * Musters `men`: loads the pack and a character for each, dressed and playing his clip. `offset`: where her twin's
   * crew stands (ship space, m), or null when both crews are aboard her. `progress` hears how many are ready.
   */
  static async load(renderer: WebGPURenderer, base: string, ship: ShipView, men: readonly Man[], offset: { x: number; z: number } | null, progress: (ready: number) => void): Promise<CrewView> {
    // Only what the crew's pack has (tools/crew/pack.mjs).
    const catalog = (c: CharacterCatalog): CharacterCatalog => ({
      ...c,
      garments: c.garments.filter((g) => PACK_GARMENTS.includes(g.id)),
      hair: c.hair.filter((h) => PACK_HAIR.includes(h.id)),
      animations: c.animations.filter((a) => PACK_CLIPS.includes(a.id)),
    });
    const pack = `${base}${PACK}`;
    // The first loads the pack; a few more lead a worker each, and the rest share with the leads in turn, several
    // at a time: the shapes are made in the workers side by side while the page builds the meshes.
    const first = await Character.load({ pack, renderer, materials: nodeMaterials, worker: new HumanWorker(), catalog, clipLibraries: false });
    const leads = [first];
    for (let k = 1; k < WORKERS; k++) leads.push(await Character.load({ pack, renderer, materials: nodeMaterials, shareWith: first, worker: new HumanWorker(), catalog }));
    const drawn: Drawn[] = new Array(men.length);
    let ready = 0, next = 0;
    const dress = async (ch: Character, man: Man, i: number) => {
      await ch.set({ ...lookOf(man.seed, man.rank, man.navy), animation: man.clip });
      // No two men in step: each clip starts at his own phase.
      const action = ch.actor.currentAction;
      if (action) action.time = man.phase * action.getClip().duration;
      ch.actor.setLod(CROWD);
      drawn[i] = { man, ch, place: new Group(), zone: man.crew === 0 || !offset ? ship.zoneGroupOf(man.space) : null, shadow: true, level: CROWD };
      progress(++ready);
    };
    const lane = async () => {
      for (let i = next++; i < men.length; i = next++) {
        const ch = i < leads.length ? leads[i]! : await Character.load({ pack, renderer, materials: nodeMaterials, shareWith: leads[i % leads.length]!, catalog });
        await dress(ch, men[i]!, i);
      }
    };
    await Promise.all(Array.from({ length: LANES }, lane));
    return new CrewView(ship, drawn, offset);
  }

  /**
   * Puts a few men at each level of detail, between them wearing every garment, hairstyle and beard the crew wears, and
   * gives back what the Stage's warm-up compiles: their characters, taken out of their places (the Stage builds the
   * shadow shaders only of what is not in the scene yet). `afterWarm` puts them back.
   */
  warmObjects(): Object3D[] {
    const wears = (d: Drawn) => { const c = d.ch.config; return [...c.outfit, c.hair ?? '', `beard ${c.beard}`]; };
    const every = new Set(this.drawn.flatMap(wears)), taken = new Set<Drawn>(), out: Object3D[] = [];
    for (const level of [FULL, MEDIUM, CROWD]) {
      const worn = new Set<string>();
      for (const d of this.drawn) {
        if (worn.size >= every.size) break;
        const w = wears(d);
        if (taken.has(d) || w.every((x) => worn.has(x))) continue;
        w.forEach((x) => worn.add(x));
        taken.add(d);
        d.ch.actor.setLod(level);
        d.level = level;
        d.ch.object.removeFromParent();
        out.push(d.ch.object);
      }
    }
    return out;
  }

  /** After the warm-up: every man back at the crowd level until the first frame chooses. */
  afterWarm(): void {
    for (const d of this.drawn) { d.place.add(d.ch.object); d.ch.actor.setLod(CROWD); d.level = CROWD; }
  }

  /** Once a frame, after her pose (ShipView.update): the men placed, their levels chosen and their clips advanced. */
  animate(dt: number, camera: PerspectiveCamera, k: CrewKnobs): void {
    const t0 = performance.now();
    this.time += dt;
    // Her crew rides her; her twin's stands off her bow, turned with her heading and moving as she does.
    const ship = this.ship.group;
    this.aboard.matrix.copy(ship.matrixWorld);
    this.aboard.matrixWorldNeedsUpdate = true;
    if (this.offset) {
      this.shift.set(this.offset.x, 0, this.offset.z).applyAxisAngle(UP, -this.ship.drawn.heading);
      this.twin.position.copy(ship.position).add(this.shift);
      this.twin.quaternion.copy(ship.quaternion);
    }
    this.aboard.visible = this.crews > 0;
    this.twin.visible = this.crews > 1;
    // The groups' own world matrices only: forcing their children (every bone of 240 men) took milliseconds with no man shown.
    this.aboard.updateWorldMatrix(true, false);
    this.twin.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.eye);
    const s = this.stats;
    s.seen = 0; s.full = 0; s.medium = 0; s.crowd = 0; s.animated = 0; s.shadows = 0;
    this.drawn.forEach((d, i) => {
      const o = d.place;
      if (d.man.beat) o.rotation.y = walkerPlace(d.man, this.time, this.walk), o.position.set(...this.walk);
      const crewShown = d.man.crew === 0 || !this.offset ? this.crews > d.man.crew : this.crews > 1;
      o.visible = crewShown && (d.zone?.visible ?? true);
      if (o.visible) { o.updateWorldMatrix(false, false); d.ch.object.updateWorldMatrix(false, false); }
      const seen = o.visible && d.ch.actor.inView(camera);
      this.seen[i] = { distance: this.at.setFromMatrixPosition(o.matrixWorld).distanceTo(this.eye), seen, level: d.level };
    });
    crewLevels(this.seen, k, this.levels, this.override);
    this.drawn.forEach((d, i) => {
      if (!d.place.visible) return;
      const l = this.levels[i]!;
      if (l.level !== d.level) { d.ch.actor.setLod(l.level); d.level = l.level; d.shadow = !l.shadow; }
      d.ch.actor.animationSteps = this.steps(l.step);
      if (l.shadow !== d.shadow) { d.shadow = l.shadow; d.ch.object.traverse((m) => { if ((m as Mesh).isMesh) m.castShadow = l.shadow; }); }
      d.ch.update(dt);
      if (this.seen[i]!.seen) s.seen++;
      if (d.level === FULL) s.full++; else if (d.level === MEDIUM) s.medium++; else s.crowd++;
      s.animated += 1 / l.step;
      if (l.shadow) s.shadows++;
    });
    s.ms = performance.now() - t0;
  }

  /** Triangles of the men drawn now (for the HUD; walks every mesh, so not every frame). */
  trianglesDrawn(): number {
    let n = 0;
    for (const d of this.drawn) {
      if (!d.place.visible) continue;
      d.ch.object.traverseVisible((m) => { const g = (m as Mesh).isMesh ? (m as Mesh).geometry : null; if (g) n += (g.index?.count ?? 0) / TRIANGLE; });
    }
    return n;
  }

  /**
   * What the men hold in memory, for the HUD: every mesh of every level (all are kept, hidden ones too), its
   * geometry's buffers and its materials' textures, each counted once however many men share it.
   */
  memory(): { geometry: number; textures: number; textureCount: number } {
    // Counted by array: the face's morph channels share one interleaved array between four attributes.
    const arrays = new Set<ArrayBufferView>(), textures = new Set<unknown>();
    let geometry = 0, texBytes = 0;
    for (const d of this.drawn) d.ch.object.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      for (const a of [...Object.values(m.geometry.attributes), ...Object.values(m.geometry.morphAttributes).flat(), m.geometry.index]) {
        const array = a?.array as ArrayBufferView | undefined;
        if (array && !arrays.has(array)) { arrays.add(array); geometry += array.byteLength; }
      }
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        for (const v of Object.values(mat)) {
          const t = v as { isTexture?: boolean; image?: { width?: number; height?: number } } | null;
          if (!t?.isTexture || textures.has(t)) continue;
          textures.add(t);
          texBytes += (t.image?.width ?? 0) * (t.image?.height ?? 0) * TEXEL * MIPS;
        }
      }
    });
    return { geometry, textures: texBytes, textureCount: textures.size };
  }

  /** The walkers' pace, for the HUD. */
  get walkSpeed(): number { return WALK_SPEED; }

  private steps(step: number): number[] {
    let a = this.stepArrays.get(step);
    if (!a) { a = [step, step, step]; this.stepArrays.set(step, a); }
    return a;
  }
}
