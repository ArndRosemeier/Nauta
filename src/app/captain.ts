/**
 * The captain on his ship (implementation plan N2.3): his walking body on her decks (sim/ship/deckWalk.ts), her doors
 * swinging open before him and shut behind him (sim/ship/doors.ts), and her ladders climbed hand over hand, played out
 * by @futuremagic/figure's `LadderClimb` in her own frame, so the climb rises, pitches and rolls with her and slows or
 * holds on in a hard roll (show, don't tell: no cut from the foot of a ladder to its head). Gives the eye in ship space
 * and, on a ladder, the way he faces.
 */
import { LadderClimb, faceYaw, type ClimbStep, type Climber, type Ladder } from '@futuremagic/figure';
import type { DeckIntent, Vec3 } from '@futuremagic/deck';
import { BODY, LADDER } from '../sim/rules/ships';
import { EYE_BELOW_TOP, HEAD_CLEAR } from '../sim/rules/walking';
import { floorsUnder, overheadAt, type ShipPlan, type Spot, type Way } from '../sim/ship/plan';
import { shipY, shipZ } from '../sim/ship/section';
import type { WalkGraph } from '../sim/ship/walk';
import { eyeOf, ladderOffered, spotOf, stepWalker, walkerAt, type DeckWalker, type LadderOffer } from '../sim/ship/deckWalk';
import { shutDoors, stepDoors, type Doors } from '../sim/ship/doors';

/** The climber's body for the figure: his height (the hips at the figure's usual share of it). */
const CLIMBER: Climber = { height: BODY.height, hipHeight: 0 };
/** The walks onto and off a ladder end where the figure's walk to a rim ends: this far past its ladder's line, m (figure's ladder.ts). */
const RIM_WALK = 0.62;
/** A floor this near under the feet is the one they stand on, m (a climber's feet are a little over a rung). */
const FEET_SLACK = 0.3;
/** His head comes out from under the deck's edge into the opening over this much of his way, m either side of the edge: no jump. */
const EDGE_EASE = 0.25;

/** A ladder's two halves for the figure, in ship space: from its foot (on at the bottom) and at its head (off at the top). */
function ladderOf(way: Way): { foot: Ladder; head: Ladder } {
  const line = way.line!, [fa, fc, fh] = line.foot, [ha, hc, hh] = line.head;
  const y0 = shipY(fh), y1 = shipY(hh), rung = way.rise;
  // Into the ladder's "wall" is the way it climbs: toward its head, in ship space (x across, z aft).
  const nx = line.toward[1], nz = -line.toward[0];
  const common = { nx, nz, halfWidth: way.width / 2, rung, lean: Math.hypot(ha - fa, hc - fc) / (hh - fh) };
  return {
    foot: { ...common, x: fc, z: shipZ(fa), lo: y0 + rung, hi: y1, floor: y0, rim: false },
    head: { ...common, x: hc, z: shipZ(ha), lo: y1, hi: y1, floor: y1, rim: false },
  };
}

/** A walk (the figure's walk to a rim) that ends at a spot of the floor at height y, facing (dx, dz). */
function walkTo(x: number, z: number, y: number, dx: number, dz: number): ClimbStep {
  const n = Math.hypot(dx, dz) || 1, nx = dx / n, nz = dz / n;
  return { kind: 'walk', ladder: { x: x - nx * RIM_WALK, z: z - nz * RIM_WALK, nx, nz, lo: y, hi: y, floor: y, halfWidth: LADDER.width / 2, rim: true } };
}

export class Captain {
  walker: DeckWalker;
  doors: Doors;
  private readonly climb = new LadderClimb();
  /** The ladder he is on, and where he steps off it. */
  private climbing: { offer: LadderOffer; end: Spot } | null = null;
  private readonly eyeAt: [number, number, number] = [0, 0, 0];

  constructor(private readonly plan: ShipPlan, private readonly graph: WalkGraph, start: Spot) {
    this.walker = walkerAt(plan, start);
    this.doors = shutDoors(plan);
  }

  /** On a ladder now. */
  get onLadder(): boolean {
    return this.climbing !== null;
  }

  /** On a ladder, the way he faces (a yaw on her: the look turns to it); null while he walks. */
  get facing(): number | null {
    return this.climbing ? this.climb.yaw : null;
  }

  /** Where he stands on her plan (on a ladder: the spot he steps off at). */
  get spot(): Spot {
    return this.climbing ? this.climbing.end : spotOf(this.walker);
  }

  /** The ladder he is on, or null. */
  get ladder(): Way | null {
    return this.climbing?.offer.way ?? null;
  }

  /** The climb's body this frame (feet, hands and feet goals, for drawing his own body later), or null. */
  get climber(): LadderClimb | null {
    return this.climbing ? this.climb : null;
  }

  /** His eye in ship space now. */
  get eye(): readonly [number, number, number] {
    return this.climbing ? this.climbEye() : eyeOf(this.walker, this.eyeAt);
  }

  /** One frame: walking as the thumbs say, or onto and up (or down) a ladder; `up`: gravity's up in her frame. */
  update(intent: DeckIntent, up: Vec3, dt: number): void {
    if (!this.climbing) {
      const offer = ladderOffered(this.walker, intent, this.plan);
      if (offer) this.startClimb(offer);
      else this.walker = stepWalker(this.walker, intent, this.plan, this.graph, this.doors, dt);
    }
    if (this.climbing) {
      this.climb.up.copy(up);
      this.climb.advance(dt);
      if (!this.climb.active) {
        const end = this.climbing.end;
        this.climbing = null;
        this.climb.stop();
        this.walker = walkerAt(this.plan, end);
      }
    }
    this.doors = stepDoors(this.doors, this.plan, this.spot, dt);
  }

  private startClimb(offer: LadderOffer): void {
    const way = offer.way, { foot, head } = ladderOf(way), w = this.walker;
    const end = offer.up ? way.to : way.from, endY = shipY(floorsUnder(this.plan, end.along, end.across).find((f) => f.space.id === end.space)!.floor);
    const ex = end.across, ez = shipZ(end.along);
    const steps: ClimbStep[] = offer.up
      ? [
        { kind: 'walk', ladder: foot },
        { kind: 'foot', ladder: foot, dir: 'on' },
        { kind: 'climb', ladder: foot, from: foot.floor, to: head.floor },
        { kind: 'foot', ladder: head, dir: 'off' },
        walkTo(ex, ez, endY, ex - head.x, ez - head.z),
      ]
      : [
        walkTo(head.x, head.z, head.floor, head.nx, head.nz),
        { kind: 'foot', ladder: head, dir: 'on' },
        { kind: 'climb', ladder: foot, from: head.floor, to: foot.floor },
        { kind: 'foot', ladder: foot, dir: 'off' },
        walkTo(ex, ez, endY, ex - foot.x, ez - foot.z),
      ];
    // He starts facing the way he was walking.
    const yaw = Math.hypot(w.vx, w.vz) > 0 ? Math.atan2(-w.vx, -w.vz) : faceYaw(foot);
    this.climb.play(steps, w.x, w.floor, w.z, yaw, CLIMBER);
    this.climbing = { offer, end };
  }

  /**
   * The eye on a ladder: over the climber's feet by his height, but never through the deck over him, except through
   * the opening the ladder goes up.
   */
  private climbEye(): [number, number, number] {
    const { x, y: feet, z } = this.climb.pos, out = this.eyeAt, along = -z, across = x;
    let top = feet + BODY.height - EYE_BELOW_TOP;
    const o = this.plan.openings.find((p) => p.id === this.climbing!.offer.way.opening)!;
    // How far into the opening he is (negative: still under the deck beside it), and so how freely his head rises.
    const into = Math.min(along - o.aft, o.fore - along, across - o.port, o.starboard - across);
    const free = Math.min(1, Math.max(0, (into + EDGE_EASE) / (2 * EDGE_EASE)));
    const under = floorsUnder(this.plan, along, across).filter((f) => shipY(f.floor) <= feet + FEET_SLACK).pop();
    if (under && free < 1) {
      const beams = shipY(overheadAt(under.space, along, across)) - HEAD_CLEAR - EYE_BELOW_TOP;
      if (beams < top) top = beams + (top - beams) * free;
    }
    out[0] = x; out[1] = top; out[2] = z;
    return out;
  }
}
