/**
 * The captain climbing the rig (implementation plan N3.11), played out by @futuremagic/figure's `LadderClimb` in her
 * own frame, like her ladders below (captain.ts): up the shrouds hand over hand, out round the futtock shrouds and
 * over the rim onto a top, up the topmast shrouds to the crosstrees, across onto a yard's footrope and out along it,
 * up onto the bowsprit and out on the jib-boom's footropes. Show, don't tell: every move between two of them is seen.
 *
 * The left thumb steers him as it walks him: on the shrouds forward climbs and back goes down, he hangs on where he
 * stops; level with a yard's footrope a push toward it takes him across onto it; on a footrope he sidles the way he is
 * pushed along it, and pushed in past where he got on he goes back. Getting on and off (onto the shrouds from her
 * rail, over a rim, onto a footrope) plays to its end. At sea the climb slows as she heels and in a hard roll he stops
 * and holds on (the figure's `pace` and `grip`): he never falls.
 *
 * Ship space (sim/ship/section.ts): x across her (+ starboard), y up from her load waterline, z aft.
 */
import { CLIMB_V, FOOTROPE_DUR, LadderClimb, RUNG, SIDLE_V, yardPoint, type ClimbStep, type Climber, type Ladder, type OnLadder, type Yard } from '@futuremagic/figure';
import type { DeckIntent, Vec3 } from '@futuremagic/deck';
import { BODY } from '../sim/rules/ships';
import { EYE_BELOW_TOP, FOOTROPE_REACH, YARD_BEND } from '../sim/rules/walking';
import type { AloftSurface } from '../sim/ship/aloft';
import { aloftWay, bowspritStep, floorAloft, surfaceOf, type AloftOffer, type Chain } from '../sim/ship/aloftWalk';
import { pushOf } from '../sim/ship/deckWalk';
import type { RigPlan } from '../sim/ship/rig';
import { shipZ } from '../sim/ship/section';
import type { Spot } from '../sim/ship/plan';

/** The climber's body for the figure: his height (the hips at the figure's usual share of it, `HIP_SHARE_FIGURE`). */
export const CLIMBER: Climber = { height: BODY.height, hipHeight: 0 };
/** The figure's hips over the feet as a share of the height, when the climber gives none (figure's ladder.ts). */
const HIP_SHARE_FIGURE = 0.52;
/** The figure's speeds are for a climber this tall, m, and go with the root of the height. */
const FIGURE_HEIGHT = 1.8;
const SPEED_SCALE = Math.sqrt(BODY.height / FIGURE_HEIGHT);
/** The figure's walk to a rim ends this far past its ladder's line, m; a climber hangs this far out from the rungs, m (figure's ladder.ts). */
export const RIM_WALK = 0.62;
const HANG = 0.36;
/** A push this small is none (share of a full one). */
const LEAST_PUSH = 0.2;
/** Turning to face a yard before stepping down onto its footrope from a spar, s. */
const TURN_SECONDS = 0.6;

/** Where he ends after a move played out: on the shrouds, on a footrope, or standing (on her deck or a surface aloft). */
type After =
  | { readonly on: 'chain'; readonly chain: Chain; readonly y: number }
  | { readonly on: 'yard'; readonly yard: Yard; readonly surface: AloftSurface; readonly at: number; readonly back: Back }
  | { readonly on: 'stand'; readonly spot: Spot }
  /** Over a rim onto a surface, standing where the figure's move left him. */
  | { readonly on: 'over'; readonly surface: string };
/** Where a footrope is got off back to: the shrouds he came across from, or where he stood. */
type Back = { readonly on: 'chain'; readonly chain: Chain; readonly y: number } | { readonly on: 'stand'; readonly spot: Spot; readonly feet: readonly [number, number, number] };

type State =
  | { readonly on: 'play'; readonly then: After; readonly footrope: 'on' | 'off' | null; t: number }
  | { readonly on: 'chain'; readonly chain: Chain; y: number; up: boolean }
  | { readonly on: 'yard'; readonly yard: Yard; readonly surface: AloftSurface; readonly at: number; readonly back: Back; s: number };

/** A walk (the figure's walk to a rim) that ends at (x, z) on a floor at height y, facing (dx, dz). */
export function walkTo(x: number, z: number, y: number, dx: number, dz: number, halfWidth: number): ClimbStep {
  const n = Math.hypot(dx, dz) || 1, nx = dx / n, nz = dz / n;
  return { kind: 'walk', ladder: { x: x - nx * RIM_WALK, z: z - nz * RIM_WALK, nx, nz, lo: y, hi: y, floor: y, halfWidth, rim: true } };
}

/** The ladder of a chain at a height, and the feet's height over its base there. */
function ladderAt(chain: Chain, y: number): OnLadder {
  const l = chain.rim && y > chain.rim.lo ? chain.rim : chain.bottom;
  return { ladder: l, h: y - (l.rim ? l.lo : l.floor) };
}

/** The bowsprit's edge got up over from her deck beside its heel, on a side: a rim with two steps under it. */
function bowspritEdge(rig: RigPlan, side: number, deckY: number, along?: number): Ladder {
  const spar = surfaceOf(rig, 'bowsprit')!, step = bowspritStep(side, along);
  return { x: side * RIM_WALK, z: shipZ(step.along), nx: -side, nz: 0, lo: deckY - 2 * RUNG, hi: deckY, floor: floorAloft(spar, step.along), halfWidth: HANG, rim: true };
}

export class AloftClimb {
  private state: State | null = null;
  /** Where he ended the last move, once it ends with him standing: the captain walks on from there. */
  landed: Spot | null = null;

  constructor(private readonly rig: RigPlan, readonly climb: LadderClimb) {}

  get active(): boolean {
    return this.state !== null;
  }

  /** On a footrope, or bent over to it or up from it: how far (0..1). */
  private get bend(): number {
    const s = this.state;
    if (!s || s.on === 'chain') return 0;
    if (s.on === 'yard') return 1;
    if (!s.footrope) return 0;
    const u = Math.min(1, s.t / FOOTROPE_DUR), b = smooth(Math.min(1, Math.max(0, (u - BEND_FROM) / (BEND_TO - BEND_FROM))));
    return s.footrope === 'on' ? b : 1 - b;
  }

  /** His eye in ship space: over his feet, bent forward over the yard on a footrope. */
  eyeInto(out: [number, number, number]): [number, number, number] {
    const c = this.climb, hips = HIP_SHARE_FIGURE * BODY.height, back = BODY.height - EYE_BELOW_TOP - hips, lean = this.bend * YARD_BEND;
    const ahead = back * Math.sin(lean);
    out[0] = c.pos.x - Math.sin(c.yaw) * ahead;
    out[1] = c.pos.y + hips + back * Math.cos(lean);
    out[2] = c.pos.z - Math.cos(c.yaw) * ahead;
    return out;
  }

  /** Start a way aloft he was offered, standing at feet (x, y, z) facing `yaw` on her deck or a surface aloft. */
  start(offer: AloftOffer, x: number, y: number, z: number, yaw: number): void {
    const rig = this.rig;
    if (offer.to === 'chain') {
      const { chain, up } = offer;
      if (up && chain.tier === 'lower') return this.begin([{ kind: 'foot', ladder: chain.bottom, dir: 'on' }], x, y, z, yaw, { on: 'chain', chain, y: chain.bottom.floor });
      if (up) {
        // From a top or the crosstrees: to the rim beside the shrouds, facing them, and onto them.
        const l = chain.bottom;
        return this.begin([walkTo(l.x + l.nx * RIM_WALK / 2, l.z + l.nz * RIM_WALK / 2, y, l.nx, l.nz, l.halfWidth), { kind: 'foot', ladder: l, dir: 'on' }], x, y, z, yaw, { on: 'chain', chain, y: l.floor });
      }
      const rim = chain.rim!;
      return this.begin([{ kind: 'walk', ladder: rim }, { kind: 'rim', ladder: rim, dir: 'on' }], x, y, z, yaw, { on: 'chain', chain, y: this.climb.rimFeet(rim, CLIMBER) });
    }
    if (offer.to === 'bowsprit') {
      const edge = bowspritEdge(rig, offer.side, y, offer.along), step = bowspritStep(offer.side, offer.along);
      return this.begin([
        walkTo(offer.side * (RIM_WALK + HANG), shipZ(step.along), y, -offer.side, 0, HANG),
        { kind: 'ledge', ledge: { x: edge.x, z: edge.z, nx: edge.nx, nz: edge.nz, floor: edge.floor }, feet: y },
      ], x, y, z, yaw, { on: 'stand', spot: { space: 'bowsprit', along: step.along, across: 0 } });
    }
    if (offer.to === 'deck') {
      const step = bowspritStep(offer.side), edge = bowspritEdge(rig, offer.side, this.deckAt(step));
      return this.begin([
        { kind: 'walk', ladder: edge }, { kind: 'rim', ladder: edge, dir: 'on' },
        walkTo(step.across, shipZ(step.along), edge.hi, 0, 1, HANG),
      ], x, y, z, yaw, { on: 'stand', spot: step });
    }
    // Out onto the jib-boom: turned to face it, down onto its horse on a side.
    const way = aloftWay(rig, `jib-boom-${offer.side > 0 ? 's' : 'p'}`), surface = surfaceOf(rig, way.to.space)!, yard = surface.yard!;
    const at = alongYard(yard, way.to), feet = [x, y, z] as const;
    this.begin([{ kind: 'turn', to: Math.atan2(-yard.nx, -yard.nz), dur: TURN_SECONDS }, { kind: 'footrope', yard, dir: 'on', at, from: feet }], x, y, z, yaw,
      { on: 'yard', yard, surface, at, back: { on: 'stand', spot: { space: 'bowsprit', along: -z, across: x }, feet } }, 'on');
  }

  /** Her deck's floor at the bowsprit's step (ship space y), as the walk there left him: set by the captain. */
  deckAt: (spot: Spot) => number = () => 0;

  /** One frame of the climb: the left thumb's push (`intent`, `heading` the look's yaw), gravity's up in her frame. */
  stepAloft(intent: DeckIntent, up: Vec3, dt: number): void {
    const s = this.state, c = this.climb;
    if (!s) return;
    c.up.set(up.x, up.y, up.z);
    if (s.on === 'play') {
      c.advance(dt);
      s.t += dt;
      if (!c.active) this.arrive(s.then);
    } else if (s.on === 'chain') this.onChain(s, intent, dt);
    else this.onYard(s, intent, dt);
  }

  /** On the shrouds: up or down as pushed, hanging on where he stops; across onto a footrope; over the rim at the head, off at the foot. */
  private onChain(s: Extract<State, { on: 'chain' }>, intent: DeckIntent, dt: number): void {
    const c = this.climb, chain = s.chain;
    const push = Math.abs(intent.forward) >= LEAST_PUSH ? Math.max(-1, Math.min(1, intent.forward)) : 0;
    if (push) s.up = push > 0;
    let at = ladderAt(chain, s.y);
    // Feel the sea for this frame's pace.
    c.cling(at.ladder, at.h, s.up, CLIMBER, dt);
    const across = this.footropeBeside(chain, s.y, intent);
    if (across) {
      const from: OnLadder = at, yard = across.surface.yard!, spot = alongYard(yard, across.to);
      this.begin([{ kind: 'footrope', yard, dir: 'on', at: spot, from }], c.pos.x, c.pos.y, c.pos.z, c.yaw,
        { on: 'yard', yard, surface: across.surface, at: spot, back: { on: 'chain', chain, y: s.y } }, 'on');
      return;
    }
    const top = chain.rim ? c.rimFeet(chain.rim, CLIMBER) : chain.bottom.hi - (chain.bottom.rung ?? RUNG);
    const y = s.y + push * CLIMB_V * SPEED_SCALE * c.pace * dt;
    if (push > 0 && y >= top && chain.rim && chain.above) {
      this.begin([{ kind: 'rim', ladder: chain.rim, dir: 'off' }], c.pos.x, c.pos.y, c.pos.z, c.yaw, { on: 'over', surface: chain.above });
      return;
    }
    if (push < 0 && y <= chain.bottom.floor) {
      const b = chain.below, floor = chain.tier === 'lower' ? this.deckAt(b) : floorAloft(surfaceOf(this.rig, b.space)!, b.along), l = chain.bottom;
      this.begin([{ kind: 'foot', ladder: l, dir: 'off' }, walkTo(b.across, shipZ(b.along), floor, l.nx, l.nz, l.halfWidth)], c.pos.x, c.pos.y, c.pos.z, c.yaw, { on: 'stand', spot: b });
      return;
    }
    s.y = Math.min(top, Math.max(chain.bottom.floor, y));
    at = ladderAt(chain, s.y);
    c.cling(at.ladder, at.h, s.up, CLIMBER, 0);
  }

  /** A footrope he steps across onto from the shrouds: level with it and pushing toward it, more aside than up or down. Null: none. */
  private footropeBeside(chain: Chain, y: number, intent: DeckIntent): { surface: AloftSurface; to: Spot } | null {
    if (Math.abs(intent.strafe) < LEAST_PUSH || Math.abs(intent.strafe) <= Math.abs(intent.forward)) return null;
    const c = this.climb, p = pushOf(intent);
    for (const w of this.rig.ways) {
      if (w.kind !== 'footrope' || w.ladders[0] !== chain.bottom || w.at === null || Math.abs(y - w.at) > FOOTROPE_REACH) continue;
      // Toward the nearest point of the footrope on his side (already beside it: any push aside).
      const surface = surfaceOf(this.rig, w.to.space)!, yard = surface.yard!, inner = alongYard(yard, w.to), out = Math.sign(inner);
      const s = out * Math.min(yard.reach, Math.max(Math.abs(inner), out * ((c.pos.x - yard.x) * yard.ax + (c.pos.z - yard.z) * yard.az)));
      yardPoint(yard, s, 0, 0, near);
      const da = c.pos.z - near.z, dc = near.x - c.pos.x, n = Math.hypot(da, dc);
      if (n < FOOTROPE_NEAR || (p.along * da + p.across * dc) / n >= FOOTROPE_AIM) return { surface, to: w.to };
    }
    return null;
  }

  /** On a footrope: sidling the way he is pushed along it, out to its end; in past where he got on, back. */
  private onYard(s: Extract<State, { on: 'yard' }>, intent: DeckIntent, dt: number): void {
    const c = this.climb, yard = s.yard, p = pushOf(intent);
    c.sidle(yard, s.s, CLIMBER, dt);
    // The push in ship space (x across, z aft) along the yard.
    const along = p.push >= LEAST_PUSH ? p.push * (p.across * yard.ax - p.along * yard.az) : 0;
    const out = Math.sign(s.at) || 1, ds = along * SIDLE_V * SPEED_SCALE * c.pace * dt;
    const next = s.s + ds;
    if (along * out < 0 && (next - s.at) * out <= 0) {
      const back = s.back, from: OnLadder | readonly [number, number, number] = back.on === 'chain' ? ladderAt(back.chain, back.y) : back.feet;
      const then: After = back.on === 'chain' ? { on: 'chain', chain: back.chain, y: back.y } : { on: 'stand', spot: back.spot };
      this.begin([{ kind: 'footrope', yard, dir: 'off', at: s.at, from }], c.pos.x, c.pos.y, c.pos.z, c.yaw, then, 'off');
      return;
    }
    s.s = out > 0 ? Math.min(yard.reach, Math.max(s.at, next)) : Math.max(-yard.reach, Math.min(s.at, next));
    c.sidle(yard, s.s, CLIMBER, 0);
  }

  /** How far out along its yard he is, m (signed as the yard's own: + toward its `ax` arm). */
  get yardOut(): number | null {
    return this.state?.on === 'yard' ? this.state.s : null;
  }

  /** What he is on: the shrouds at a tier, a footrope, or a move between. */
  get on(): { readonly kind: 'chain'; readonly chain: Chain; readonly y: number } | { readonly kind: 'yard'; readonly surface: AloftSurface; readonly s: number } | { readonly kind: 'moving' } | null {
    const s = this.state;
    if (!s) return null;
    if (s.on === 'chain') return { kind: 'chain', chain: s.chain, y: s.y };
    if (s.on === 'yard') return { kind: 'yard', surface: s.surface, s: s.s };
    return { kind: 'moving' };
  }

  private begin(steps: ClimbStep[], x: number, y: number, z: number, yaw: number, then: After, footrope: 'on' | 'off' | null = null): void {
    this.climb.play(steps, x, y, z, yaw, CLIMBER);
    this.state = { on: 'play', then, footrope, t: 0 };
    this.landed = null;
  }

  private arrive(then: After): void {
    const c = this.climb;
    if (then.on === 'chain') {
      this.state = { on: 'chain', chain: then.chain, y: then.y, up: true };
      const at = ladderAt(then.chain, then.y);
      c.cling(at.ladder, at.h, true, CLIMBER, 0);
    } else if (then.on === 'yard') {
      this.state = { on: 'yard', yard: then.yard, surface: then.surface, at: then.at, back: then.back, s: then.at };
      c.sidle(then.yard, then.at, CLIMBER, 0);
    } else {
      // Standing: over a rim where the figure's move put him; elsewhere at the spot the move was made for.
      this.landed = then.on === 'over' ? { space: then.surface, along: -c.pos.z, across: c.pos.x } : then.spot;
      this.state = null;
      c.stop();
    }
  }

  /** Let go of the rig at once (he is put elsewhere). */
  stop(): void {
    this.state = null;
    this.climb.stop();
  }
}

/** Bent over a footrope: the body goes over between these shares of the move onto it (figure's ladder.ts). */
const BEND_FROM = 0.2;
const BEND_TO = 0.85;
/** How straight at a footrope he must push to step across onto it (cosine of the most angle). */
const FOOTROPE_AIM = 0.5;
/** Nearer than this to a footrope (m, in plan) any push aside takes him across onto it. */
const FOOTROPE_NEAR = 0.5;
const near = { x: 0, y: 0, z: 0 };
/** A smooth start and end over 0..1. */
const SMOOTH_A = 3;
const smooth = (t: number) => t * t * (SMOOTH_A - 2 * t);

/** How far out along a yard a spot by its footrope is (m, signed as the yard's own). */
function alongYard(yard: Yard, spot: Spot): number {
  return (spot.across - yard.x) * yard.ax + (shipZ(spot.along) - yard.z) * yard.az;
}

