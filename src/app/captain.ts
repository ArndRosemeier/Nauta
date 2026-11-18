/**
 * The captain on his ship (implementation plan N2.3, N3.11): his walking body on her decks (sim/ship/deckWalk.ts), her
 * doors swinging open before him and shut behind him (sim/ship/doors.ts), and her ladders climbed hand over hand,
 * played out by @futuremagic/figure's `LadderClimb` in her own frame, so the climb rises, pitches and rolls with her and
 * slows or holds on in a hard roll (show, don't tell: no cut from the foot of a ladder to its head). Aloft the same
 * walking on the tops, the crosstrees and the bowsprit (sim/ship/aloftWalk.ts), and the rig climbed by the same figure
 * (aloftClimb.ts). Gives the eye in ship space and, climbing, the way he faces.
 */
import { LadderClimb, faceYaw, type ClimbStep, type Ladder } from '@futuremagic/figure';
import type { DeckGround, DeckIntent, Vec3 } from '@futuremagic/deck';
import { BODY, LADDER } from '../sim/rules/ships';
import { EYE_BELOW_TOP, HEAD_CLEAR } from '../sim/rules/walking';
import { floorAt, floorsUnder, headroomAt, spacesById, type ShipPlan, type Spot, type Way } from '../sim/ship/plan';
import { shipY, shipZ } from '../sim/ship/section';
import type { WalkGraph } from '../sim/ship/walk';
import { deckGround, eyeOf, ladderOffered, paceOf, spotOf, stepWalker, walkerAt, type DeckWalker, type LadderOffer } from '../sim/ship/deckWalk';
import { shutDoors, stepDoors, type Doors } from '../sim/ship/doors';
import { rigPlan, type RigPlan } from '../sim/ship/rig';
import { aloftGround, aloftOffered, stepAloftWalker, surfaceOf, walkerAloft } from '../sim/ship/aloftWalk';
import { AloftClimb, CLIMBER, walkTo as walkOnto } from './aloftClimb';

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
const walkTo = (x: number, z: number, y: number, dx: number, dz: number): ClimbStep => walkOnto(x, z, y, dx, dz, LADDER.width / 2);

/** The space he is in while he climbs the rig: none of her plan's, so no door opens for him. */
const IN_THE_RIG = 'rig';

export class Captain {
  walker: DeckWalker;
  doors: Doors;
  private readonly climb = new LadderClimb();
  /** The ladder he is on, and where he steps off it. */
  private climbing: { offer: LadderOffer; end: Spot } | null = null;
  private readonly eyeAt: [number, number, number] = [0, 0, 0];
  private readonly rig: RigPlan;
  /** Climbing the rig: the shrouds, a footrope, onto or off a top, the bowsprit (aloftClimb.ts). */
  readonly aloft: AloftClimb;

  /** Walking from a spot of her plan, or of a surface aloft (a top, the crosstrees, the bowsprit: its id for the space). */
  constructor(private readonly plan: ShipPlan, private readonly graph: WalkGraph, start: Spot) {
    this.rig = rigPlan(plan);
    this.aloft = new AloftClimb(this.rig, this.climb);
    this.aloft.deckAt = (s) => shipY(floorAt(spacesById(plan).get(s.space)!, s.along, s.across));
    this.walker = this.standing(start);
    this.doors = shutDoors(plan);
  }

  /** Standing still at a spot of her plan or of a surface aloft. */
  private standing(s: Spot): DeckWalker {
    const surface = surfaceOf(this.rig, s.space);
    return surface ? walkerAloft(this.rig, surface, s.along, s.across) : walkerAt(this.plan, s);
  }

  /** Where he may stand now: her decks round her doors as they are, or the surface aloft he is on. */
  ground(): DeckGround<string> {
    const surface = surfaceOf(this.rig, this.walker.place);
    return surface ? aloftGround(this.rig, surface) : deckGround(this.plan, this.graph, this.doors);
  }

  /** Climbing now: a ladder, or the rig (not walking a deck or a surface aloft). */
  get onLadder(): boolean {
    return this.climbing !== null || this.aloft.active;
  }

  /** Climbing, the way he faces (a yaw on her: the look turns to it); null while he walks. */
  get facing(): number | null {
    return this.onLadder ? this.climb.yaw : null;
  }

  /** Where he stands on her plan or aloft (on a ladder: the spot he steps off at; in the rig: where he is, in no space of hers). */
  get spot(): Spot {
    if (this.climbing) return this.climbing.end;
    if (this.aloft.active) return { space: IN_THE_RIG, along: -this.climb.pos.z, across: this.climb.pos.x };
    return spotOf(this.walker);
  }

  /** The ladder he is on, or null. */
  get ladder(): Way | null {
    return this.climbing?.offer.way ?? null;
  }

  /** The climb's body this frame (feet, hands and feet goals, for drawing his own body), or null. */
  get climber(): LadderClimb | null {
    return this.onLadder ? this.climb : null;
  }

  /** His eye in ship space now. */
  get eye(): readonly [number, number, number] {
    if (this.climbing) return this.climbEye();
    return this.aloft.active ? this.aloft.eyeInto(this.eyeAt) : eyeOf(this.walker, this.eyeAt);
  }

  /**
   * One frame: walking as the thumbs say, or onto and up (or down) a ladder or the rig; `up`: gravity's up in her
   * frame; `pitch`: how far he looks up (rad: on a top, looking up he climbs the shrouds over him, else he goes down).
   */
  update(intent: DeckIntent, up: Vec3, dt: number, pitch = 0): void {
    if (this.aloft.active) {
      this.aloft.stepAloft(intent, up, dt);
      const landed = this.aloft.landed;
      if (!this.aloft.active && landed) this.walker = this.standing(landed);
    } else if (!this.climbing) this.walkOnDeck(intent, up, dt, pitch);
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

  /** Walking her decks or a surface aloft, or onto a ladder or a way aloft he pushes into. */
  private walkOnDeck(intent: DeckIntent, up: Vec3, dt: number, pitch: number): void {
    const w = this.walker, surface = surfaceOf(this.rig, w.place);
    const ladder = surface ? null : ladderOffered(w, intent, this.plan);
    if (ladder) return this.startClimb(ladder);
    const aloft = aloftOffered(this.rig, w, intent, pitch);
    if (aloft) return this.aloft.start(aloft, w.x, w.floor, w.z, paceOf(w) > 0 ? Math.atan2(-w.vx, -w.vz) : intent.heading);
    this.walker = surface ? stepAloftWalker(this.rig, surface, w, intent, dt, up) : stepWalker(w, intent, this.plan, this.graph, this.doors, dt, up);
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
    const yaw = paceOf(w) > 0 ? Math.atan2(-w.vx, -w.vz) : faceYaw(foot);
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
      const beams = shipY(under.floor + headroomAt(this.plan, under.space, along, across)) - HEAD_CLEAR - EYE_BELOW_TOP;
      if (beams < top) top = beams + (top - beams) * free;
    }
    out[0] = x; out[1] = top; out[2] = z;
    return out;
  }
}
