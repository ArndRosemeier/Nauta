/**
 * Her doors (pure, implementation plan N2.3): where each leaf is hinged and which way it swings, how far open each
 * one is now, and where a body may not stand because a leaf is in the way. The one owner of the doors' swing
 * (rules.json `owners`); the drawing swings the leaves by it (ShipView.setDoor) and the walker passes a door only
 * when it is open.
 *
 * **Which way a door opens.** Into the quieter of the two spaces it joins: the one fewer ways lead into (a cabin, a
 * storeroom, the magazine; never the passage or the hatchway everyone goes through), the smaller if they tie. It is
 * hinged on the jamb nearer her side (a door on her centreline on its port jamb, one in a bulkhead along her on its
 * after jamb) and swings right back against its bulkhead if there is room for the leaf there: inside the space and
 * her sides, over no ladder, opening, fitting or other doorway. If there is none it is hinged on its other jamb and
 * swings back that way; if there is no room either side it swings a quarter turn, out into the space. Open, it stands
 * out of the way (see `openLeaves`). It opens when the captain comes near and shuts when he has gone.
 */
import { BODY, DOOR } from '../rules/ships';
import { DOOR_PASS, DOOR_REACH, DOOR_SWING, DOOR_SWING_BACK, DOOR_SWING_SECONDS } from '../rules/walking';
import { floorAt, insideBreadth, spacesById, type Obstacle, type ShipPlan, type Space, type Spot, type Way } from './plan';

/** A door's leaf: its hinge, which way it lies shut and opens, the space it opens into (plan: along, across). */
export interface DoorLeaf {
  readonly id: string;
  readonly way: Way;
  /** The door's middle in its bulkhead. */
  readonly middle: readonly [number, number];
  /** The hinge's jamb. */
  readonly hinge: readonly [number, number];
  /** From the hinge along the leaf when shut: a unit [along, across]. */
  readonly shut: readonly [number, number];
  /** Out of its bulkhead into the space it opens into: a unit [along, across]. */
  readonly toward: readonly [number, number];
  readonly into: string;
  /** The sign of its turn about ship space's up (+y) as it opens. */
  readonly opens: 1 | -1;
  /** How far it turns when open, rad. */
  readonly swing: number;
  readonly width: number;
}

/** How far open each door is: 0 shut, 1 swung right back. Plain data, changed only here. */
export interface Doors {
  readonly swing: Readonly<Record<string, number>>;
}

/** A body's half-breadth, m: what it keeps from a leaf. */
const BODY_HALF = BODY.breadth / 2;
/** The height over a floor where a space's breadth is reckoned for its size, m (a body's middle). */
const MIDDLE_HEIGHT = BODY.height / 2;

/** A space's floor area as a door reckons it (its oblong within her sides), m². */
function spaceArea(s: Space, along: number): number {
  const half = insideBreadth(along, floorAt(s, along, 0) + MIDDLE_HEIGHT);
  return (s.fore - s.aft) * Math.max(0, Math.min(s.starboard, half) - Math.max(s.port, -half));
}

/** How far into the space a leaf swung back is tried for room, m off its bulkhead. */
const ROOM_OFF = 0.05;

/** Whether a leaf hinged at `hinge` and swung back along `back` (a unit [along, across]) has room on the floor of `into`. */
function roomBack(plan: ShipPlan, into: Space, way: Way, hinge: readonly [number, number], back: readonly [number, number], toward: readonly [number, number]): boolean {
  const width = DOOR.width;
  for (const share of [1 / 2, 1]) {
    const a = hinge[0] + back[0] * width * share + toward[0] * ROOM_OFF, c = hinge[1] + back[1] * width * share + toward[1] * ROOM_OFF;
    if (a <= into.aft || a >= into.fore || c <= into.port || c >= into.starboard) return false;
    const floor = floorAt(into, a, c);
    if (Math.abs(c) >= Math.min(insideBreadth(a, floor), insideBreadth(a, floor + DOOR.height))) return false;
    if (plan.obstacles.some((o) => o.level === into.level && a > o.aft && a < o.fore && c > o.port && c < o.starboard)) return false;
    // Over another doorway of the same space.
    for (const w of plan.ways) {
      if (w === way || w.kind !== 'door' || (w.from.space !== into.id && w.to.space !== into.id)) continue;
      const ma = (w.from.along + w.to.along) / 2, mc = (w.from.across + w.to.across) / 2;
      if (Math.hypot(a - ma, c - mc) < width) return false;
    }
  }
  return true;
}

/** The sign of a leaf's turn about ship space's +y from `shut` to `toward`: a turn of +90° takes (x, z) to (z, -x). */
function turnSign(shut: readonly [number, number], toward: readonly [number, number]): 1 | -1 {
  const sx = shut[1], sz = -shut[0], tx = toward[1], tz = -toward[0];
  return sz * tx - sx * tz > 0 ? 1 : -1;
}

function makeLeaf(plan: ShipPlan, way: Way): DoorLeaf {
  const spaces = spacesById(plan);
  const a = spaces.get(way.from.space)!, b = spaces.get(way.to.space)!;
  const middle: [number, number] = [(way.from.along + way.to.along) / 2, (way.from.across + way.to.across) / 2];
  // The bulkhead runs athwart her when the two ends differ along her.
  const athwart = Math.abs(way.to.along - way.from.along) > Math.abs(way.to.across - way.from.across);
  const ways = (sp: Space) => plan.ways.filter((w) => w.from.space === sp.id || w.to.space === sp.id).length;
  const quieter = ways(a) - ways(b) || spaceArea(a, middle[0]) - spaceArea(b, middle[0]);
  const into = quieter <= 0 ? a : b;
  const end = into === a ? way.from : way.to;
  const toward: [number, number] = athwart ? [Math.sign(end.along - middle[0]), 0] : [0, Math.sign(end.across - middle[1])];
  const half = DOOR.width / 2;
  // Athwart: on the jamb nearer her side (port on the centreline); along her: on the after jamb. Then the other jamb.
  const near = athwart ? (middle[1] > 0 ? 1 : -1) : -1;
  const jamb = (side: number) => {
    const hinge: [number, number] = athwart ? [middle[0], middle[1] + side * half] : [middle[0] + side * half, middle[1]];
    const shut: [number, number] = athwart ? [0, -side] : [-side, 0];
    return { hinge, shut };
  };
  const leaf = (j: ReturnType<typeof jamb>, swing: number): DoorLeaf => ({
    id: way.id, way, middle, hinge: j.hinge, shut: j.shut, toward, into: into.id, opens: turnSign(j.shut, toward), swing, width: DOOR.width,
  });
  for (const side of [near, -near]) {
    const j = jamb(side);
    if (roomBack(plan, into, way, j.hinge, [-j.shut[0], -j.shut[1]], toward)) return leaf(j, DOOR_SWING_BACK);
  }
  return leaf(jamb(near), DOOR_SWING);
}

const leavesOf = new WeakMap<ShipPlan, readonly DoorLeaf[]>();

/** Every door's leaf in her plan, made once. */
export function doorLeaves(plan: ShipPlan): readonly DoorLeaf[] {
  let leaves = leavesOf.get(plan);
  if (!leaves) {
    leaves = plan.ways.filter((w) => w.kind === 'door').map((w) => makeLeaf(plan, w));
    leavesOf.set(plan, leaves);
  }
  return leaves;
}

/** From the hinge along a leaf turned `t` (rad) from shut toward the space it opens into: a unit [along, across]. */
function leafWay(l: DoorLeaf, t: number): [number, number] {
  const c = Math.cos(t), s = Math.sin(t);
  return [l.shut[0] * c + l.toward[0] * s, l.shut[1] * c + l.toward[1] * s];
}

/** A leaf's half-thickness, m, as it stands in the way when open. */
const LEAF_HALF = 0.03;

const openLeavesOf = new WeakMap<ShipPlan, readonly Obstacle[]>();

/**
 * Where each door's leaf stands when open, as obstacles on the floor it opens onto: the walk graph keeps a body
 * clear of them, so no way across a space leads through a door standing open (walk.ts).
 */
export function openLeaves(plan: ShipPlan): readonly Obstacle[] {
  let out = openLeavesOf.get(plan);
  if (!out) {
    const spaces = spacesById(plan);
    out = doorLeaves(plan).map((l) => {
      const [la, lc] = leafWay(l, l.swing), tip = [l.hinge[0] + la * l.width, l.hinge[1] + lc * l.width] as const;
      return {
        id: `${l.id}-leaf`, level: spaces.get(l.into)!.level,
        aft: Math.min(l.hinge[0], tip[0]) - LEAF_HALF, fore: Math.max(l.hinge[0], tip[0]) + LEAF_HALF,
        port: Math.min(l.hinge[1], tip[1]) - LEAF_HALF, starboard: Math.max(l.hinge[1], tip[1]) + LEAF_HALF,
      };
    });
    openLeavesOf.set(plan, out);
  }
  return out;
}

/** The leaf of door `id`: its hinge, which way it lies and opens, the space it opens into. */
export function doorHinge(plan: ShipPlan, id: string): DoorLeaf {
  const leaf = doorLeaves(plan).find((l) => l.id === id);
  if (!leaf) throw new Error(`no door ${id}`);
  return leaf;
}

/** Every door shut. */
export function shutDoors(plan: ShipPlan): Doors {
  return { swing: Object.fromEntries(doorLeaves(plan).map((l) => [l.id, 0])) };
}

/** The leaf's angle from shut, rad (always opening: its turn's sign is `opens`), for drawing. */
export const doorAngle = (plan: ShipPlan, doors: Doors, id: string): number => (doors.swing[id] ?? 0) * doorHinge(plan, id).swing;

/** Whether a body standing at a spot is near enough a door to open it: on one of its two spaces' floors, within reach of its middle. */
function opensFor(leaf: DoorLeaf, at: Spot): boolean {
  const w = leaf.way;
  return (at.space === w.from.space || at.space === w.to.space) && Math.hypot(at.along - leaf.middle[0], at.across - leaf.middle[1]) < DOOR_REACH;
}

/** One step of the doors: each swings open while a body stands near it (`near`: the captain's spot, or none) and shut when none does. */
export function stepDoors(doors: Doors, plan: ShipPlan, near: Spot | null, dt: number): Doors {
  const swing: Record<string, number> = {}, rate = dt / DOOR_SWING_SECONDS;
  for (const leaf of doorLeaves(plan)) {
    const now = doors.swing[leaf.id] ?? 0, open = near !== null && opensFor(leaf, near);
    swing[leaf.id] = open ? Math.min(1, now + rate) : Math.max(0, now - rate);
  }
  return { swing };
}

/** Whether a door lets a body pass through its doorway now. */
export const doorPasses = (doors: Doors, id: string): boolean => (doors.swing[id] ?? 0) >= DOOR_PASS;

/**
 * Whether a body's middle at (along, across) on the floor of `space` is in a leaf's way: while a door is not yet
 * open, anywhere it may sweep on the side it opens into; once open, too near the leaf where it stands.
 */
export function leafInWay(plan: ShipPlan, doors: Doors, space: string, along: number, across: number): boolean {
  for (const leaf of doorLeaves(plan)) {
    if (leaf.into !== space) continue;
    const dx = along - leaf.hinge[0], dy = across - leaf.hinge[1];
    const reach = leaf.width + BODY_HALF;
    if (dx * dx + dy * dy >= reach * reach) continue;
    if (!doorPasses(doors, leaf.id)) {
      if (dx * leaf.toward[0] + dy * leaf.toward[1] > -BODY_HALF) return true;
      continue;
    }
    // The leaf now: from the hinge, turned from shut toward `toward` by its swing.
    const [la, lc] = leafWay(leaf, (doors.swing[leaf.id] ?? 0) * leaf.swing);
    const along1 = Math.max(0, Math.min(leaf.width, dx * la + dy * lc));
    if (Math.hypot(dx - la * along1, dy - lc * along1) < BODY_HALF) return true;
  }
  return false;
}
