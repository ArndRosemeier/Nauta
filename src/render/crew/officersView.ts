/**
 * The men the captain addresses, drawn (implementation plan N4.4): six full Actors characters, the master at the
 * wheel, the first lieutenant on the quarterdeck, the gunner in the waist, the carpenter at the pumps, the lookout in
 * the main top and the midshipman at the captain's side (app/officers.ts, app/midshipman.ts). Each has a living face
 * (plan "Faces"): he blinks, his eyes move, and when the captain addresses him he looks at the captain.
 *
 * The one small seam N4.3 takes over as its near pool: `men` (each voice's character, for the speech bubbles'
 * registry, N4.5), `onScreen` (where each is on the view, for the fan's finger), `addressed`, and `place`/`animate`.
 * Until the crew is drawn these six stand at their posts, idle; the midshipman walks.
 */
import { Group, Vector3, type Object3D, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu';
import { Character, type CharacterPatch } from '@actors/generator';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import type { ShipView } from '../ship/shipView';
import { DRESS, PACK, navyLook, packCatalog, type Dress, type Navy, type Rank } from '../../app/crewLooks';
import { FULL } from '../../app/crewLevels';
import { FACING_FORWARD, OFFICERS, floorApart, postOf, type Officer } from '../../app/officers';
import type { ManOnScreen } from '../../app/fanOrders';
import type { Whereabouts } from '../../sim/crew/going';
import { heightAt, routeNetwork } from '../../sim/crew/network';
import type { Spot } from '../../sim/ship/plan';
import { shipY, shipZ } from '../../sim/ship/section';

/** Each man's seed, his dress (her navy's outfit preset of it, crewLooks.ts `DRESS`: the master and first lieutenant in a lieutenant's coat, the gunner and carpenter as warrant officers in the boatswain's, the lookout a seaman's slops) and clip standing (crewLooks.ts PACK_CLIPS). */
const MEN: Readonly<Record<Officer, { readonly seed: number; readonly rank: Rank; readonly dress: Dress; readonly clip: string }>> = {
  master: { seed: 1801, rank: 'officer', dress: 'lieutenant', clip: 'idle' },
  'first lieutenant': { seed: 1802, rank: 'officer', dress: 'lieutenant', clip: 'arms folded' },
  gunner: { seed: 1803, rank: 'officer', dress: 'boatswain', clip: 'idle' },
  carpenter: { seed: 1804, rank: 'seaman', dress: 'boatswain', clip: 'idle' },
  lookout: { seed: 1806, rank: 'seaman', dress: 'seaman', clip: 'idle' },
  midshipman: { seed: 1807, rank: 'officer', dress: 'midshipman', clip: 'idle' },
};
/** The midshipman is the youngest grown man Actors makes (adults only), years. */
const MIDSHIPMAN_AGE = 18;
/** The clip a walking man plays. */
const WALK = 'walk';
/** Where the finger finds a man: this far over his feet, m (his chest). */
const CHEST = 1.25;
/** How long a man looks at the captain once addressed, s. */
const LOOK_SECONDS = 4;
/** The midshipman turns to face the captain when this near him, m. */
const FACE_CAPTAIN = 4;
/** A clip change fades over this long, s. */
const CLIP_FADE = 0.3;

/** One man as drawn. */
interface Drawn {
  readonly who: Officer;
  readonly ch: Character;
  /** His feet and the way he faces, ship space; his character inside. */
  readonly place: Group;
  zone: Group;
  clip: string;
  /** Seconds he still looks at the captain. */
  looking: number;
}

export class OfficersView {
  /** The men ride in this group, which follows her pose; it goes in through `stage.add`. */
  readonly group = new Group();
  private readonly drawn: Drawn[];
  private readonly at = new Vector3();

  private constructor(private readonly ship: ShipView, chars: readonly Character[]) {
    this.group.name = 'the officers';
    this.group.matrixAutoUpdate = false;
    this.drawn = OFFICERS.map((who, i) => {
      const place = new Group();
      place.name = who;
      place.add(chars[i]!.object);
      this.group.add(place);
      return { who, ch: chars[i]!, place, zone: ship.zoneGroupOf('deck'), clip: MEN[who].clip, looking: 0 };
    });
    for (const d of this.drawn) if (d.who !== 'midshipman') this.atPost(d, postOf(d.who), FACING_FORWARD);
  }

  /** Loads the six: the crew's pack, each dressed by rank, with a living face, playing his clip, at full detail. */
  static async load(renderer: WebGPURenderer, base: string, ship: ShipView): Promise<OfficersView> {
    const pack = `${base}${PACK}`;
    const first = await Character.load({ pack, renderer, materials: nodeMaterials, worker: new HumanWorker(), catalog: packCatalog, clipLibraries: false });
    const chars = [first];
    for (let i = 1; i < OFFICERS.length; i++) chars.push(await Character.load({ pack, renderer, materials: nodeMaterials, shareWith: first, catalog: packCatalog }));
    await Promise.all(OFFICERS.map(async (who, i) => {
      const m = MEN[who], ch = chars[i]!, look = navyLook(ch.catalog, DRESS.british[m.dress], m.seed, m.rank);
      const young: CharacterPatch = who === 'midshipman' ? { body: { ...look.body, ageYears: MIDSHIPMAN_AGE }, beard: 'none' } : {};
      await ch.set({ ...look, ...young, faceRig: true, faceAnimation: true, gaze: 'ahead', animation: m.clip });
      ch.actor.setLod(FULL);
    }));
    return new OfficersView(ship, chars);
  }

  /** The six in `navy`'s dress (the match setup's choice, menu.md): their coats changed, nothing else. */
  async changeCoats(navy: Navy): Promise<void> {
    await Promise.all(this.drawn.map(({ who, ch }) => {
      const m = MEN[who], look = navyLook(ch.catalog, DRESS[navy][m.dress], m.seed, m.rank, [], navy);
      return ch.set({ outfit: look.outfit, garmentColors: look.garmentColors });
    }));
  }

  /** Each voice's character (for the speech bubbles' registry, N4.5). */
  get men(): ReadonlyMap<Officer, Character> {
    return new Map(this.drawn.map((d) => [d.who, d.ch]));
  }

  /** What the Stage's warm-up compiles: the six, taken out of their places (`afterWarm` puts them back). */
  warmObjects(): Object3D[] {
    return this.drawn.map((d) => { d.ch.object.removeFromParent(); return d.ch.object; });
  }

  afterWarm(): void {
    for (const d of this.drawn) d.place.add(d.ch.object);
  }

  /** The captain has spoken to him: he looks at the captain for a while. */
  addressed(who: Officer): void {
    const d = this.drawn.find((x) => x.who === who);
    if (d) d.looking = LOOK_SECONDS;
  }

  /**
   * Once a frame, after her pose (ShipView.update): the group follows her, the midshipman stands where `mid` says
   * (facing the captain at `captain` when near and standing), every face looks where it should and every clip plays.
   */
  animate(dt: number, camera: PerspectiveCamera, mid: Whereabouts, captain: Spot | null): void {
    this.group.matrix.copy(this.ship.group.matrixWorld);
    this.group.matrixWorldNeedsUpdate = true;
    this.group.updateWorldMatrix(true, false);
    for (const d of this.drawn) {
      if (d.who === 'midshipman') this.walkMidshipman(d, mid, captain);
      d.place.visible = d.zone.visible;
      if (!d.place.visible) continue;
      d.place.updateWorldMatrix(false, true);
      const was = d.looking;
      d.looking = Math.max(0, d.looking - dt);
      if (was > 0 && d.looking === 0) d.ch.lookAt(null);
      else if (was === 0 && d.looking > 0) d.ch.lookAt(camera);
      d.ch.update(dt);
    }
  }

  /** Where each man is on the view (px from the top left of a `width` × `height` view), for the fan's finger. */
  onScreen(camera: PerspectiveCamera, width: number, height: number): ManOnScreen[] {
    return this.drawn.map((d) => {
      this.at.set(0, CHEST, 0).applyMatrix4(d.place.matrixWorld).project(camera);
      const seen = d.place.visible && this.at.z > -1 && this.at.z < 1 && Math.abs(this.at.x) <= 1 && Math.abs(this.at.y) <= 1;
      // Behind the eye the projection turns over: his side is the other one.
      const left = this.at.z > 1 ? this.at.x > 0 : this.at.x < 0;
      return { who: d.who, x: ((this.at.x + 1) / 2) * width, y: ((1 - this.at.y) / 2) * height, seen, left };
    });
  }

  /** The midshipman where he walks or stands; standing near the captain, he faces him. */
  private walkMidshipman(d: Drawn, w: Whereabouts, captain: Spot | null): void {
    const x = w.across, z = shipZ(w.along);
    let facing = Math.atan2(w.facing[1], -w.facing[0]);
    const standing = w.share === 0 && w.way === null;
    if (standing && captain && floorApart(captain, w) < FACE_CAPTAIN) facing = Math.atan2(captain.across - x, shipZ(captain.along) - z);
    d.place.position.set(x, shipY(w.height), z);
    d.place.rotation.y = facing;
    d.zone = this.ship.zoneGroupOf(w.space);
    const clip = w.share > 0 || w.way !== null ? WALK : MEN.midshipman.clip;
    if (clip !== d.clip) { d.clip = clip; void d.ch.play(clip, CLIP_FADE); }
  }

  /** A man at his post: his feet on her floor there, facing `facing`. */
  private atPost(d: Drawn, at: Spot, facing: number): void {
    d.place.position.set(at.across, shipY(heightAt(routeNetwork(), at)), shipZ(at.along));
    d.place.rotation.y = facing;
    d.zone = this.ship.zoneGroupOf(at.space);
  }
}
