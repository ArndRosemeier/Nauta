/**
 * The captain walking her decks (pure, implementation plan N2.3): his body on the plan's walk graph, carried by her
 * motion because it is kept in ship space. Where he may stand is the graph's (the squares his middle fits on, the
 * open floor between spaces) and the doorways of open doors; how he walks is @futuremagic/deck's `stepDeckBody`
 * (his pace, sliding along what he walks into, never through a bulkhead or a shut door, stooping under the beams
 * before he gets there). Ladders are climbed, not walked: `ladderOffered` says when he stands at one pushing into it.
 *
 * His body is in ship space (section.ts): x across her (+ starboard), z aft (-along), heights `shipY` from her load
 * waterline. Its place is the space he stands in.
 */
import { standAt, stepDeckBody, type DeckBody, type DeckGait, type DeckGround, type DeckIntent, type Standing, type Vec3 } from '@futuremagic/deck';
import { BODY, DOOR } from '../rules/ships';
import { BACK_PACE, DUCK_AHEAD, EYE_BELOW_TOP, HEAD_CLEAR, LADDER_AIM, LADDER_PRESS, LADDER_REACH, LADDER_TOUCH, SIDE_PACE, STOOP_RATE, WALK_GRIP, WALK_PACE } from '../rules/walking';
import { heelEase } from '../crew/route';
import { shipY, shipZ } from './section';
import { floorAt, holds, overheadAt, spacesById, type ShipPlan, type Space, type Spot, type Way } from './plan';
import { nodeAt, type WalkGraph } from './walk';
import { doorLeaves, doorPasses, leafInWay, type DoorLeaf, type Doors } from './doors';

/** The captain's body on her decks: his feet in ship space, his pace, his height now, the space he stands in. */
export type DeckWalker = DeckBody<string>;

/** How the captain walks (rules: walking.ts, his body: ships.ts BODY). */
export const CAPTAIN_GAIT: DeckGait = {
  walk: WALK_PACE, back: BACK_PACE, side: SIDE_PACE, grip: WALK_GRIP, tall: BODY.height, least: BODY.leastHeadroom - HEAD_CLEAR,
  clear: HEAD_CLEAR, stoop: STOOP_RATE, stepUp: BODY.stepUp, ahead: DUCK_AHEAD,
};

/** A doorway's clear half-width for a body's middle, m: the door's width less the body's breadth, halved. */
const DOORWAY_HALF = (DOOR.width - BODY.breadth) / 2;
/**
 * A body near a doorway pushing toward it is guided onto its middle line, m/s across the way, from this far from
 * its bulkhead (m): a thumb on glass cannot aim a body at a gap a few centimetres wider than its shoulders.
 */
const DOOR_GUIDE_RATE = 0.8;
const DOOR_GUIDE_REACH = 0.9;
/** How far beside the doorway a body is still guided into it, m past its jambs. */
const DOOR_GUIDE_ASIDE = 0.25;
/** A push this small is no push (share of a full one). */
const LEAST_PUSH = 0.2;

/** Ship space for a plan place, and back. */
const toX = (across: number) => across;
const toAlong = (z: number) => -z;

/** The walker's spot on her plan. */
export const spotOf = (w: Standing<string> & { x: number; z: number }): Spot => ({ space: w.place, along: toAlong(w.z), across: w.x });

/** The plan's facts the walker reads, gathered once per plan and graph. */
interface Deck {
  readonly plan: ShipPlan;
  readonly graph: WalkGraph;
  readonly spaces: ReadonlyMap<string, Space>;
  /** The spaces open to each space with no bulkhead between. */
  readonly open: ReadonlyMap<string, readonly Space[]>;
  /** The doors of each space. */
  readonly doors: ReadonlyMap<string, readonly DoorLeaf[]>;
}
const decks = new WeakMap<WalkGraph, Deck>();

function deckOf(plan: ShipPlan, graph: WalkGraph): Deck {
  let d = decks.get(graph);
  if (d) return d;
  const spaces = spacesById(plan);
  const open = new Map<string, Space[]>(), doors = new Map<string, DoorLeaf[]>();
  const listUnder = <T>(m: Map<string, T[]>, k: string, v: T) => { const l = m.get(k) ?? []; l.push(v); m.set(k, l); };
  for (const w of plan.ways) if (w.kind === 'open') { listUnder(open, w.from.space, spaces.get(w.to.space)!); listUnder(open, w.to.space, spaces.get(w.from.space)!); }
  for (const leaf of doorLeaves(plan)) { listUnder(doors, leaf.way.from.space, leaf); listUnder(doors, leaf.way.to.space, leaf); }
  d = { plan, graph, spaces, open, doors };
  decks.set(graph, d);
  return d;
}

/** Where a doorway lets a body's middle be: the strip between its two ends, its clear width wide. How far along it (0..1) and how far off its middle line, or null. */
function inDoorway(leaf: DoorLeaf, along: number, across: number): { t: number; off: number } | null {
  const f = leaf.way.from, t = leaf.way.to, da = t.along - f.along, dc = t.across - f.across, len2 = da * da + dc * dc;
  const u = ((along - f.along) * da + (across - f.across) * dc) / len2;
  if (u < 0 || u > 1) return null;
  const off = ((along - f.along) * dc - (across - f.across) * da) / Math.sqrt(len2);
  return Math.abs(off) <= DOORWAY_HALF ? { t: u, off } : null;
}

/** Whether a body's middle there has its head under a door's head: in its doorway, within its half-breadth of the bulkhead. */
export function underDoorHead(leaf: DoorLeaf, along: number, across: number): boolean {
  const n = leaf.toward, da = along - leaf.middle[0], dc = across - leaf.middle[1];
  return Math.abs(da * n[0] + dc * n[1]) <= BODY.breadth / 2 && Math.abs(da * n[1] - dc * n[0]) <= DOOR.width / 2;
}

/** Where on her decks a body may stand, with her doors as they are now. */
export function deckGround(plan: ShipPlan, graph: WalkGraph, doors: Doors): DeckGround<string> {
  const d = deckOf(plan, graph);
  const standOn = (s: Space, along: number, across: number): Standing<string> => ({ place: s.id, floor: shipY(floorAt(s, along, across)) });
  return {
    stand(x, z, from) {
      const along = toAlong(z), across = x, here = d.spaces.get(from.place)!;
      for (const s of [here, ...(d.open.get(here.id) ?? [])]) {
        if (holds(s, along, across) && nodeAt(graph, { space: s.id, along, across }) >= 0 && !leafInWay(plan, doors, s.id, along, across)) return standOn(s, along, across);
      }
      for (const leaf of d.doors.get(here.id) ?? []) {
        if (!doorPasses(doors, leaf.id) || !inDoorway(leaf, along, across)) continue;
        const w = leaf.way, other = d.spaces.get(w.from.space === here.id ? w.to.space : w.from.space)!;
        const side = holds(here, along, across) ? here : other;
        if (!leafInWay(plan, doors, side.id, along, across)) return standOn(side, along, across);
      }
      return null;
    },
    headroom(x, z, at) {
      const along = toAlong(z), across = x, s = d.spaces.get(at.place)!;
      const room = overheadAt(s, along, across) - floorAt(s, along, across);
      return (d.doors.get(s.id) ?? []).some((leaf) => underDoorHead(leaf, along, across)) ? Math.min(room, DOOR.height) : room;
    },
  };
}

/** The captain standing still at a spot of her plan. */
export function walkerAt(plan: ShipPlan, spot: Spot): DeckWalker {
  const s = plan.spaces.find((p) => p.id === spot.space)!;
  const room = overheadAt(s, spot.along, spot.across) - floorAt(s, spot.along, spot.across) - HEAD_CLEAR;
  return standAt({ place: s.id, floor: shipY(floorAt(s, spot.along, spot.across)) }, toX(spot.across), shipZ(spot.along), Math.max(CAPTAIN_GAIT.least, Math.min(BODY.height, room)));
}

/**
 * One step of the captain walking as the thumbs say (`intent.heading`: his look's yaw on her), with her doors as they
 * are; `up`: gravity's up in her frame (none: a level deck), so her heeled deck slows him as it slows every man
 * aboard (crew/route.ts `heelEase`).
 */
export function stepWalker(w: DeckWalker, intent: DeckIntent, plan: ShipPlan, graph: WalkGraph, doors: Doors, dt: number, up?: Vec3): DeckWalker {
  const ground = deckGround(plan, graph, doors), pace = up ? heelEase('walk', 0, Math.acos(Math.min(1, up.y))) : 1;
  const next = stepDeckBody(w, { ...intent, forward: intent.forward * pace, strafe: intent.strafe * pace }, CAPTAIN_GAIT, ground, dt);
  return guideIntoDoorway(next, plan, graph, ground, dt);
}

/** A body near a doorway, walking toward it, drifts onto its middle line (where the ground lets it). */
function guideIntoDoorway(w: DeckWalker, plan: ShipPlan, graph: WalkGraph, ground: DeckGround<string>, dt: number): DeckWalker {
  const along = toAlong(w.z), across = w.x, va = -w.vz, vc = w.vx;
  for (const leaf of deckOf(plan, graph).doors.get(w.place) ?? []) {
    const [ma, mc] = leaf.middle, normal = leaf.toward;
    // How far from the bulkhead, on which side, and how far beside the middle line.
    const depth = (along - ma) * normal[0] + (across - mc) * normal[1];
    const aside = (along - ma) * normal[1] - (across - mc) * normal[0];
    const closing = -(va * normal[0] + vc * normal[1]) * Math.sign(depth);
    if (Math.abs(depth) > DOOR_GUIDE_REACH || closing <= 0 || Math.abs(aside) > DOOR.width / 2 + DOOR_GUIDE_ASIDE || Math.abs(aside) < DOORWAY_HALF / 2) continue;
    const shift = -Math.sign(aside) * Math.min(Math.abs(aside), DOOR_GUIDE_RATE * dt);
    const na = along + shift * normal[1], nc = across - shift * normal[0];
    const s = ground.stand(toX(nc), shipZ(na), w);
    if (s && Math.abs(s.floor - w.floor) <= CAPTAIN_GAIT.stepUp) return { ...w, place: s.place, floor: s.floor, x: toX(nc), z: shipZ(na) };
  }
  return w;
}

/** The way the thumbs push the body on her plan: a unit [along, across] and how hard (0..1), from a look's yaw. */
export function pushOf(intent: DeckIntent): { along: number; across: number; push: number } {
  const push = Math.min(1, Math.hypot(intent.forward, intent.strafe));
  const s = Math.sin(intent.heading), c = Math.cos(intent.heading);
  // In ship space forward is (-sin, -cos) in (x, z) and right is (cos, -sin); along is -z.
  const x = -s * intent.forward + c * intent.strafe, z = -c * intent.forward - s * intent.strafe, n = Math.hypot(x, z) || 1;
  return { along: -z / n, across: x / n, push };
}

/** A ladder he stands at and pushes into: which, and whether he goes up it (at its foot) or down (at its head). */
export interface LadderOffer {
  readonly way: Way;
  readonly up: boolean;
}

/** The ladder the captain stands at, pushing toward it: up from its foot, or down from its head. Null: none. */
export function ladderOffered(w: DeckWalker, intent: DeckIntent, plan: ShipPlan): LadderOffer | null {
  const p = pushOf(intent);
  if (p.push < LEAST_PUSH) return null;
  // Walking on past it is no push into it: he must stand, or be stopped by the ladder or the coaming, pushing on.
  if (-w.vz * p.along + w.vx * p.across > LADDER_PRESS) return null;
  const along = toAlong(w.z), across = w.x;
  for (const way of plan.ways) {
    const line = way.line;
    if (!line) continue;
    for (const up of [true, false]) {
      const end = up ? way.from : way.to;
      if (end.space !== w.place) continue;
      // At its foot he walks into the ladder itself (it stands in the way: plan.ts obstacles), not past the spot before it;
      // at its head he stands at the spot beside or before the opening.
      const near = up ? Math.hypot(along - line.foot[0], across - line.foot[1]) <= LADDER_TOUCH : Math.hypot(along - end.along, across - end.across) <= LADDER_REACH;
      if (!near) continue;
      // At its foot the ladder is in front of him, not beside him: sliding past its side is walking past it.
      if (up && Math.abs((along - line.foot[0]) * line.toward[1] - (across - line.foot[1]) * line.toward[0]) > way.width / 2) continue;
      // Into the ladder: at its foot along its climb, at its head's standing spot into the opening.
      const [ta, tc] = up ? line.toward : line.down;
      if (p.along * ta + p.across * tc >= LADDER_AIM) return { way, up };
    }
  }
  return null;
}

/** The captain's eye in ship space: over his feet by his height now, less his eye's drop below his crown. */
export function eyeOf(w: DeckWalker, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
  out[0] = w.x; out[1] = w.floor + w.height - EYE_BELOW_TOP; out[2] = w.z;
  return out;
}
