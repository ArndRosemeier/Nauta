/**
 * The crews drawn (implementation plan N4.3): every man of both ships, placed and moving as the match has him (his
 * task, his way through her, his hurt: app/crewDrawn.ts), drawn as Actors' crowd figures (X5: a few baked bodies,
 * their dress by rank and navy baked on, drawn as instances), and the men of her crew near the captain or who matter
 * now (speaking, addressed) as full characters with living faces from the near pool (nearPool.ts), handed over by a
 * fade in the same pose. The other ship's men are crowd figures only, simpler and then not drawn with distance. Men
 * below deck are drawn only when the room they are in is seen (her zones through her openings, render/ship/
 * visibility.ts); the other ship's below deck never. Every number the iPad decides is a quality knob (`CrewKnobs`).
 *
 * The men who speak (app/officers.ts `voiceMan`: the six the captain addresses, the boatswain, the surgeon) are
 * `Speaker`s for the bubbles (`speaker`), and the six are where the order fan's finger finds them (`onScreen`).
 *
 * Loading: one workbench character bakes the figures (Actors' `buildCrowdFigures`), then the pool shares its pack.
 * The figures' one material and every dress of the pool at both of its levels are built behind the loading screen
 * (`warm`), so no shader is built on the render path (docs/SHADERS.md).
 */
import { Frustum, Group, Matrix4, Quaternion, Sphere, Vector3, type Camera, type Object3D, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
import { Character, buildCrowdFigures, skinToneColor } from '@actors/generator';
import type { CrowdFigures, CrowdMan } from '@actors/three';
import { createNodeCrowdFigureMaterial, nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import type { ShipView } from '../ship/shipView';
import type { SimState } from '../../sim/state';
import type { SimEvent } from '../../sim/step';
import { brigRoster, type Man } from '../../sim/crew/roster';
import { heightAt, routeNetwork } from '../../sim/crew/network';
import type { Whereabouts } from '../../sim/crew/going';
import { taskOf } from '../../sim/crew/crew';
import { STAND_BY_CLIPS, attentiveClip } from '../../app/standBy';
import { apartOnWater } from '../../sim/units';
import { harmOf } from '../../sim/damage';
import type { Harm } from '../../sim/rules/damage';
import { STEPS_PER_SECOND } from '../../sim/units';
import type { Spot } from '../../sim/ship/plan';
import { shipY, shipZ } from '../../sim/ship/section';
import { belowDeck } from '../../audio/crewHearing';
import { BUILDS, DRESSES, HAT_ITEMS, PACK, SHIRT_GROUP, SHIRT_GARMENT, crowdKinds, figureOf, fullLook, kindId, navyOf, packCatalog, wearing, type Dress, type Figure, type Navy } from '../../app/crewLooks';
import {
  JOB_CLIPS, LYING, MEDIUM, ONCE_CLIPS, RUNNING, SLEEPING, SURFACE_WALKS, WALKING, carryOf, choosePool, clipPhase, dueThisFrame, duckTo, manDrawn, manSeed, newManDrawn, poolLevel, stepAside, stepAt, turnBetween, type ManDrawn,
} from '../../app/crewDrawn';
import { FACING_FORWARD, OFFICERS, floorApart, postOf, voiceMan, type Officer } from '../../app/officers';
import type { ManOnScreen } from '../../app/fanOrders';
import { facesNow, stepFace } from '../../app/faces';
import { GUN_CLIP_NAMES, gunClip, gunStrains, gunWork } from '../../app/gunDrill';
import { VOICES, type Point3, type Speaker, type Voice } from '../../app/speech/speakers';
import type { CrewKnobs } from '../../app/quality';
import { pageSeconds } from '../../app/pageMatch';
import { EYE } from '../../app/standpoints';
import { stainOf, stained, coveredOf, TRAIL_EVERY, SHOWN } from '../../app/violence';
import type { Violence } from '../../app/settings';
import { NearPool, type PoolChar } from './nearPool';
import { ClimbRig } from './climbRig';
import { crewLadder, crewYard, SIDLING } from '../../app/ladders';
import type { OnLadder, Yard } from '@futuremagic/figure';
import { Blood } from './blood';
import { Shrouds } from './shroud';
import { Hammocks } from './hammocks';
import { geometryBytes } from '../bytes';

/** Actors' crowd level: all the workbench draws (it only bakes the figures). */
const CROWD_LEVEL = 2;
/** The figures' clips baked at this rate, frames a second (the GPU blends between frames). */
const BAKE_FPS = 30;
/** A man's clip changes over this long, s. */
const CLIP_FADE = 0.3;
/** A man stepping onto a footrope is posed as on the rope from this far (0..1) onto it, else as on the rungs. */
const HALF_ONTO = 0.5;
/** A body reaches about this far round his feet: what is tested against the view, m. */
const BODY_RADIUS = 1.2;
const BODY_MIDDLE = 0.9;
/**
 * A man whose feet are this near the eye's, across the deck, and on its floor (the eye this high above his feet,
 * within the second figure), m, is where the captain stands: he is not drawn. The match does not keep men clear of him.
 */
const EYE_CLEAR = 0.75;
const EYE_CLEAR_HEIGHT = 0.6;
/** Over a crowd man's soles his bubble hangs, m: his height and a little over his hat. */
const OVER_SOLES = 2.1;
/** Over a full character's head bone his bubble hangs, m: just over his hat. */
const OVER_HEAD = 0.42;
/** Where the finger finds a man: this far over his feet, m (his chest). */
const CHEST = 1.25;
/** A clip that plays once is held at its last frame from this time on, s (longer than any clip). */
const HELD_AT_END = 1e4;
/** A hammock is slung athwart her (a quarter turn from her length). */
const ATHWART = Math.PI / 2;
/** A hat a seaman wears or not by his seed (crewLooks.ts): the other dresses' hats are their dress's, and stay. */
const SEAMENS_HATS = HAT_ITEMS;
/** How long a man looks at the captain once addressed, s. */
const LOOK_SECONDS = 4;
/** The midshipman turns to face the captain when this near him, m. */
const FACE_CAPTAIN = 4;
/** How fast he speaks, as Actors counts it (1: about 13 letters a second, an officer's quick plain speech). */
const SPEAKING_RATE = 1;
/** How much farther than `dressTo` a man keeps his hat and hair, m (no flicker at the edge). */
const DRESS_STICK = 5;
/** Shot that strikes within this far of a man startles him, m. */
const STRUCK_NEAR = 6;
/** A man just hurt matters (the near pool takes him, so his face is a living one) this long, s, if he is within this far of the eye, m. */
const HURT_MATTERS = 10;
const HURT_REACH = 15;
/** The clip a walking midshipman plays. */
const WALK = 'walk';

/** One man of either crew. */
interface Drawn {
  readonly ship: number;
  readonly man: number;
  readonly m: Man;
  readonly seed: number;
  /** His looks: changed only when the match setup gives the ships the other navies (`changeNavy`). */
  figure: Figure;
  readonly at: ManDrawn;
  /** Where he stands in his ship's space (his crowd figure's matrix is this carried by her pose every frame: the figures are drawn in world space, shared by the ships of a navy). */
  readonly local: Matrix4;
  /** His crowd figure, or null while he is not drawn (hidden below, or his ship too far). */
  crowd: CrowdMan | null;
  /** The clip his figure plays. */
  clip: string | null;
  /** Whether his figure shows its hat and hair. */
  dressed: boolean;
  /** Whether he is bareheaded in his hammock (the hat a seaman wears by his seed is taken off to sleep). */
  bareheaded: boolean;
  distance: number;
  seen: boolean;
  /** Drawn at all: in a room seen, his ship near enough. */
  shown: boolean;
  step: number;
  /** Seconds since shot struck near him. */
  struck: number;
  /** How badly he is hurt as last seen, and the match's seconds when it first showed and when he began to lie (Infinity: not yet). */
  harm: Harm | null;
  hurtAt: number;
  fellAt: number;
  /** How far his shirt is stained now (violence.ts), and how far the canvas is laid over him (0..1, mild). */
  stain: number;
  covered: number;
  /** Where the last drop fell when he was carried (her space), for the trail. */
  dripped: { x: number; z: number } | null;
  /** A new hurt to lay blood for once he is placed (he has a place to bleed on), and whether he has been placed. */
  fresh: Harm | null;
  placed: boolean;
  /** The rungs he climbs and whether up them, while he climbs (the donor posed for him, `climbRig.ts`); else null. His crowd figure is then in a live pose (`posed`), not a clip. */
  on: OnLadder | null;
  up: boolean;
  /** Or the yard he leans over out on its footrope and how far out along it, m (`ClimbRig.sidle`); null while he is not there. */
  rope: { yard: Yard; s: number } | null;
  posed: boolean;
}

/** How the trial draws the other crew (`?crew`, plan N4.0): on her own deck (`aboard`), or off her bow at `offset` (ship space, m). */
export type OtherCrewAt = { readonly aboard: true } | { readonly offset: { readonly x: number; readonly z: number } } | null;

/** What the page tells the crew each frame. */
export interface CrewFrame {
  readonly state: { from: SimState; to: SimState; f: number };
  /** Which ship is the captain's. */
  readonly mine: number;
  /** Which ship's men the near pool dresses as full characters (default: the captain's; watching a battle, the ship the eye is nearer). */
  readonly pooled?: number;
  /** Watching a battle (plan N7.8): no captain walks, so every man of every ship, the first ship's captain too, is drawn. */
  readonly watching?: boolean;
  readonly camera: PerspectiveCamera;
  readonly knobs: CrewKnobs;
  /** The glass's magnification (1 without): the other ship's men drawn as far as they look near. */
  readonly zoom: number;
  /** Where the midshipman is (the page walks him, app/midshipman.ts), and where the captain stands (null: not aboard). */
  readonly midshipman: Whereabouts | null;
  readonly captain: Spot | null;
  /** Page seconds. */
  readonly now: number;
  /** What the violence setting shows (app/violence.ts). */
  readonly violence: Violence;
}

/** What the HUD and the trial read off the crew. */
export interface CrewStats {
  total: number;
  drawn: number;
  pool: number;
  /** Men placed this frame. */
  placed: number;
  ms: number;
}

const UP = new Vector3(0, 1, 0);
/** The harms from the lightest. */
const HARM_ORDER: readonly Harm[] = ['wounded', 'badly', 'killed'];

export class CrewView {
  /** Each ship's pool characters, blood, shrouds and hammocks ride in her group, which follows her pose; each goes in through `stage.add`. */
  readonly groups: Group[];
  /** The crowd figures' meshes, one for each kind of man, drawn in world space (the origin's): every ship's men of that kind are instances of it. */
  readonly crowd: Group;
  readonly stats: CrewStats = { total: 0, drawn: 0, pool: 0, placed: 0, ms: 0 };
  /** How many crews are drawn (the trial's phases: 0, 1 or 2). */
  crews = 2;
  /** The pool's size in use (the trial's phases set 0); the knobs' `pool` caps it. */
  poolInUse: number;
  /** Every man placed every frame (a trial phase). */
  everyFrame = false;
  /** No man casts a shadow (a trial phase). */
  noShadows = false;
  private readonly all: Drawn[];
  private readonly byShip: Drawn[][];
  private readonly voices = new Map<Voice, number>();
  private readonly officerMen: number[];
  /** The blood on each ship's decks (violence.ts). */
  private readonly blood: Blood[];
  /** The sheets over the killed at the mild level, on each ship. */
  private readonly shrouds: Shrouds[];
  private readonly hammocks: Hammocks[];
  /** Men who matter now (speaking, addressed) until a page second. */
  private readonly matters = new Map<number, number>();
  /** When the pool last began dressing a man, page seconds. */
  private dressedAt = -Infinity;
  private readonly held = new Set<number>();
  private frame = 0;
  private time = 0;
  private mine = 0;
  private lastCamera: Camera | null = null;
  private lastState: SimState | null = null;
  private readonly eye = new Vector3();
  private readonly local = new Vector3();
  private readonly world = new Vector3();
  private readonly turn = new Quaternion();
  private readonly scale = new Vector3();
  private readonly inverse = new Matrix4();
  private readonly frustum = new Frustum();
  private readonly projection = new Matrix4();
  private readonly sphere = new Sphere();
  /** The camera's eye in each ship's space. */
  private readonly eyes: Vector3[];

  private constructor(
    private readonly figures: CrowdFigures,
    private readonly pool: NearPool,
    private readonly climber: ClimbRig,
    private readonly workbench: Character,
    private readonly viewOf: (ship: number) => ShipView | null,
    private readonly other: OtherCrewAt,
    rosters: readonly (readonly Man[])[],
  ) {
    this.groups = rosters.map((_, s) => { const g = new Group(); g.name = `crew of ship ${s + 1}`; g.matrixAutoUpdate = false; return g; });
    this.crowd = new Group();
    this.crowd.name = 'the crowd';
    for (const k of figures.kinds.values()) this.crowd.add(k.mesh);
    this.eyes = rosters.map(() => new Vector3());
    this.all = rosters.flatMap((roster, ship) => roster.map((m, man) => {
      const seed = manSeed(ship, man);
      return { ship, man, m, seed, figure: figureOf(ship, man, m), at: newManDrawn(), local: new Matrix4(), crowd: null, clip: null, dressed: true, bareheaded: false, distance: Infinity, seen: false, shown: false, step: 1, struck: Infinity, harm: null, hurtAt: Infinity, fellAt: Infinity, stain: 0, covered: 0, dripped: null, fresh: null, placed: false, on: null, up: true, rope: null, posed: false };
    }));
    this.byShip = rosters.map((_, s) => this.all.filter((d) => d.ship === s));
    this.shrouds = rosters.map((_, s) => new Shrouds(this.groups[s]!));
    this.hammocks = rosters.map((_, s) => new Hammocks(this.groups[s]!));
    this.blood = rosters.map((_, s) => { const b = new Blood(); b.attach(this.groups[s]!); return b; });
    for (const v of VOICES) this.voices.set(v, voiceMan(v, rosters[0]));
    this.officerMen = OFFICERS.map((o) => this.voices.get(o)!);
    this.poolInUse = pool.chars.length;
    this.stats.total = this.all.length;
    workbench.object.visible = false;
  }

  /**
   * Loads the crews of `ships` ships (`viewOf`: each ship's view by her place in the match, null where she is not drawn):
   * the workbench character, the figures baked from it, and the near pool as the knobs size it. `note` hears progress.
   */
  static async load(renderer: WebGPURenderer, base: string, viewOf: (ship: number) => ShipView | null, ships: number, knobs: Pick<CrewKnobs, 'pool' | 'poolFull'>, other: OtherCrewAt, note: (what: string) => void): Promise<CrewView> {
    const rosters = Array.from({ length: ships }, () => brigRoster());
    note('the crews come aboard');
    const workbench = await Character.load({ pack: `${base}${PACK}`, renderer, materials: nodeMaterials, worker: new HumanWorker(), catalog: packCatalog, levels: [CROWD_LEVEL] });
    const kinds = crowdKinds(workbench.catalog, rosters);
    note(`baking ${kinds.length} kinds of men`);
    const clips = [...new Set([...Object.values(JOB_CLIPS), ...STAND_BY_CLIPS, ...GUN_CLIP_NAMES, ...Object.values(SURFACE_WALKS), LYING, SLEEPING, WALK, 'jog', 'idle'])];
    const figures = await buildCrowdFigures(workbench, { material: createNodeCrowdFigureMaterial, builds: { ...BUILDS }, kinds, clips, once: ONCE_CLIPS, fps: BAKE_FPS });
    note('the officers come on deck');
    const pool = await NearPool.load(renderer, `${base}${PACK}`, workbench, knobs.pool, knobs.poolFull, fullLook(workbench.catalog, figureOf(0, 1, rosters[0]![1]!)));
    note('the climbers learn the shrouds');
    const climber = await ClimbRig.make(renderer, `${base}${PACK}`, workbench);
    return new CrewView(figures, pool, climber, workbench, viewOf, other, rosters);
  }

  /**
   * Builds the crew's shaders behind the loading screen: the figures' material (one for every kind, its shadow too),
   * and every dress of both navies on the pool at both its levels. `prepare` is the Stage's.
   */
  async warm(prepare: (o: Object3D) => Promise<void>, note: (what: string) => void): Promise<void> {
    note('building the crew\'s shaders');
    for (const g of this.groups) g.updateMatrixWorld(true);
    const kindsGroup = new Group();
    for (const k of this.figures.kinds.values()) { k.mesh.visible = true; kindsGroup.add(k.mesh); }
    this.figures.update(0);
    await prepare(kindsGroup);
    for (const k of this.figures.kinds.values()) {
      this.crowd.add(k.mesh);
      k.mesh.visible = k.men.length > 0;
    }
    // Every dress of both navies with its first hairstyle, and the seamen's every hairstyle.
    const warmLook = (s: number, dress: Dress, hair: string) => {
      const build = DRESSES[dress].builds[0]!, navy = navyOf(s);
      const f: Figure = { kind: kindId(navy, dress, build), dress, navy, build, show: [hair, ...DRESSES[dress].hats], skinTone: 0, hairColour: '#000000', tints: DRESSES[dress].tints.map(() => '#808080'), scale: 1 };
      return fullLook(this.pool.catalog, f);
    };
    const looks = this.groups.flatMap((_, s) => [
      ...(Object.keys(DRESSES) as Dress[]).map((dress) => warmLook(s, dress, DRESSES[dress].hair[0]!)),
      ...DRESSES.seaman.hair.slice(1).map((hair) => warmLook(s, 'seaman', hair)),
    ]);
    await this.pool.warm(looks, async (objects, what) => {
      note(`building the crew's shaders: ${what}`);
      for (const o of objects) await prepare(o);
    });
    for (const p of this.pool.chars) this.groups[0]!.add(p.place);
  }

  /**
   * The navy of each ship, as the match setup chose (menu.md, "Your navy"): every man's dress follows his ship's navy,
   * and the near pool is given back to be dressed again. Both navies' kinds and dresses were built at load, so nothing
   * is compiled.
   */
  changeNavy(navyAt: (ship: number) => Navy): void {
    for (const d of this.all) {
      const f = figureOf(d.ship, d.man, d.m, navyAt(d.ship));
      if (f.kind === d.figure.kind && f.tints.join() === d.figure.tints.join()) continue;
      const p = this.pool.of(this.key(d));
      if (p) { this.pool.giveBack(p, this.figures, null); p.as = null; }
      this.hideMan(d);
      d.figure = f;
    }
  }

  /** How many of each ship's men the near pool shows now as full characters (by her place in the match): for the browser checks. */
  pooledByShip(): number[] {
    const n = this.groups.map(() => 0);
    for (const p of this.pool.chars) if (p.man !== null && p.shown) n[this.all[p.man]!.ship]!++;
    return n;
  }

  /** The figures and pool together: what they hold in memory (geometry, the pose atlas), for the HUD and the trial. */
  memory(): { figures: number; atlas: number; pool: number; workbench: number } {
    const f = this.figures.memory(), seen = new Set<ArrayBufferView>();
    return { figures: f.geometry, atlas: f.atlas + f.instances, workbench: geometryBytes(this.workbench.object, seen), pool: this.pool.chars.reduce((s, p) => s + geometryBytes(p.ch.object, seen), 0) };
  }

  /** Once a frame, after the ships' poses (ShipView.update): every man placed and moving, the pool handed out. */
  animate(dt: number, fr: CrewFrame): void {
    const t0 = performance.now();
    this.frame++;
    this.time += dt;
    this.mine = fr.mine;
    this.lastState = fr.state.to;
    this.lastCamera = fr.camera;
    const k = fr.knobs, s = this.stats;
    s.placed = 0; s.drawn = 0;
    fr.camera.getWorldPosition(this.eye);
    this.projection.multiplyMatrices(fr.camera.projectionMatrix, fr.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    let nearestMan = Infinity;
    this.byShip.forEach((men, ship) => {
      const g = this.groups[ship]!, near = this.placeGroup(ship, fr);
      g.visible = near !== null && this.crews > ship;
      if (!near) { for (const d of men) this.hideMan(d); return; }
      this.inverse.copy(g.matrixWorld).invert();
      this.eyes[ship]!.copy(this.eye).applyMatrix4(this.inverse);
      const from = fr.state.from.ships[ship], to = fr.state.to.ships[ship];
      if (!from || !to) return;
      let nearest = Infinity;
      const at = fr.state.to.tick / STEPS_PER_SECOND;
      this.blood[ship]!.showLevel(fr.violence, at);
      for (const d of men) {
        if (ship === fr.mine && d.man === 0 && !fr.watching) continue; // the captain: the player's own body
        d.struck += dt;
        this.noteHurt(d, to, at, fr.violence);
        const step = this.everyFrame ? 1 : d.step;
        if (dueThisFrame(this.frame, step, d.man) || this.pool.of(this.key(d)) || (ship === fr.mine && this.officerMen.includes(d.man))) {
          this.placeMan(d, from, to, fr);
          s.placed++;
        }
        if (d.crowd) d.crowd.matrix.multiplyMatrices(g.matrixWorld, d.local);
        nearest = Math.min(nearest, d.distance);
        if (d.shown) s.drawn++;
      }
      nearestMan = Math.min(nearestMan, nearest);
      this.blood[ship]!.growPools(at);
      this.trails(ship, to, at, fr.violence);
    });
    const castsShadow = !this.noShadows && nearestMan <= k.shadowTo;
    for (const kind of this.figures.kinds.values()) kind.mesh.castShadow = castsShadow;
    this.handOut(fr);
    this.figures.update(dt);
    this.animatePool(dt, fr);
    s.ms = performance.now() - t0;
  }

  /** Her men now hurt, where they are drawn (her space): for the browser checks, which stand near one (tools/shot/men.mjs). */
  hurtMen(ship: number): { man: number; harm: Harm; space: string; x: number; y: number; z: number; clip: string | null; shown: boolean; seen: boolean; covered: number; shroud: { x: number; y: number; z: number; scale: number } | null }[] {
    return (this.byShip[ship] ?? []).flatMap((d) => (d.harm && d.placed ? [{ man: d.man, harm: d.harm, space: d.at.space, x: d.at.x, y: d.at.y, z: d.at.z, clip: d.clip, shown: d.shown, seen: d.seen, covered: d.covered, shroud: this.shrouds[ship]!.shownAt(d.man) }] : []));
  }

  /** Her men now at a gun with what the drill has them doing, where they are drawn (her space): for the browser checks, which stand beside a gun crew (tools/shot/guns.mjs `drill`). */
  gunMen(ship: number): { man: number; gun: number; part: string; step: string; working: boolean; want: string | null; clip: string | null; x: number; y: number; z: number; shown: boolean; seen: boolean }[] {
    const state = this.lastState?.ships[ship];
    return (this.byShip[ship] ?? []).flatMap((d) => {
      const w = state ? gunWork(state, d.man, d.m) : null;
      return w && d.placed ? [{ man: d.man, gun: w.gun, part: w.part, step: w.step, working: w.working, want: gunClip(w), clip: d.clip, x: d.at.x, y: d.at.y, z: d.at.z, shown: d.shown, seen: d.seen }] : [];
    });
  }

  /** The key of a man among both crews (the pool and the speakers know him by it). */
  private key(d: Drawn): number {
    return d.ship * brigRoster().length + d.man;
  }

  /**
   * Ship `ship`'s group placed where her men are drawn this frame (her view's pose; in the trial the other crew on her
   * own deck or off her bow); null when she is not drawn or too far for her men to show.
   */
  private placeGroup(ship: number, fr: CrewFrame): Group | null {
    const g = this.groups[ship]!, trialOther = ship !== fr.mine && this.other !== null;
    const view = trialOther ? this.viewOf(fr.mine) : this.viewOf(ship);
    if (!view || !view.group.visible) return null;
    g.matrix.copy(view.group.matrixWorld);
    if (trialOther && 'offset' in this.other!) {
      const o = this.other.offset;
      g.matrix.multiply(new Matrix4().makeTranslation(o.x, 0, o.z));
    }
    g.matrixWorldNeedsUpdate = true;
    g.updateWorldMatrix(false, false);
    if (ship === fr.mine) return g;
    this.world.setFromMatrixPosition(g.matrixWorld);
    return this.world.distanceTo(this.eye) / Math.max(1, fr.zoom) <= fr.knobs.crowdTo ? g : null;
  }

  /**
   * A man's hurt as the match has it now (at the match's `at` seconds): when it first shows or grows worse, blood is to be
   * laid where he is placed, and the near pool takes him (his face is a living one); the killed and badly hurt lie from then.
   */
  private noteHurt(d: Drawn, ship: SimState['ships'][number], at: number, level: Violence): void {
    const harm = harmOf(ship.damage, d.man);
    if (harm !== d.harm) {
      if (harm && (d.harm === null || HARM_ORDER.indexOf(harm) > HARM_ORDER.indexOf(d.harm))) {
        d.fresh = harm;
        d.hurtAt = at;
        if (harm !== 'wounded') d.fellAt = at;
      }
      d.harm = harm;
      if (harm === null) { d.hurtAt = Infinity; d.fellAt = Infinity; }
    }
    d.covered = coveredOf(level, d.harm, at - d.fellAt);
  }

  /** The men carried below at the unsparing level leave a drop every few metres, under their bearers' feet. */
  private trails(ship: number, to: SimState['ships'][number], at: number, level: Violence): void {
    if (!SHOWN[level].trail) return;
    for (const d of this.byShip[ship]!) {
      const task = d.harm === 'badly' ? carryOf(to.crew, d.man) : null;
      if (!task) { d.dripped = null; continue; }
      const bearer = this.byShip[ship]![task.hands[0]!]!;
      if (!bearer.placed) continue;
      const x = bearer.at.x, z = bearer.at.z;
      if (d.dripped && Math.hypot(x - d.dripped.x, z - d.dripped.z) < TRAIL_EVERY) continue;
      d.dripped = { x, z };
      if (!routeNetwork().surfaces.has(bearer.at.space)) this.blood[ship]!.drip(x, bearer.at.y, z, at);
    }
  }

  /** A man placed from the match: his figure shown or hidden, moved, playing his clip, his hat on with distance. */
  private placeMan(d: Drawn, from: SimState['ships'][number], to: SimState['ships'][number], fr: CrewFrame): void {
    const at = manDrawn(from, to, fr.state.f, d.man, d.m, d.seed, d.at), mine = d.ship === fr.mine;
    if (mine) this.officerAt(d, fr);
    this.climbs(d);
    const view = mine || (this.other && 'aboard' in this.other) ? this.viewOf(fr.mine)! : null;
    const eye = this.eyes[d.ship]!;
    // A man at his place on the captain's floor steps aside as the captain walks up to him (the match does not know where he walks).
    if (at.clip !== WALKING && at.clip !== RUNNING && Math.abs(eye.y - at.y - EYE) < EYE_CLEAR_HEIGHT) stepAside(at, eye);
    at.clip = duckTo(at.clip, d.struck, d.seed, !!at.way || routeNetwork().surfaces.has(at.space));
    d.distance = Math.hypot(at.x - eye.x, at.y + BODY_MIDDLE - eye.y, at.z - eye.z);
    // A man the match puts where the captain's eye is (it does not keep the captain clear) is not drawn: he is not seen inside out.
    const inEye = apartOnWater(at, eye) < EYE_CLEAR && Math.abs(eye.y - at.y - EYE) < EYE_CLEAR_HEIGHT;
    d.shown = this.crews > d.ship && !inEye && (view ? view.zoneGroupOf(at.space).visible : !belowDeck(at.space));
    d.placed = true;
    if (d.fresh) {
      // Where he fell, if it is a deck (not aloft): the blood the violence setting shows (blood.ts).
      if (!routeNetwork().surfaces.has(at.space)) this.blood[d.ship]!.fell(at.x, at.y, at.z, d.fresh, d.seed, fr.state.to.tick / STEPS_PER_SECOND);
      d.fresh = null;
    }
    this.local.set(at.x, at.y + BODY_MIDDLE, at.z).applyMatrix4(this.groups[d.ship]!.matrixWorld);
    d.seen = d.shown && this.frustum.intersectsSphere(this.sphere.set(this.local, BODY_RADIUS));
    d.step = stepAt(fr.knobs, d.distance, d.seen);
    // Mild: the killed are covered, and the canvas goes with him (shroud.ts); once it is over him he is not drawn.
    if (d.shown && d.covered > 0) this.shrouds[d.ship]!.set(d.man, at.x, at.y, at.z, at.yaw, d.covered);
    else this.shrouds[d.ship]!.clear(d.man);
    // A sleeper's hammock, slung under his back (the cloth is this far under the middle of his body).
    if (d.shown && at.clip === SLEEPING) this.hammocks[d.ship]!.set(d.man, at.x, at.y, at.z, ATHWART);
    else this.hammocks[d.ship]!.clear(d.man);
    if (!d.shown || d.covered >= 1) { this.hideMan(d); return; }
    if (!d.crowd) this.showMan(d);
    const c = d.crowd!;
    this.turn.setFromAxisAngle(UP, at.yaw);
    this.scale.setScalar(d.figure.scale);
    d.local.compose(this.local.set(at.x, at.y, at.z), this.turn, this.scale);
    if (d.on || d.rope) {
      // On the rungs or the footrope: the donor, posed for him by `climbs` just now (hands and feet on the holds), faded in from the clip he walked up to them in.
      this.figures.pose(c, this.climber.actor, d.posed ? undefined : { fade: CLIP_FADE });
      d.posed = true;
      d.clip = null;
    } else if (at.clip !== d.clip || d.posed) {
      d.posed = false;
      d.clip = at.clip;
      this.figures.play(c, at.clip, { fade: CLIP_FADE, time: at.clip === SLEEPING ? HELD_AT_END : ONCE_CLIPS.includes(at.clip) ? 0 : this.time + clipPhase(d.seed) });
    }
    const dressed = d.distance <= fr.knobs.dressTo + (d.dressed ? DRESS_STICK : 0);
    const bareheaded = at.clip === SLEEPING;
    if (dressed !== d.dressed || bareheaded !== d.bareheaded) {
      d.dressed = dressed; d.bareheaded = bareheaded;
      this.figures.setLook(c, { show: dressed ? (bareheaded ? d.figure.show.filter((x) => !SEAMENS_HATS.includes(x)) : d.figure.show) : [] });
    }
    // The violence setting: his shirt stained by his hurt.
    const stain = d.figure.tints.length > SHIRT_GROUP ? stainOf(fr.violence, d.harm) : 0;
    if (stain !== d.stain) { d.stain = stain; this.figures.setLook(c, { tints: this.tintsOf(d) }); }
  }

  /** A man climbing a ladder or the shrouds, or out on a footrope: taken from the route's line onto the rungs (the more, the further along his way) or onto the rope, `d.on` the rungs or `d.rope` the yard he holds, else both null. */
  private climbs(d: Drawn): void {
    const at = d.at, c = at.climb;
    d.on = d.rope = null;
    if (!c) return;
    const rungs = c.kind === SIDLING ? null : crewLadder(c, at.y);
    // The way up to a footrope ends leaning over its yard; one with no rungs (the jib-boom's) is all on the rope.
    const onto = c.kind === SIDLING || (c.kind === 'footrope' && !rungs) ? 1 : at.climbOnto;
    const yard = onto > 0 ? crewYard(c, at.x, at.z) : null;
    if (!rungs && !yard) return;
    d.up = c.up;
    // Both holds give a position; between them he is blended, and his pose is the one he is nearer to (`holds`).
    const r = rungs ? { ...this.climber.cling(rungs, c.up) } : null, w = yard ? { ...this.climber.sidle(yard.yard, yard.s) } : null;
    const to = r && w ? { x: r.x + (w.x - r.x) * onto, y: r.y + (w.y - r.y) * onto, z: r.z + (w.z - r.z) * onto, yaw: r.yaw + turnBetween(r.yaw, w.yaw) * onto } : (r ?? w)!, e = at.climbEase;
    d.on = onto < HALF_ONTO ? rungs : null;
    d.rope = onto < HALF_ONTO ? null : yard;
    at.x += (to.x - at.x) * e;
    at.y += (to.y - at.y) * e;
    at.z += (to.z - at.z) * e;
    at.yaw += turnBetween(at.yaw, to.yaw) * e;
    this.holds(d);
  }

  /** The donor posed as `d` holds on (the rungs, or the footrope's yard): its bones are then his. */
  private holds(d: Drawn): void {
    if (d.on) this.climber.cling(d.on, d.up);
    else if (d.rope) this.climber.sidle(d.rope.yard, d.rope.s);
  }

  /** A man's tint colours with his shirt as stained as the setting shows it. */
  private tintsOf(d: Drawn): string[] {
    return d.figure.tints.map((t, i) => (i === SHIRT_GROUP && d.stain > 0 ? stained(t, d.stain) : t));
  }

  /** The six the captain addresses stand at their posts while the match has them there with nothing to do; the midshipman where the page walks him. */
  private officerAt(d: Drawn, fr: CrewFrame): void {
    const k = this.officerMen.indexOf(d.man);
    if (k < 0) return;
    const who = OFFICERS[k]!, at = d.at;
    if (who === 'midshipman') {
      const w = fr.midshipman;
      if (!w) return;
      at.x = w.across; at.y = shipY(w.height); at.z = shipZ(w.along); at.space = w.space;
      at.yaw = Math.atan2(w.facing[1], -w.facing[0]);
      const standing = w.share === 0 && w.way === null;
      if (standing && fr.captain && floorApart(fr.captain, w) < FACE_CAPTAIN) at.yaw = Math.atan2(fr.captain.across - at.x, shipZ(fr.captain.along) - at.z);
      at.clip = standing ? attentiveClip(d.seed) : WALK;
      return;
    }
    const ship = fr.state.to.ships[d.ship]!, hand = ship.crew.men[d.man]!;
    if (hand.going || hand.stands || taskOf(ship.crew, d.man) || harmOf(ship.damage, d.man)) return;
    const post = postOf(who);
    at.x = post.across; at.y = shipY(heightAt(routeNetwork(), post)); at.z = shipZ(post.along); at.space = post.space; at.yaw = FACING_FORWARD;
  }

  private showMan(d: Drawn): void {
    const f = d.figure;
    d.crowd = this.figures.add(f.kind, { skin: skinToneColor(f.skinTone), hair: f.hairColour, tints: this.tintsOf(d), show: d.dressed ? f.show : [] });
    d.clip = null;
    const p = this.pool.of(this.key(d));
    if (p?.shown) this.figures.fade(d.crowd, 0);
  }

  private hideMan(d: Drawn): void {
    if (!d.crowd) return;
    this.figures.remove(d.crowd);
    d.crowd = null;
    d.clip = null;
  }

  /** The pool handed out: the men who matter and the nearest seen of her crew within its reach; the rest given back. */
  private handOut(fr: CrewFrame): void {
    const pooled = fr.pooled ?? fr.mine, mine = this.byShip[pooled] ?? [], size = this.crews > 0 ? this.poolInUse : 0;
    const at = fr.state.to.tick / STEPS_PER_SECOND;
    // A man just hurt matters too (plan "Faces": speaking, struck or addressed): his face is a living one, near enough to be seen.
    const candidates = mine.filter((d) => (d.man !== 0 || fr.watching) && d.crowd !== null && d.covered === 0 && d.clip !== SLEEPING).map((d) => ({
      man: d.man, distance: d.distance, seen: d.seen,
      matters: (this.matters.get(d.man) ?? 0) > fr.now || (at - d.hurtAt < HURT_MATTERS && d.distance <= HURT_REACH),
    }));
    this.held.clear();
    for (const p of this.pool.chars) if (p.man !== null) this.held.add(p.man - pooled * brigRoster().length);
    const chosen = new Set(choosePool(candidates, fr.knobs, this.held, size));
    for (const p of this.pool.chars) {
      if (p.man === null) continue;
      const d = this.all[p.man]!;
      if (d.ship !== pooled || !chosen.has(d.man) || !d.crowd) this.pool.giveBack(p, this.figures, d.crowd);
    }
    for (const man of chosen) {
      const d = mine.find((x) => x.man === man)!, key = this.key(d);
      if (this.pool.of(key)) continue;
      const wears = wearing(d.figure), p = this.pool.free(d.distance <= fr.knobs.fullTo, key, wears);
      if (!p) break;
      // Dressing a man is main-thread work: one at a time, `dressEvery` apart (one already dressed as him is taken at once).
      const dressed = this.pool.dressedAs(p, key);
      if (!dressed && fr.now - this.dressedAt < fr.knobs.dressEvery) continue;
      if (!dressed) this.dressedAt = fr.now;
      // The pool's men ride in the group of the ship whose man each is.
      const group = this.groups[d.ship]!;
      if (p.place.parent !== group) group.add(p.place);
      this.pool.takeOver(p, key, fullLook(this.pool.catalog, d.figure), wears, this.figures, () => d.crowd, (q) => this.placeChar(q, d));
      const words = this.waiting.get(this.key(d));
      if (words) { p.words = words; this.waiting.delete(this.key(d)); }
    }
    this.stats.pool = this.pool.chars.filter((p) => p.shown).length;
  }

  /** A pool character where his man stands. */
  private placeChar(p: PoolChar, d: Drawn): void {
    p.place.position.set(d.at.x, d.at.y, d.at.z);
    p.place.rotation.y = d.at.yaw;
    p.place.scale.setScalar(d.figure.scale);
  }

  /** The pool's men: placed, playing their man's clip, at their level, their faces, their looks and words. */
  private animatePool(dt: number, fr: CrewFrame): void {
    this.pool.fadeOut(dt);
    for (const p of this.pool.chars) {
      const d = p.man === null ? null : this.all[p.man]!, ship = d ? fr.state.to.ships[d.ship] : undefined;
      if (!d || !p.shown || !ship) { if (p.leaving > 0) p.ch.update(dt); continue; }
      this.placeChar(p, d);
      if (d.clip && d.clip !== p.clip) { p.clip = d.clip; void p.ch.play(d.clip, CLIP_FADE); }
      const level = p.full ? poolLevel(fr.knobs, d.distance, p.level) : MEDIUM;
      if (level !== p.level) { p.level = level; p.ch.setLod(level); }
      this.pool.shade(p, !this.noShadows && d.distance <= fr.knobs.shadowTo);
      p.ch.actor.animationSteps = [d.step, d.step];
      // His face: from what he is doing and what has just happened to him (app/faces.ts).
      const task = taskOf(ship.crew, d.man), voice = [...this.voices].find(([, man]) => man === d.man)?.[0];
      const end = fr.state.to.fight.end, ended = !end ? null : end.lost[d.ship] ? 'lost' : end.lost.some((l) => l !== null) ? 'won' : null;
      const gun = gunWork(ship, d.man, d.m);
      const present = facesNow({
        gun: gun ? { strains: gunStrains(gun), captain: gun.part === 'captain', sinceFired: gun.sinceFired } : undefined,
        job: task && task.began !== null ? task.job : null, aloft: !!d.at.way || routeNetwork().surfaces.has(d.at.space), sinceStruck: d.struck,
        fighting: ship.told.quarters, harm: d.harm, sinceHurt: fr.state.to.tick / STEPS_PER_SECOND - d.hurtAt, shouting: voice === 'boatswain' && (this.matters.get(d.man) ?? 0) > fr.now, ended,
      });
      p.ch.setFaceUnits(stepFace(p.face, present, dt, p.units));
      // His shirt, stained as the crowd figure's is (a character dressed for another man is dressed afresh: `stain` starts again).
      if (d.stain !== p.stain && d.figure.tints.length > SHIRT_GROUP) { p.stain = d.stain; p.ch.actor.setGarmentColor(SHIRT_GARMENT, this.tintsOf(d)[SHIRT_GROUP]!); }
      // Looking at the captain while addressed or speaking.
      const was = p.looking;
      p.looking = Math.max(0, p.looking - dt);
      if (was > 0 && p.looking === 0) p.ch.lookAt(undefined);
      else if (p.looking > 0 && was === 0) p.ch.lookAt(fr.camera);
      if (p.words && p.words.until > fr.now) { p.ch.lookAt(fr.camera); p.ch.say(p.words.text, SPEAKING_RATE); p.looking = p.words.until - fr.now; }
      p.words = null;
      p.ch.update(dt);
      if (d.on || d.rope) { this.holds(d); this.climber.lendTo(p.ch.actor); }
    }
  }

  /** The match's events of a step: the men near where shot struck a ship are startled (faces: a flinch, then fear). */
  onEvents(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.kind !== 'hit') continue;
      const [along, across, height] = e.at, x = across, y = shipY(height), z = shipZ(along);
      for (const d of this.byShip[e.ship] ?? []) if (Math.hypot(d.at.x - x, d.at.y - y, d.at.z - z) < STRUCK_NEAR) d.struck = 0;
    }
  }

  /** The captain has spoken to `who`: he is brought into the pool and looks at the captain for a while. */
  addressed(who: Officer, now: number): void {
    const man = this.voices.get(who)!;
    this.matters.set(man, now + LOOK_SECONDS);
    const p = this.pool.of(this.mine * brigRoster().length + man);
    if (p) p.looking = LOOK_SECONDS;
  }

  /** Where each of the six is on the view (px from the top left of a `width` × `height` view), for the fan's finger. */
  onScreen(camera: PerspectiveCamera, width: number, height: number): ManOnScreen[] {
    return OFFICERS.map((who) => {
      const d = this.all[this.mine * brigRoster().length + this.voices.get(who)!]!;
      const g = this.groups[d.ship]!;
      this.world.set(d.at.x, d.at.y + CHEST, d.at.z).applyMatrix4(g.matrixWorld).project(camera);
      const w = this.world, seen = d.shown && g.visible && w.z > -1 && w.z < 1 && Math.abs(w.x) <= 1 && Math.abs(w.y) <= 1;
      // Behind the eye the projection turns over: his side is the other one.
      const left = w.z > 1 ? w.x > 0 : w.x < 0;
      return { who, x: ((w.x + 1) / 2) * width, y: ((1 - w.y) / 2) * height, seen, left };
    });
  }

  /**
   * The man who speaks with `voice` on ship `ship` (N4.5): his bubble over his head, his mouth moving with the words
   * once he is drawn as a full character (speaking, he matters: the pool takes him), looking at the captain.
   */
  speaker(voice: Voice, ship: number): Speaker {
    const man = this.voices.get(voice)!, key = ship * brigRoster().length + man;
    return {
      voice,
      ship,
      head: (out: Point3): boolean => {
        const d = this.all[key];
        if (!d || !d.shown || !this.groups[ship]!.visible) return false;
        const p = this.pool.of(key), head = p?.shown ? p.ch.actor.bones.find((b) => b.name === 'head') : undefined;
        if (head) {
          head.updateWorldMatrix(true, false);
          this.world.setFromMatrixPosition(head.matrixWorld);
          out.x = this.world.x; out.y = this.world.y + OVER_HEAD; out.z = this.world.z;
          return true;
        }
        this.world.set(d.at.x, d.at.y + OVER_SOLES * d.figure.scale, d.at.z).applyMatrix4(this.groups[ship]!.matrixWorld);
        out.x = this.world.x; out.y = this.world.y; out.z = this.world.z;
        return true;
      },
      say: (words: string, seconds: number): void => {
        const until = pageSeconds() + seconds;
        this.matters.set(man, Math.max(this.matters.get(man) ?? 0, until));
        const p = this.pool.of(key);
        if (p?.shown && this.lastCamera) { p.ch.lookAt(this.lastCamera); p.ch.say(words, SPEAKING_RATE); p.looking = seconds; }
        else if (p) p.words = { text: words, until };
        else this.waiting.set(key, { text: words, until });
      },
      hush: (): void => {
        this.matters.delete(man);
        this.waiting.delete(key);
        const p = this.pool.of(key);
        if (p) { p.words = null; if (p.shown) { p.ch.stopSpeaking(); p.ch.lookAt(undefined); p.looking = 0; } }
      },
    };
  }

  /** Words said before their man was in the pool: given to his character when it is taken for him. */
  private readonly waiting = new Map<number, { text: string; until: number }>();
}

