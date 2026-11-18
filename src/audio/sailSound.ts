/**
 * Her sails and rigging heard under way (plan N3.9): plays what sailHearing.ts decides (the wind in her rigging by the
 * apparent wind, canvas flogging, filling and thundering aback, blocks as her lines run, her yards creaking round)
 * through the same engine as the sea, the ship and the crew (`SeaSound.engine`). Call `aloft` each frame before
 * `SeaSound.hear`, whose `settle` keeps only the beds set since the last frame.
 */
import type { Speaker } from './channel';
import type { Room } from './acoustics';
import { playHeard, type Heard } from './heard';
import { SailWatch, sailSoundIds, type SailScene } from './sailHearing';

/** Beds' ids begin so (tools/sound/sounds.json). */
const BED = 'bed/';

export class SailSound {
  private readonly watch: SailWatch;
  private readonly out: Heard = { shots: [], beds: [] };

  constructor(private readonly sound: Speaker, seed: number) {
    this.watch = new SailWatch(seed);
    // The short sounds are fetched as soon as sound opens: a sail heard filling late is heard filling wrongly. The beds
    // are fetched when first heard.
    sound.preload(sailSoundIds().filter((id) => !id.startsWith(BED)));
  }

  /** One frame: her sails and rigging as `scene` says (without its room's share, given here by `room`). */
  aloft(scene: Omit<SailScene, 'through'>, room: Room): void {
    playHeard(this.sound, this.watch.heard({ ...scene, through: room.through }, this.out));
  }
}
