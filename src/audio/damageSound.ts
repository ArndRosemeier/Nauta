/**
 * Damage heard (plan N6.8): plays what damageHearing.ts decides (blows where she was struck, a mast going, her magazine
 * going up, fires, the sea rushing in, her breaking up) through the same engine as everything else (`SeaSound.engine`),
 * and hands back the jolts for the captain's body (body.ts `jolt`).
 *
 * Give it the steps' events as they come (`onDamage`) and call `struck` each frame before `SeaSound.hear`, whose
 * `settle` keeps only the beds set since the last frame.
 */
import type { Speaker } from './channel';
import type { SimEvent } from '../sim/step';
import { damageHits, DamageWatch, type DamageHeard, type DamageScene } from './damageHearing';
import { playHeard } from './heard';

export class DamageSound {
  private readonly watch: DamageWatch;
  private readonly out: DamageHeard = { shots: [], beds: [], jolts: [] };

  constructor(private readonly sound: Speaker, seed: number) {
    this.watch = new DamageWatch(seed);
    // The blows are fetched as soon as sound opens (about 0.9 MB): a blow heard late is heard in the wrong place. The
    // fires, the sea rushing in and her breaking up are beds, fetched when first heard.
    sound.preload(damageHits());
  }

  /** A step's events: the blows and what followed, both ships'. */
  onDamage(events: readonly SimEvent[]): void {
    this.watch.keepDamage(events);
  }

  /** One frame of `scene`: plays what is heard and returns the frame's jolts. */
  struck(scene: DamageScene): DamageHeard['jolts'] {
    const heard = this.watch.struckAt(scene, this.out);
    playHeard(this.sound, heard);
    return heard.jolts;
  }
}
