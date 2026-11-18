/**
 * The sea and the wind heard (plan N1.7): the ambience (ambience.ts) and the slaps near the listener (slaps.ts) played
 * through `@futuremagic/audio`'s engine, through the room the ear is in (plan N2.8, acoustics.ts). Sound starts with the first tap or click (Safari's rule; the engine listens for
 * it and resumes after the browser suspends it); until then this does nothing.
 */
import { AudioEngine, type Vec3 } from '@futuremagic/audio/web';
import { seaAt, seaSample, type SeaState } from '../sim/sea/sea';
import { windAt, type Wind, type WindState } from '../sim/wind';
import { apparentSpeed, type Sailing } from '../sim/ship/sailing';
import { bedLevels, seaForce, type BedLevel } from './ambience';
import { SlapWatch, type SlapEvent } from './slaps';
import type { Room } from './acoustics';
import { SOUND_MEMORY, UNDER_WATER_HZ } from './tuning';

/** The way of a ship through the water: her heading, way ahead and leeway (sailing.ts). */
export type Way = Pick<Sailing, 'heading' | 'ahead' | 'leeway'>;

/** Safari's audio session for a game: sound plays even when the device is set to silent, as a video's does. */
interface AudioSessionNavigator { audioSession?: { type: string } }

export class SeaSound {
  readonly engine: AudioEngine;
  /** The sea and the wind's own level, 0..1 (the player's setting, plan N7.3; channel.ts for the other parts). */
  level = 1;
  private readonly watch: SlapWatch;
  private readonly beds: BedLevel[] = [];
  private readonly slaps: SlapEvent[] = [];
  private readonly water = seaSample();
  private blow: Wind | null = null;
  /** The low-pass now (null: open), so the engine is told only of a change. */
  private muffled: number | null = null;

  /** `base`: the page's base URL (the sounds are in its `sound/`); `seed`: the match's. */
  constructor(base: string, private readonly seed: number) {
    const nav = navigator as Navigator & AudioSessionNavigator;
    if (nav.audioSession) nav.audioSession.type = 'playback';
    this.engine = new AudioEngine({ base: `${base}sound/`, seed, budget: SOUND_MEMORY });
    this.watch = new SlapWatch(seed);
  }

  /**
   * Every frame: what the listener at `eye` looking along `look` (with `up` the top of their head) hears of the sea and
   * the wind at time `t`, in `room` (acoustics.ts: below deck the sea and the wind come through her planking, muffled
   * and quieter; `ShipSound.aboard` gives it, `OPEN_AIR` off her). `way`: the way of the ship the ear is aboard (plan
   * N3.9): the wind is heard as she feels it, the apparent wind (running before it she is quiet, close-hauled loud).
   */
  hear(sea: SeaState, wind: WindState, t: number, eye: Vec3, look: Vec3, up: Vec3, room: Room, way?: Way): void {
    const e = this.engine;
    if (!e.open) return;
    e.listen(eye, look, up);
    const force = seaForce(sea, t);
    this.blow = windAt(wind, eye[0], eye[2], t, this.blow ?? undefined);
    seaAt(sea, eye[0], eye[2], t, this.water);
    bedLevels({ seaForce: force, windSpeed: way ? apparentSpeed(way, this.blow) : this.blow.speed, rise: this.water.velocity[1], t }, this.seed, this.beds);
    for (const b of this.beds) e.bed(b.id, b.level * room.through * this.level, { glide: b.glide });
    e.settle();
    for (const s of this.watch.listen(sea, t, eye[0], eye[2], force, this.slaps)) e.play(s.kind.id, { at: s.at, gain: s.kind.gain * s.gain * room.through * this.level, ref: s.kind.ref });
    this.muffle(eye[1] < this.water.height ? UNDER_WATER_HZ : room.muffle);
    e.update();
  }

  private muffle(hz: number | null): void {
    if (hz === this.muffled) return;
    this.muffled = hz;
    this.engine.muffle(hz);
  }
}
