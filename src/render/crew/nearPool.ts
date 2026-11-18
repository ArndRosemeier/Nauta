/**
 * The near pool (implementation plan N4.3, "How 240 men are drawn"): a few full Actors characters, each with a living
 * face, handed from man to man of her crew as the captain moves, so the men within reach of him and the officer he is
 * speaking to are seen with the face, dress and hands a close look deserves. A character taken for a man is dressed
 * as him (crewLooks.ts `fullLook`: as his crowd figure looks), then takes over from his crowd figure in the same pose at
 * the same instant of his motion while the figure fades out (Actors' `crowdToCharacter`); given back, the figure fades
 * in again (`characterToCrowd`) and the character is hidden once the fade is done. Each keeps only the levels of detail
 * seen near (Full and Medium); his face follows app/faces.ts.
 */
import { Group, Mesh, type Object3D, type WebGPURenderer } from 'three/webgpu';
import { Character, characterToCrowd, crowdToCharacter, type CharacterCatalog, type CharacterPatch } from '@actors/generator';
import type { CrowdFigures, CrowdMan } from '@actors/three';
import { nodeMaterials } from '@actors/three/webgpu';
import HumanWorker from '@actors/human/worker?worker';
import { packCatalog } from '../../app/crewLooks';
import { FULL, MEDIUM } from '../../app/crewDrawn';
import type { FaceState } from '../../app/faces';

/** The hand-over's fade, s (Actors' default): a dither, so nothing is sorted. */
export const HANDOVER_SECONDS = 0.3;
/** Workers that shape the pool's men (re-dressing one is a reshape). */
const WORKERS = 2;
/** `free`'s weight for the character last dressed as the man himself, over one dressed alike (2) and the level wanted (1). */
const HIMSELF = 4;

/** One character of the pool. */
export interface PoolChar {
  readonly ch: Character;
  /** Where he stands, in her ship space (scaled to the man's height); the character inside. */
  readonly place: Group;
  /** He keeps Actors' Full level (fingers and all) as well as Medium. */
  readonly full: boolean;
  /** The man (key) he is, or is being dressed as; null when free. */
  man: number | null;
  /** Dressed as his man and shown. */
  shown: boolean;
  /** Being dressed: the man he is dressed for. */
  dressing: number | null;
  /** The man he was last dressed as (kept when he is given back: taken for him again, he needs no dressing). */
  as: number | null;
  /** What he wears and his build, as a key (`wearing`): a man who wears the same is dressed by his colours alone. */
  wears: string | null;
  /** Seconds left of a fade back to the crowd, after which he is hidden. */
  leaving: number;
  level: number;
  clip: string | null;
  shadow: boolean;
  /** Seconds he still looks at the captain. */
  looking: number;
  /** Words he is to say once shown, and until when (page seconds). */
  words: { text: string; until: number } | null;
  readonly face: FaceState;
  readonly units: Record<string, number>;
}

export class NearPool {
  readonly chars: PoolChar[];

  private constructor(chars: Character[], full: number) {
    this.chars = chars.map((ch, i) => {
      const place = new Group();
      place.add(ch.object);
      place.visible = false;
      return { ch, place, full: i < full, man: null, shown: false, dressing: null, as: null, wears: null, leaving: 0, level: MEDIUM, clip: null, shadow: true, looking: 0, words: null, face: {}, units: {} };
    });
  }

  /**
   * `size` characters sharing `workbench`'s pack, each with a living face, dressed as `first`: the first `full` of them
   * keep Actors' Full level and Medium, the rest Medium only (a character at Full holds several times the memory).
   */
  static async load(renderer: WebGPURenderer, pack: string, workbench: Character, size: number, full: number, first: CharacterPatch): Promise<NearPool> {
    const workers = Array.from({ length: WORKERS }, () => new HumanWorker());
    const chars = await Promise.all(Array.from({ length: size }, async (_, i) => {
      const ch = await Character.load({ pack, renderer, materials: nodeMaterials, shareWith: workbench, worker: workers[i % WORKERS], catalog: packCatalog, levels: i < full ? [FULL, MEDIUM] : [MEDIUM] });
      await ch.set({ ...first, faceRig: true, faceAnimation: true, gaze: 'ahead', animation: 'idle' });
      ch.setLod(MEDIUM);
      return ch;
    }));
    return new NearPool(chars, full);
  }

  /** The catalogue the pool dresses from. */
  get catalog(): CharacterCatalog {
    return this.chars[0]!.ch.catalog;
  }

  /**
   * Dresses the pool, a few at a time, in each of `looks` at Full and at Medium, and hands each state to `warm` (the
   * Stage's warm-up: the characters taken out of their places, as it builds the shadow shaders only of what has no
   * parent), so dressing a man later builds no shader on the render path. Puts them back hidden.
   */
  async warm(looks: readonly CharacterPatch[], warm: (objects: Object3D[], what: string) => Promise<void>): Promise<void> {
    for (const level of [MEDIUM, FULL]) {
      const chars = this.chars.filter((p) => level === MEDIUM || p.full);
      for (let k = 0; chars.length && k < looks.length; k += chars.length) {
        const batch = looks.slice(k, k + chars.length), used = chars.slice(0, batch.length);
        await Promise.all(used.map((p, i) => p.ch.set(batch[i]!)));
        for (const p of used) { p.ch.setLod(level); p.ch.update(0); p.ch.object.removeFromParent(); }
        await warm(used.map((p) => p.ch.object), `${level === FULL ? 'full detail' : 'the pool'}, ${Math.min(k + batch.length, looks.length)} of ${looks.length} dresses`);
        for (const p of used) p.place.add(p.ch.object);
      }
    }
    for (const p of this.chars) { p.ch.setLod(MEDIUM); p.level = MEDIUM; p.as = null; p.wears = null; }
  }

  /**
   * A free character (not dressed for anyone, not fading out) for man `man`, who wears `wears`, or null: the one last
   * dressed as him, else one dressed alike, else any; among those alike, one that keeps Full detail first if `full`.
   */
  free(full: boolean, man: number, wears: string): PoolChar | null {
    let best: PoolChar | null = null, score = -1;
    for (const p of this.chars) {
      if (p.man !== null || p.leaving > 0 || p.dressing !== null) continue;
      const s = (p.as === man ? HIMSELF : 0) + (p.wears === wears ? 2 : 0) + (p.full === full ? 1 : 0);
      if (s > score) { best = p; score = s; }
    }
    return best;
  }

  /** Whether `p` is dressed as man `man` already (taken for him, he needs no dressing). */
  dressedAs(p: PoolChar, man: number): boolean {
    return p.as === man && p.dressing === null;
  }

  /** The character that is, or is becoming, man `man`. */
  of(man: number): PoolChar | null {
    return this.chars.find((p) => p.man === man) ?? null;
  }

  /** Dresses `p` as a man (`look`), then hands his crowd figure over to him in the same pose; `crowd` is read when the dress is done. */
  takeOver(p: PoolChar, man: number, look: CharacterPatch, wears: string, figures: CrowdFigures, crowd: () => CrowdMan | null, ready: (p: PoolChar) => void): void {
    const dressed = p.as === man;
    p.man = man;
    p.dressing = man;
    p.as = man;
    p.wears = wears;
    void (dressed ? Promise.resolve() : p.ch.set(look)).then(async () => {
      p.dressing = null;
      const c = crowd();
      if (p.man !== man || !c) { if (p.man === man) p.man = null; return; }
      ready(p);
      await crowdToCharacter(figures, c, p.ch, HANDOVER_SECONDS);
      p.clip = c.playing?.clip ?? null;
      p.place.visible = true;
      p.shown = true;
    });
  }

  /** Gives `p`'s man back to his crowd figure: it fades in, and `p` is hidden once the fade is done. */
  giveBack(p: PoolChar, figures: CrowdFigures, crowd: CrowdMan | null): void {
    if (p.shown && crowd) characterToCrowd(figures, crowd, p.ch, HANDOVER_SECONDS);
    else if (crowd) figures.fade(crowd, 1);
    p.leaving = p.shown ? HANDOVER_SECONDS : 0;
    if (!p.shown) p.place.visible = false;
    p.man = null;
    p.shown = false;
    p.looking = 0;
    p.words = null;
    if (p.ch.faceAnimator) p.ch.stopSpeaking();
    p.ch.lookAt(undefined);
  }

  /** Counts the fades back down and hides those done. */
  fadeOut(dt: number): void {
    for (const p of this.chars) {
      if (p.leaving <= 0) continue;
      p.leaving -= dt;
      if (p.leaving <= 0 && p.man === null) p.place.visible = false;
    }
  }

  /** Whether `p` casts the sun's shadow. */
  shade(p: PoolChar, on: boolean): void {
    if (p.shadow === on) return;
    p.shadow = on;
    p.ch.object.traverse((m) => { if ((m as Mesh).isMesh) m.castShadow = on; });
  }
}
