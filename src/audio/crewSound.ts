/**
 * The crew at work heard (plan N4.6): plays what crewHearing.ts decides (the boatswain's calls, bare feet, hauling,
 * the bell, the drum) through the same engine as the sea and the ship (`SeaSound.engine`). Give it the steps' events
 * as they come (`onEvents`), and call `atWork` each frame before `SeaSound.hear`, whose `settle` keeps only the beds set
 * since the last frame. Sounds on the ear's side of her decks go on the ship's own bus (close, never muffled); those
 * across a deck on the world's, muffled by the room the ear is in.
 */
import type { Speaker } from './channel';
import type { ShipPose } from '../sim/ship/motion';
import type { SimShip } from '../sim/state';
import type { SimEvent } from '../sim/step';
import type { Room } from './acoustics';
import { playHeard } from './heard';
import { CrewWatch, type CrewHeard } from './crewHearing';
import { BELL, CARRY_ON, HAUL_PULL, LIFE_CALLS, ORDER_CALLS, RUN_STEP, SAILED_CALLS, WATCH_CALL } from './crewTuning';

export class CrewSound {
  private readonly watch: CrewWatch;
  private readonly out: CrewHeard = { shots: [], beds: [] };
  /** She beats to quarters (N5.3 sets it with its order): the drum is heard while true. */
  drum = false;
  /** The sandbox's day clock (game minutes since its first day began), or null: the bell strikes by the match's clock. */
  day: number | null = null;

  /** `ship`: hers in the match (0 with no match: then only the bell is heard, `bellAlone`). */
  constructor(private readonly sound: Speaker, seed: number, ship = 0) {
    this.watch = new CrewWatch(seed, ship);
    // The calls and the short sounds are fetched as soon as sound opens (about 250 KB): a call that comes late says
    // the wrong thing. The crowd's feet and the drum are beds, fetched when first heard.
    const calls = new Set([...Object.values(ORDER_CALLS), ...Object.values(LIFE_CALLS), ...Object.values(SAILED_CALLS).flat(), CARRY_ON, WATCH_CALL].map((c) => c.id));
    sound.preload([...calls, RUN_STEP.id, HAUL_PULL.id, BELL.id]);
  }

  /** A step's events (orders done, she tacked or wore or missed stays, a job short-handed). */
  onEvents(events: readonly SimEvent[]): void {
    this.watch.note(events);
  }

  /**
   * One frame: her state now and the simulation's clock `t` (s), her pose as drawn, the ear in ship space and the room
   * it is in (`ShipSound.aboard`'s). Decided even before sound opens, so what was ordered then is not piped late.
   */
  atWork(ship: SimShip, t: number, pose: ShipPose, eye: readonly [number, number, number], room: Room): void {
    const heard = this.watch.listen({ ship, t, pose, ear: eye, below: room.below, drum: this.drum, day: this.day }, this.out);
    this.play(heard);
  }

  /** One frame on her with no match running: only the bell, every BELL_EVERY of `t`, the page's clock (s since it started). */
  bellAlone(t: number, pose: ShipPose, room: Room): void {
    this.play(this.watch.bellAlone({ t, pose, below: room.below, day: null }, this.out));
  }

  private play(heard: CrewHeard): void {
    playHeard(this.sound, heard);
  }
}
