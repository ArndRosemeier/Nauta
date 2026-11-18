/**
 * Who speaks in a bubble (implementation plan N4.5, docs/design/orders.md "Bubbles and the phrase book"), and the one
 * place the drawing tells the bubbles where a man is and moves his mouth. Pure: a `Speaker` is whatever draws a man
 * (the order fan's officers, N4.4; the crew's near pool, N4.3; a faceless stand-in at his station until they stand),
 * put here by whoever draws him. The bubble layer asks `find(ship, voice)` each frame.
 */

/** The men who speak in the first game: the officers who take orders (N4.4), the boatswain who passes them down, the surgeon. */
export const VOICES = ['master', 'first lieutenant', 'gunner', 'carpenter', 'lookout', 'midshipman', 'boatswain', 'surgeon'] as const;
export type Voice = (typeof VOICES)[number];

/** A point in the world (three's Vector3 is one). */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** A man who can be seen to speak. */
export interface Speaker {
  readonly voice: Voice;
  /** His ship, by her place in the match's ships. */
  readonly ship: number;
  /** Writes the world point just over his head into `out`; false while he is not drawn. */
  head(out: Point3): boolean;
  /** His mouth moves with `words` (no voice: Actors' mouth shapes from the text) for about `seconds`, and he looks at the captain meanwhile. */
  say(words: string, seconds: number): void;
  /** He stops speaking (his bubble went before its time). */
  hush(): void;
}

/** The men who can speak now. Several may stand for one voice (a stand-in, then the drawn man): the last put speaks. */
export class Speakers {
  private readonly all: Speaker[] = [];

  /** A man who can speak from now on. */
  put(s: Speaker): void {
    this.drop(s);
    this.all.push(s);
  }

  /** A man who no longer speaks (taken out of the drawing). */
  drop(s: Speaker): void {
    const i = this.all.indexOf(s);
    if (i >= 0) this.all.splice(i, 1);
  }

  /** Who speaks for `voice` on `ship`: the last put, or null. */
  find(ship: number, voice: Voice): Speaker | null {
    for (let i = this.all.length - 1; i >= 0; i--) {
      const s = this.all[i]!;
      if (s.ship === ship && s.voice === voice) return s;
    }
    return null;
  }
}
