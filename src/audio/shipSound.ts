/**
 * The brig herself heard (plan N2.8): her timber creaking as she works (creaks.ts), the water along her sides
 * (hullWater.ts), the slap under her counter (counter.ts), the captain's feet (footsteps.ts) and the room the ear is in
 * (acoustics.ts), played through the same engine as the sea and the wind (`SeaSound.engine`).
 *
 * Her own sounds are on the engine's `body` bus, which is never muffled: below deck her creaks and the sea against her
 * planking are right beside the ear, while the sea and the wind outside (the `world` bus) come through her planking,
 * muffled and quieter by the room (`SeaSound.hear` takes the room this returns). Both buses ring with the room's echo.
 * Call `aboard` each frame before `SeaSound.hear`, whose `settle` keeps only the beds set since the last frame.
 */
import type { Speaker } from './channel';
import type { SeaState } from '../sim/sea/sea';
import type { ShipPose } from '../sim/ship/motion';
import { shipPlan } from '../sim/ship/plan';
import { OPEN_AIR, roomAt, type Room } from './acoustics';
import { CounterWatch } from './counter';
import { CreakWatch } from './creaks';
import { Footsteps } from './footsteps';
import { HullWater, type ShipBed } from './hullWater';
import type { SlapEvent } from './slaps';
import { COUNTER, GROAN, STEP_DECK, STEP_RUNG, TIMBER } from './shipTuning';

/** Where the ear is and what the captain is doing, each frame. */
export interface Aboard {
  /** The eye in ship space. */
  readonly eye: readonly [number, number, number];
  /** Off her (a standpoint on the water): nothing of hers is heard. */
  readonly off: boolean;
  /** On a ladder: his feet fall on its treads. */
  readonly onLadder: boolean;
  /** His soles in ship space (his body's, N2.7), or null with no body: a step sounds as one comes down. */
  readonly soles: readonly (readonly [number, number, number])[] | null;
  /** Her way through the water, m/s. */
  readonly way: number;
}

export class ShipSound {
  private readonly plan = shipPlan();
  private readonly creaks: CreakWatch;
  private readonly counter = new CounterWatch();
  private readonly water: HullWater;
  private readonly feet = new Footsteps();
  private readonly beds: ShipBed[] = [];
  private readonly events: SlapEvent[] = [];
  /** The room's echo now (null: not set yet), so the engine is told only of a change. */
  private echoed: { t60: number; wet: number } | null = null;

  constructor(private readonly engine: Speaker, seed: number) {
    this.creaks = new CreakWatch(seed);
    this.water = new HullWater(seed);
    // The short sounds are fetched as soon as sound opens: a footstep or a creak that arrives late is left out.
    engine.preload([TIMBER.id, GROAN.id, COUNTER.id, STEP_DECK.id, STEP_RUNG.id]);
  }

  /** One frame of `dt` s at time `t`, her at `pose` on `sea`: plays what of her is heard, and returns the room the ear is in. */
  aboard(pose: ShipPose, sea: SeaState, t: number, dt: number, a: Aboard): Room {
    const e = this.engine;
    if (!e.open) return OPEN_AIR;
    const room = a.off ? OPEN_AIR : roomAt(this.plan, a.eye);
    this.echo(room);
    if (a.off) return room;
    for (const b of this.water.beds(pose, sea, t, dt, a.way, a.eye, room.below, this.beds)) {
      e.bed(b.id, b.level, { glide: b.glide, bus: b.bus, ...(b.at ? { at: b.at, ref: b.ref } : {}) }, b.key);
    }
    for (const c of this.creaks.creaks(pose, dt, a.eye, room.below, this.events)) e.play(c.kind.id, { at: c.at, ref: c.kind.ref, gain: c.kind.gain * c.gain, bus: 'body' });
    for (const s of this.counter.slaps(pose, sea, t, dt, this.events)) e.play(s.kind.id, { at: s.at, ref: s.kind.ref, gain: s.kind.gain * s.gain });
    const step = this.feet.footfall({ eye: a.eye, soles: a.soles, onLadder: a.onLadder, below: room.below }, dt);
    if (step) e.play(step.id, { gain: step.gain, pitch: step.pitch, bus: 'body' });
    return room;
  }

  private echo(room: Room): void {
    if (this.echoed && this.echoed.t60 === room.t60 && this.echoed.wet === room.wet) return;
    this.echoed = { t60: room.t60, wet: room.wet };
    this.engine.echo(room.t60, room.wet);
  }
}
