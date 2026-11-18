/**
 * Ships touch (pure, implementation plan N3.12): two hulls cannot pass through each other. Part of `step`, after
 * every ship has sailed and floated her step; it owns nothing and acts through the owners: her way, leeway and turning
 * through sailing.ts (`shoved`), her place on the water through motion.ts (`shifted`).
 *
 * **Where they touch.** Each hull is taken as her outline at three heights, each as she lies (heeled, pitched, heaved):
 * at her waterline, at her wales (where she is broadest) and at the top of her side (the bulwark's height, so two
 * ships heeling toward each other meet rail to rail first). An outline is the hull's breadth at that height from the
 * plan, outside her planking, as its convex hull (the hollow of her run filled, a few tenths of a metre at most). Where
 * a corner of one outline stands inside the other's at the same height, they touch there: how deep, and the way out
 * is square to the nearest side of the other's outline.
 *
 * **The blow.** At each place they touch the two are shoved apart as rigid bodies of their own masses (with the water
 * that moves with each, ahead, sideways and turning), so a blow forward of her middle turns her as well as pushing
 * her: the closing speed is taken away and a little of it given back (`RESTITUTION`), and sliding along each other
 * is held back by the grinding (`FRICTION`), which takes their way off. Then what is left of the overlap is pushed out
 * of them by their masses. A blow harder than `STRUCK_SPEED` is an event for each ship (`Struck`, where on her and how
 * hard: the damage is N6.1's); two hulls lying together only grind.
 *
 * **Spars.** The bowsprit, the jib-boom and every yard (braced as it is) reaching over the other's deck foul her
 * rigging: an event when one first does (`Fouled`, the spar and how far along it; N6.1 wounds it). Nothing holds them
 * together: there is no boarding in the first game, so they drift apart or are sailed apart.
 *
 * Plain arithmetic and `sincos` only, so every machine gets the same bits.
 */
import { FOULING_SPARS, FRICTION, OUTLINE_PLACES, PUSH_SHARE, PUSH_SLACK, RESTITUTION, SPAR_STEP, STRUCK_SPEED, TOUCH_PASSES } from '../rules/touch';
import { PLANKING, WALE } from '../rules/ships';
import { sincos } from '../trig';
import { buoyancyAlong, designWaterline, hullEnds, hullHalfBreadth, sideTop } from './hull';
import { shifted, shipBody, toWorld, type ShipMotion, type ShipPose } from './motion';
import { rigPlan } from './rig';
import { MASTS, shoved, shovedMasses, type Sailing } from './sailing';
import { shipY, shipZ } from './section';

/** Two hulls struck each other hard enough to be heard and to hurt (one event for each ship, where on her). */
export interface Struck {
  readonly kind: 'struck';
  readonly tick: number;
  readonly ship: number;
  /** The ship she struck, or that struck her. */
  readonly other: number;
  /** How fast the two closed where they met, m/s. */
  readonly speed: number;
  /** Where on her: m forward of the mainmast and m across (+ starboard), as in her plan. */
  readonly along: number;
  readonly across: number;
}

/** One of her spars has come over the other's deck and is foul of her rigging. */
export interface Fouled {
  readonly kind: 'fouled';
  readonly tick: number;
  readonly ship: number;
  readonly other: number;
  /** The spar (rig plan id) and how far from its heel it first lay over her deck, m. */
  readonly spar: string;
  readonly at: number;
}

export type TouchEvent = Struck | Fouled;

/** What touching reads and changes of a ship: how she lies (motion.ts) and how she sails (sailing.ts). */
export interface Afloat {
  readonly motion: ShipMotion;
  readonly sailing: Sailing;
}

/** One outline of her hull at a height: its corners in ship space, wound anticlockwise in (x, z). */
interface Ring {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly z: Float64Array;
}

/** A place on a fouling spar, as the plan has it with its yard square: and for a yard, its middle and mast. */
interface SparPlace {
  readonly spar: string;
  readonly at: number;
  readonly along: number;
  readonly across: number;
  readonly height: number;
  /** A yard: the mast it braces on (index into `MASTS`), its brace limit (rad) and its middle along her (m); else -1. */
  readonly mast: number;
  readonly brace: number;
  readonly middle: number;
}

interface Shape {
  readonly rings: readonly Ring[];
  readonly spars: readonly SparPlace[];
  /** How far from her centre of gravity her outlines and her spars reach at most, m, however she lies. */
  readonly hullReach: number;
  readonly sparReach: number;
}

let shape: Shape | null = null;

function touchShape(): Shape {
  return (shape ??= buildShape());
}

/** The heights her outlines are taken at, m above her base, by place along her: the waterline, the wales, the top of her side. */
const RING_HEIGHTS: readonly ((along: number) => number)[] = [designWaterline, () => WALE.upper, sideTop];

function buildShape(): Shape {
  const b = shipBody();
  const fromCentre = (x: number, y: number, z: number) => Math.sqrt(x * x + (y - b.centreY) ** 2 + (z - b.centreZ) ** 2);
  let hullReach = 0, sparReach = 0;
  const rings = RING_HEIGHTS.map((heightAt) => {
    // Her ends at this height (the height read at the end itself, once more, for a sloping waterline).
    const aft = hullEnds(heightAt(hullEnds(heightAt(0)).aft)).aft, fore = hullEnds(heightAt(hullEnds(heightAt(0)).fore)).fore;
    const pts: [number, number, number][] = [[0, heightAt(aft), aft], [0, heightAt(fore), fore]];
    for (let k = 1; k <= OUTLINE_PLACES; k++) {
      const along = aft + ((fore - aft) * k) / (OUTLINE_PLACES + 1), h = heightAt(along);
      const half = hullHalfBreadth(along, h);
      if (half <= 0) continue;
      for (const side of [-1, 1]) pts.push([side * (half + PLANKING.side), h, along]);
    }
    const ring = convexRing(pts.map(([x, h, along]) => [x, shipY(h), shipZ(along)]));
    for (let i = 0; i < ring.x.length; i++) hullReach = Math.max(hullReach, fromCentre(ring.x[i]!, ring.y[i]!, ring.z[i]!));
    return ring;
  });
  const spars: SparPlace[] = [];
  for (const s of rigPlan().spars) {
    if (!FOULING_SPARS.includes(s.kind)) continue;
    const count = Math.ceil(s.length / SPAR_STEP);
    for (let k = 0; k <= count; k++) {
      const t = k / count;
      const along = s.heel.along + (s.head.along - s.heel.along) * t, across = s.heel.across + (s.head.across - s.heel.across) * t;
      const height = s.heel.height + (s.head.height - s.heel.height) * t;
      const yard = s.yard && s.mast !== 'bowsprit' ? s.yard : null;
      spars.push({
        spar: s.id, at: s.length * t, along, across, height,
        mast: yard ? MASTS.indexOf(s.mast as (typeof MASTS)[number]) : -1, brace: yard ? yard.brace : 0, middle: (s.heel.along + s.head.along) / 2,
      });
      // Braced either way it swings round its middle, so it reaches no further from her centre than square.
      sparReach = Math.max(sparReach, fromCentre(Math.abs(across) + Math.abs(along - (s.heel.along + s.head.along) / 2), shipY(height), shipZ(along)));
    }
  }
  return { rings, spars, hullReach, sparReach };
}

/** The convex hull of points (x, y, z) in the (x, z) plane, wound anticlockwise (Andrew's monotone chain); each corner keeps its y. */
function convexRing(points: [number, number, number][]): Ring {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[2] - b[2]);
  const cross = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[2]! - o[2]!) - (a[2]! - o[2]!) * (b[0]! - o[0]!);
  const chain = (list: [number, number, number][]) => {
    const out: [number, number, number][] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out[out.length - 2]!, out[out.length - 1]!, q) <= 0) out.pop();
      out.push(q);
    }
    out.pop();
    return out;
  };
  const hull = [...chain(p), ...chain([...p].reverse())];
  return { x: Float64Array.from(hull, (q) => q[0]), y: Float64Array.from(hull, (q) => q[1]), z: Float64Array.from(hull, (q) => q[2]) };
}

/** An outline as she lies this moment, on the water's plane: its corners and each side's outward normal. */
interface Outline {
  n: number;
  readonly x: Float64Array;
  readonly z: Float64Array;
  readonly nx: Float64Array;
  readonly nz: Float64Array;
}

const newOutline = (n: number): Outline => ({ n, x: new Float64Array(n), z: new Float64Array(n), nx: new Float64Array(n), nz: new Float64Array(n) });
const at3: [number, number, number] = [0, 0, 0];

/** A ring of her hull as she lies at `pose`, into `out`. */
function placeOutline(ring: Ring, pose: ShipPose, out: Outline): Outline {
  const n = ring.x.length;
  out.n = n;
  for (let i = 0; i < n; i++) {
    toWorld(pose, ring.x[i]!, ring.y[i]!, ring.z[i]!, at3);
    out.x[i] = at3[0];
    out.z[i] = at3[2];
  }
  for (let i = 0; i < n; i++) {
    const j = i + 1 === n ? 0 : i + 1, ex = out.x[j]! - out.x[i]!, ez = out.z[j]! - out.z[i]!, len = Math.sqrt(ex * ex + ez * ez) || 1;
    out.nx[i] = ez / len;
    out.nz[i] = -ex / len;
  }
  return out;
}

/** Where a point stands against an outline: inside if `depth` > 0, then how deep and the outward normal of the nearest side. */
const inside = { depth: 0, nx: 0, nz: 0 };
function against(o: Outline, px: number, pz: number): void {
  let best = -Infinity, bi = 0;
  for (let i = 0; i < o.n; i++) {
    const d = (px - o.x[i]!) * o.nx[i]! + (pz - o.z[i]!) * o.nz[i]!;
    if (d > 0) { inside.depth = 0; return; }
    if (d > best) { best = d; bi = i; }
  }
  inside.depth = -best;
  inside.nx = o.nx[bi]!;
  inside.nz = o.nz[bi]!;
}

/** The places two ships touch in a step: each place, its normal (the way the first is pushed out), how deep. */
interface Contact {
  readonly px: number;
  readonly pz: number;
  readonly nx: number;
  readonly nz: number;
  readonly depth: number;
}

/** Outlines kept between steps, by name, each as long as its ring. */
const kept = new Map<string, Outline>();
function slot(name: string, ring: Ring): Outline {
  let o = kept.get(name);
  if (!o || o.x.length < ring.x.length) kept.set(name, (o = newOutline(ring.x.length)));
  return o;
}

/** Every place ship A's and ship B's outlines overlap, at each height. */
function contacts(a: ShipPose, b: ShipPose): Contact[] {
  const s = touchShape(), out: Contact[] = [];
  s.rings.forEach((ring, k) => {
    const oa = placeOutline(ring, a, slot(`a${k}`, ring)), ob = placeOutline(ring, b, slot(`b${k}`, ring));
    for (let i = 0; i < oa.n; i++) {
      against(ob, oa.x[i]!, oa.z[i]!);
      if (inside.depth > 0) out.push({ px: oa.x[i]!, pz: oa.z[i]!, nx: inside.nx, nz: inside.nz, depth: inside.depth });
    }
    for (let i = 0; i < ob.n; i++) {
      against(oa, ob.x[i]!, ob.z[i]!);
      if (inside.depth > 0) out.push({ px: ob.x[i]!, pz: ob.z[i]!, nx: -inside.nx, nz: -inside.nz, depth: inside.depth });
    }
  });
  return out;
}

/** A ship's motion across the water as the blow sees it: her axes, way, leeway and turning, and the blows taken. */
interface Moving {
  readonly cx: number;
  readonly cz: number;
  /** Forward and to starboard on the water. */
  readonly fx: number;
  readonly fz: number;
  readonly sx: number;
  readonly sz: number;
  u: number;
  v: number;
  r: number;
  /** Blows taken ahead, to starboard (kN·s) and turning (kN·m·s). */
  pu: number;
  pv: number;
  pr: number;
}

const sc: [number, number] = [0, 0];
function moving(m: Afloat): Moving {
  const p = m.motion.pose, s = m.sailing;
  sincos(p.heading, sc);
  return { cx: p.x, cz: p.z, fx: sc[0], fz: -sc[1], sx: sc[1], sz: sc[0], u: s.ahead, v: s.leeway, r: s.turnRate, pu: 0, pv: 0, pr: 0 };
}

/** The velocity of a point (world x, z) of a moving ship, m/s, into `vel`. */
const vel = { x: 0, z: 0 };
function velocityAt(m: Moving, px: number, pz: number): void {
  const rx = px - m.cx, rz = pz - m.cz;
  // Turning to starboard (a compass bearing growing) swings a point at r by (-rz, rx) per radian.
  vel.x = m.u * m.fx + m.v * m.sx - m.r * rz;
  vel.z = m.u * m.fz + m.v * m.sz + m.r * rx;
}

/** How much a blow along (dx, dz) at a point changes the ship's speed there along it, per kN·s. */
function giving(m: Moving, masses: ReturnType<typeof shovedMasses>, px: number, pz: number, dx: number, dz: number): number {
  const a = dx * m.fx + dz * m.fz, s = dx * m.sx + dz * m.sz, t = (px - m.cx) * dz - (pz - m.cz) * dx;
  return (a * a) / masses.ahead + (s * s) / masses.sideways + (t * t) / masses.turning;
}

/** A blow (jx, jz kN·s) at a point taken by a moving ship. */
function take(m: Moving, masses: ReturnType<typeof shovedMasses>, px: number, pz: number, jx: number, jz: number): void {
  const a = jx * m.fx + jz * m.fz, s = jx * m.sx + jz * m.sz, t = (px - m.cx) * jz - (pz - m.cz) * jx;
  m.pu += a;
  m.pv += s;
  m.pr += t;
  m.u += a / masses.ahead;
  m.v += s / masses.sideways;
  m.r += t / masses.turning;
}

/** Where a world point (x, z) is on a ship, in her plan's terms (m forward of the mainmast, m across). */
function onHer(m: Moving, px: number, pz: number): { along: number; across: number } {
  const dx = px - m.cx, dz = pz - m.cz;
  return { along: dx * m.fx + dz * m.fz + buoyancyAlong(), across: dx * m.sx + dz * m.sz };
}

/** The two ships after the blows between them in a step, and the hardest place they met (null if none was a blow). */
function strike(a: Afloat, b: Afloat, found: readonly Contact[]): { a: Afloat; b: Afloat; hardest: { speed: number; px: number; pz: number; ma: Moving; mb: Moving } | null } {
  const masses = shovedMasses(), ma = moving(a), mb = moving(b), n = found.length;
  const kn = new Float64Array(n), kt = new Float64Array(n), want = new Float64Array(n), jn = new Float64Array(n), jt = new Float64Array(n);
  let hardest = 0, hi = -1;
  for (let c = 0; c < n; c++) {
    const { px, pz, nx, nz } = found[c]!;
    kn[c] = giving(ma, masses, px, pz, nx, nz) + giving(mb, masses, px, pz, nx, nz);
    kt[c] = giving(ma, masses, px, pz, -nz, nx) + giving(mb, masses, px, pz, -nz, nx);
    velocityAt(ma, px, pz);
    const ux = vel.x, uz = vel.z;
    velocityAt(mb, px, pz);
    const closing = -((ux - vel.x) * nx + (uz - vel.z) * nz);
    want[c] = closing > 0 ? RESTITUTION * closing : 0;
    if (closing > hardest) { hardest = closing; hi = c; }
  }
  for (let pass = 0; pass < TOUCH_PASSES; pass++) {
    for (let c = 0; c < n; c++) {
      const { px, pz, nx, nz } = found[c]!;
      velocityAt(ma, px, pz);
      const ux = vel.x, uz = vel.z;
      velocityAt(mb, px, pz);
      const rx = ux - vel.x, rz = uz - vel.z;
      // Square to the sides: push until they part at the speed wanted, never pull.
      const was = jn[c]!, now = Math.max(0, was + (want[c]! - (rx * nx + rz * nz)) / kn[c]!), dj = now - was;
      jn[c] = now;
      take(ma, masses, px, pz, dj * nx, dj * nz);
      take(mb, masses, px, pz, -dj * nx, -dj * nz);
      // Along the sides: the grinding holds the sliding back, at most by the friction of the push.
      velocityAt(ma, px, pz);
      const tx = vel.x, tz = vel.z;
      velocityAt(mb, px, pz);
      const slide = (tx - vel.x) * -nz + (tz - vel.z) * nx, most = FRICTION * now;
      const held = Math.min(most, Math.max(-most, jt[c]! - slide / kt[c]!)), dt = held - jt[c]!;
      jt[c] = held;
      take(ma, masses, px, pz, -dt * nz, dt * nx);
      take(mb, masses, px, pz, dt * nz, -dt * nx);
    }
  }
  // What overlap is left, pushed out of them by their masses along the deepest place's normal.
  let deepest = found[0]!;
  for (const c of found) if (c.depth > deepest.depth) deepest = c;
  const push = PUSH_SHARE * Math.max(0, deepest.depth - PUSH_SLACK) / 2;
  return {
    a: { motion: shifted(a.motion, deepest.nx * push, deepest.nz * push), sailing: shoved(a.sailing, ma.pu, ma.pv, ma.pr) },
    b: { motion: shifted(b.motion, -deepest.nx * push, -deepest.nz * push), sailing: shoved(b.sailing, mb.pu, mb.pv, mb.pr) },
    hardest: hi >= 0 && hardest >= STRUCK_SPEED ? { speed: hardest, px: found[hi]!.px, pz: found[hi]!.pz, ma, mb } : null,
  };
}

/** Each fouling spar of `ship` over `other`'s deck (inside her outline at the top of her side): the spar and how far along it. */
function overDeck(ship: Afloat, other: Afloat): Map<string, number> {
  const s = touchShape(), deck = placeOutline(s.rings[RAIL]!, other.motion.pose, slot('deck', s.rings[RAIL]!)), out = new Map<string, number>();
  const pose = ship.motion.pose, braces = ship.sailing.braces;
  for (const p of s.spars) {
    if (out.has(p.spar)) continue;
    let along = p.along, across = p.across;
    if (p.mast >= 0) {
      // Braced round its middle: + swings its starboard yardarm aft.
      sincos(-braces[p.mast]! * p.brace, sc);
      along = p.middle - p.across * sc[0];
      across = p.across * sc[1];
    }
    toWorld(pose, across, shipY(p.height), shipZ(along), at3);
    against(deck, at3[0], at3[2]);
    if (inside.depth > 0) out.set(p.spar, p.at);
  }
  return out;
}
const RAIL = RING_HEIGHTS.length - 1;

/** Whether two ships lie within `reach` of each other (centre to centre), m. */
function within(a: Afloat, b: Afloat, reach: number): boolean {
  const dx = a.motion.pose.x - b.motion.pose.x, dz = a.motion.pose.z - b.motion.pose.z;
  return dx * dx + dz * dz < reach * reach;
}

/**
 * The ships of a step after they have touched: `after` as they sailed and floated it, `before` as the step found them
 * (to tell a spar newly foul). Each pair that overlaps is shoved apart; the events are what was struck and fouled.
 */
export function touch<T extends Afloat>(before: readonly Afloat[], after: readonly T[], tick: number): { ships: readonly T[]; events: TouchEvent[] } {
  const s = touchShape(), events: TouchEvent[] = [];
  let ships = after;
  for (let i = 0; i < ships.length; i++) {
    for (let j = i + 1; j < ships.length; j++) {
      const a = ships[i]!, b = ships[j]!;
      if (within(a, b, 2 * s.hullReach)) {
        const found = contacts(a.motion.pose, b.motion.pose);
        if (found.length > 0) {
          const hit = strike(a, b, found);
          ships = ships.map((x, k) => (k === i ? { ...x, ...hit.a } : k === j ? { ...x, ...hit.b } : x));
          if (hit.hardest) {
            const { speed, px, pz, ma, mb } = hit.hardest;
            events.push({ kind: 'struck', tick, ship: i, other: j, speed, ...onHer(ma, px, pz) });
            events.push({ kind: 'struck', tick, ship: j, other: i, speed, ...onHer(mb, px, pz) });
          }
        }
      }
      const was = before[i] && before[j] ? [before[i]!, before[j]!] : null;
      for (const [ship, other] of [[i, j], [j, i]] as const) {
        if (!within(ships[ship]!, ships[other]!, s.sparReach + s.hullReach)) continue;
        const now = overDeck(ships[ship]!, ships[other]!);
        if (now.size === 0) continue;
        const then = was ? overDeck(was[ship === i ? 0 : 1]!, was[ship === i ? 1 : 0]!) : new Map<string, number>();
        for (const [spar, at] of now) if (!then.has(spar)) events.push({ kind: 'fouled', tick, ship, other, spar, at });
      }
    }
  }
  return { ships, events };
}

/** How deep two ships' hulls overlap where they overlap most, m (0 apart): what the tests hold to nothing passing through. */
export function overlap(a: ShipPose, b: ShipPose): number {
  return contacts(a, b).reduce((most, c) => Math.max(most, c.depth), 0);
}

/** The least distance from a point to an outline's sides, m. */
function toSides(o: Outline, px: number, pz: number): number {
  let least = Infinity;
  for (let i = 0; i < o.n; i++) {
    const j = i + 1 === o.n ? 0 : i + 1, ex = o.x[j]! - o.x[i]!, ez = o.z[j]! - o.z[i]!, dx = px - o.x[i]!, dz = pz - o.z[i]!;
    const t = Math.min(1, Math.max(0, (dx * ex + dz * ez) / (ex * ex + ez * ez || 1))), qx = dx - t * ex, qz = dz - t * ez;
    least = Math.min(least, qx * qx + qz * qz);
  }
  return Math.sqrt(least);
}

/**
 * How far apart two ships' hulls lie at the height they come closest (waterline, wales or the top of the side), m; 0
 * when they overlap. Two hulls lying together, grinding, are a few centimetres apart or less (the sound of it, the
 * tests).
 */
export function hullGap(a: ShipPose, b: ShipPose): number {
  const s = touchShape();
  let least = Infinity;
  s.rings.forEach((ring, k) => {
    const oa = placeOutline(ring, a, slot(`a${k}`, ring)), ob = placeOutline(ring, b, slot(`b${k}`, ring));
    for (let i = 0; i < oa.n; i++) least = Math.min(least, toSides(ob, oa.x[i]!, oa.z[i]!));
    for (let i = 0; i < ob.n; i++) least = Math.min(least, toSides(oa, ob.x[i]!, ob.z[i]!));
  });
  return overlap(a, b) > 0 ? 0 : least;
}
