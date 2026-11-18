/**
 * Walking her decks on the page (`?walk`, implementation plan N2.3): the two thumbs (walkInput.ts, lookInput.ts) move
 * the captain (captain.ts) from the quarterdeck anywhere aboard; each frame gives the standpoint the ship's view
 * draws from (the eye in ship space) and the doors' swing for her drawing. On a ladder the look turns with the climb.
 */
import { upInFrame } from '@futuremagic/deck';
import { STEP_SECONDS } from '../sim/units';
import { shipPlan } from '../sim/ship/plan';
import { rigPlan, rigWalk } from '../sim/ship/rig';
import { shipFrame, type ShipPose } from '../sim/ship/motion';
import { doorAngle, doorLeaves } from '../sim/ship/doors';
import { spotOf } from '../sim/ship/deckWalk';
import { handholdAloft, handholdNear, railToLean, type RailToLean } from '../sim/ship/handholds';
import { LEAN_OUT } from '../sim/rules/body';
import { Captain } from './captain';
import { CaptainBody, type BodyPose } from './body';
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
/** `drive` steps him at the simulation's step, s. */
const DRIVE_STEP = STEP_SECONDS;

export class Walking {
  readonly startLook = START_LOOK;
  readonly input: WalkInput;
  private readonly plan = shipPlan();
  readonly captain: Captain;
  /** His body on her deck (body.ts): what the eye and his drawn body follow. */
  readonly body: CaptainBody;
  /** His body as it was last drawn. */
  drawnBody: BodyPose | null = null;

  /**
   * Walking from the plan's station `from` (a deck station or one below; unknown or empty: the quarterdeck), or from a
   * spot of her plan written `space:along:across` (`deck:2:3.9`, m: beside her starboard rail amidships), or aloft
   * (`main-top:-0.7:1`, `main-crosstrees:-0.85:0.45`, `bowsprit:22:0`).
   */
  constructor(view: HTMLElement, from = START_STATION) {
    const [space, along, across] = from.split(':'), spot = space && Number.isFinite(Number(along)) && Number.isFinite(Number(across)) ? { space, along: Number(along), across: Number(across) } : null;
    const station = spot ?? this.plan.stations.find((s) => s.id === from) ?? this.plan.stations.find((s) => s.id === START_STATION)!;
    const graph = rigWalk(this.plan), rig = rigPlan(this.plan);
    this.captain = new Captain(this.plan, graph, station);
    const c = this.captain;
    this.body = new CaptainBody({
      stands: (x, z) => c.ground().stand(x, z, c.walker) !== null,
      handhold: () => { const s = spotOf(c.walker); return handholdAloft(rig, s.space, s.along, s.across, c.walker.floor) ?? handholdNear(this.plan, s.space, s.along, s.across, c.walker.floor); },
    });
    this.input = watchWalk(view);
  }

  /** For shots: a push held frame after frame in place of the thumbs (null: the thumbs again). */
  pressed: { forward: number; strafe: number } | null = null;

  /** One frame: the thumbs move him on her as she lies at `pose` and his body keeps its feet; returns where the eye stands and how the head is held. */
  walk(dt: number, pose: ShipPose, look: LookInput): Standpoint {
    const push = this.pressed ?? this.input.push(), c = this.captain;
    c.update({ forward: push.forward, strafe: push.strafe, heading: look.look.yaw }, upInFrame(shipFrame(pose)), dt, look.look.pitch);
    const face = c.facing;
    if (face !== null) {
      const turn = Math.atan2(Math.sin(face - look.look.yaw), Math.cos(face - look.look.yaw));
      look.look = { yaw: look.look.yaw + turn * (1 - Math.exp(-FACE_RATE * dt)), pitch: look.look.pitch };
    }
    const leanOver = c.onLadder ? null : this.leanOver(push, look.look.yaw);
    const body = this.body.follow({ pose, walker: c.walker, eye: c.eye, onLadder: c.onLadder, yaw: look.look.yaw, leanOver }, dt);
    this.drawnBody = body;
    return { name: 'walk', eye: body.eye, look: look.look, up: body.up };
  }

  /** The rail he leans out over (plan N2.11): standing by it and pushing toward it, the push turned by his look's yaw. */
  private leanOver(push: { forward: number; strafe: number }, yaw: number): RailToLean | null {
    const s = spotOf(this.captain.walker), rail = railToLean(this.plan, s.space, s.along, s.across);
    if (!rail) return null;
    // The push across her (ship space x): forward along the look (-sin yaw), strafe to its right (cos yaw).
    const across = -Math.sin(yaw) * push.forward + Math.cos(yaw) * push.strafe;
    return across * rail.side >= LEAN_OUT.push ? rail : null;
  }

  /**
   * For shots: the thumbs held at `push` for so many seconds at once while she lies at `pose` (the look set to `pitch`
   * and `yaw` if given, and turned the way he faces as he climbs); answers where he is then.
   */
  drive(push: { forward: number; strafe: number }, seconds: number, pose: ShipPose, look: LookInput, pitch?: number, yaw?: number): string {
    const c = this.captain, up = upInFrame(shipFrame(pose));
    look.look = { yaw: yaw ?? look.look.yaw, pitch: pitch ?? look.look.pitch };
    for (let t = 0; t < seconds; t += DRIVE_STEP) {
      c.update({ ...push, heading: c.facing ?? look.look.yaw }, up, DRIVE_STEP, look.look.pitch);
      if (c.facing !== null) look.look = { yaw: c.facing, pitch: look.look.pitch };
    }
    const on = c.aloft.on;
    return on ? (on.kind === 'chain' ? `${on.chain.climb.mast} ${on.chain.tier} shrouds at ${on.y.toFixed(2)} m` : on.kind === 'yard' ? `${on.surface.id} ${on.s.toFixed(2)} m out` : 'between') : c.walker.place;
  }

  /** Her doors' leaves swung as far open as each door is now (`setDoor`: the ship's view's, angle in rad from shut). */
  swingDoors(setDoor: (id: string, angle: number) => void): void {
    for (const leaf of doorLeaves(this.plan)) setDoor(leaf.id, doorAngle(this.plan, this.captain.doors, leaf.id));
  }
}
