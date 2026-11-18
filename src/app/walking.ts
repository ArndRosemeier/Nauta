/**
 * Walking her decks on the page (`?walk`, implementation plan N2.3): the two thumbs (walkInput.ts, lookInput.ts) move
 * the captain (captain.ts) from the quarterdeck anywhere aboard; each frame gives the standpoint the ship's view
 * draws from (the eye in ship space) and the doors' swing for her drawing. On a ladder the look turns with the climb.
 */
import { upInFrame } from '@futuremagic/deck';
import { shipPlan } from '../sim/ship/plan';
import { rigWalk } from '../sim/ship/rig';
import { shipFrame, type ShipPose } from '../sim/ship/motion';
import { doorAngle, doorLeaves } from '../sim/ship/doors';
import { Captain } from './captain';
import { watchWalk, type WalkInput } from './walkInput';
import type { LookInput } from './lookInput';
import type { Look } from './look';
import type { Standpoint } from './standpoints';

/** Where he starts unless told: the quarterdeck station, where the first lieutenant stands (the plan's stations). */
const START_STATION = 'quarterdeck';
/** The look he starts with: forward along her deck, a little down. */
const START_LOOK: Look = { yaw: 0, pitch: -0.1 };
/** How quickly the look turns to the way he faces on a ladder, 1/s. */
const FACE_RATE = 4;

export class Walking {
  readonly startLook = START_LOOK;
  readonly input: WalkInput;
  private readonly plan = shipPlan();
  readonly captain: Captain;

  /** Walking from the plan's station `from` (a deck station or one below; unknown or empty: the quarterdeck). */
  constructor(view: HTMLElement, from = START_STATION) {
    const station = this.plan.stations.find((s) => s.id === from) ?? this.plan.stations.find((s) => s.id === START_STATION)!;
    this.captain = new Captain(this.plan, rigWalk(this.plan), station);
    this.input = watchWalk(view);
  }

  /** One frame: the thumbs move him on her as she lies at `pose`; returns where the eye stands. */
  walk(dt: number, pose: ShipPose, look: LookInput): Standpoint {
    const push = this.input.push(), c = this.captain;
    c.update({ forward: push.forward, strafe: push.strafe, heading: look.look.yaw }, upInFrame(shipFrame(pose)), dt);
    const face = c.facing;
    if (face !== null) {
      const turn = Math.atan2(Math.sin(face - look.look.yaw), Math.cos(face - look.look.yaw));
      look.look = { yaw: look.look.yaw + turn * (1 - Math.exp(-FACE_RATE * dt)), pitch: look.look.pitch };
    }
    return { name: 'walk', eye: c.eye, look: look.look };
  }

  /** Her doors' leaves swung as far open as each door is now (`setDoor`: the ship's view's, angle in rad from shut). */
  swingDoors(setDoor: (id: string, angle: number) => void): void {
    for (const leaf of doorLeaves(this.plan)) setDoor(leaf.id, doorAngle(this.plan, this.captain.doors, leaf.id));
  }
}
