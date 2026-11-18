/**
 * Gunfire heard (plan N5.6): plays what gunHearing.ts decides (each gun's report, shot passing and splashing, the ears
 * ringing) through the same engine as the sea, the ship, the sails and the crew (`SeaSound.engine`), and hands back the
 * jolts of her own guns for the captain's body (body.ts `jolt`) and the room as a deafened ear hears it.
 *
 * Give it the steps' events as they come (`onFired`) and call `roar` each frame after `ShipSound.aboard`: the room it
 * returns is the one the crew, the sails and the sea are heard through (deafened, the world bus is dull and quieter).
 */
import type { AudioEngine } from '@futuremagic/audio/web';
import type { SimEvent } from '../sim/step';
import type { Room } from './acoustics';
import { deafened, GunWatch, type GunHeard, type GunScene } from './gunHearing';
import { GUN_FAR, GUN_NEAR, GUN_THROUGH, RING, SHOT_PASS, SHOT_SPLASH } from './gunTuning';
import { playHeard } from './heard';

export class GunSound {
  private readonly watch = new GunWatch();
  private readonly out: GunHeard = { shots: [], beds: [], jolts: [], deaf: 0, ring: 0 };

  constructor(private readonly sound: AudioEngine) {
    // Every take is fetched as soon as sound opens (about 0.8 MB): a report that comes late is a gun not heard.
    sound.preload([GUN_NEAR.id, GUN_FAR.id, GUN_THROUGH.id, SHOT_PASS.id, SHOT_SPLASH.id, RING.id]);
  }

  /** A step's events: the guns fired in it, both ships'. */
  onFired(events: readonly SimEvent[]): void {
    this.watch.keepFired(events);
  }

  /**
   * One frame of `scene` (the match's clock as drawn, the ear in the world and in ship space, the ship it is aboard,
   * whether it is below), in `room` (`ShipSound.aboard`'s): plays what is heard and returns the frame's jolts and the
   * room the rest is heard through.
   */
  roar(scene: GunScene, room: Room): { jolts: GunHeard['jolts']; room: Room } {
    const heard = this.watch.heardAt(scene, this.out);
    playHeard(this.sound, heard);
    if (heard.ring > 0 && this.sound.open) this.sound.play(RING.id, { gain: heard.ring, bus: 'ui' });
    return { jolts: heard.jolts, room: deafened(room, heard.deaf) };
  }
}
