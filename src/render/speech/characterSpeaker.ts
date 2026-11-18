/**
 * An Actors man as a speaker (implementation plan N4.5, "Faces"): his bubble hangs over his head bone, his mouth moves
 * with the bubble's words (Actors' `say`: mouth shapes from the text through FaceAnimator and textToVisemes; there is
 * no voice), and while it shows he looks at the captain. Needs the character loaded with `faceAnimation` and `faceRig`
 * on. The order fan's officers (N4.4) and the crew's near pool (N4.3) put theirs in `Speakers` with this.
 */
import type { Character } from '@actors/generator';
import type { Bone, Object3D } from 'three';
import type { Point3, Speaker, Voice } from '../../app/speech/speakers';

/** How far over his head bone (the top of his neck) a bubble's tail points, m: just over his hat. */
const OVER_HEAD = 0.42;
/** How fast he speaks, as Actors counts it (1: about 13 letters a second, an officer's quick plain speech). */
const SPEAKING_RATE = 1;

/** Speaker `voice` of ship `ship` drawn as `ch`, looking at `eye` (the captain's camera) while he speaks. */
export function characterSpeaker(ch: Character, voice: Voice, ship: number, eye: Object3D): Speaker {
  let head: Bone | null = null;
  return {
    voice,
    ship,
    head(out: Point3): boolean {
      if (!ch.object.visible) return false;
      head ??= ch.actor.bones.find((b) => b.name === 'head') ?? null;
      if (!head) return false;
      head.updateWorldMatrix(true, false);
      const e = head.matrixWorld.elements;
      // The bone's place in the world (the matrix's last column), and up the world's +y over it.
      out.x = e[12]!;
      out.y = e[13]! + OVER_HEAD;
      out.z = e[14]!;
      return true;
    },
    say: (words: string): void => {
      ch.lookAt(eye);
      ch.say(words, SPEAKING_RATE);
    },
    hush: (): void => {
      ch.stopSpeaking();
      ch.lookAt(undefined);
    },
  };
}
