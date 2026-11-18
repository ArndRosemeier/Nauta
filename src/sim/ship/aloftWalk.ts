/**
 * The captain aloft (pure, implementation plan N3.11): where he may stand on the rig's surfaces (the tops, the
 * crosstrees, the bowsprit) and which of the rig's ways (sim/ship/aloft.ts, the same walk graph the crew's routes
 * use) he is offered as he walks into it: the shrouds from her deck, up or down from a top or the crosstrees, onto
 * the bowsprit and off it, out onto the jib-boom. How a way is climbed is app/captain.ts's, with @futuremagic/figure.
 *
 * Ship space (section.ts): x across her (+ starboard), y up from her load waterline, z aft. A surface's place is its id.
 */
import { standAt, stepDeckBody, type DeckGround, type DeckIntent, type Vec3 } from '@futuremagic/deck';
import type { Ladder } from '@futuremagic/figure/ladder';
import { BOWSPRIT_STEP, CROSSTREES_TIMBERS, MAST_SPARS, type MastName } from '../rules/rig';
import {
  BOWSPRIT_REACH, LADDER_AIM, LADDER_PRESS, LOOK_UP, RIM_ALONG, RIM_KEEP, RIM_REACH, SHROUD_REACH, SPAR_END_REACH, SPAR_FOOTING,
} from '../rules/walking';
import { climbOn, type AloftSurface, type AloftWay, type MastClimb } from './aloft';
import { heelEase } from '../crew/route';
import { BODY } from '../rules/ships';
import { CAPTAIN_GAIT, pushOf, toAlong, type DeckWalker } from './deckWalk';
import type { Spot } from './plan';
import type { RigPlan } from './rig';
import { shipY, shipZ } from './section';
import { topHole } from './spars';

/** A way a mast's shrouds go: the lower shrouds and futtock shrouds (deck to top), the topmast shrouds and the crosstrees' futtock shrouds (top to crosstrees), the topgallant shrouds (from the crosstrees). */
export type Tier = 'lower' | 'upper' | 'topgallant';

/** One side of a mast's shrouds at one tier as he climbs them: the ladder at its foot, the one over the rim at its head (none: no surface there), and where he stands off it below and above. */
export interface Chain {
  readonly climb: MastClimb;
  readonly tier: Tier;
  readonly bottom: Ladder;
  readonly rim: Ladder | null;
  /** Where he stands at its foot: her deck by the rail, the top, the crosstrees. */
  readonly below: Spot;
  /** The surface over its rim, or null. */
  readonly above: string | null;
}

/** What he gets onto, pushing into it where he stands. */
export type AloftOffer =
  | { readonly to: 'chain'; readonly chain: Chain; readonly up: boolean }
  | { readonly to: 'bowsprit'; readonly side: 1 | -1; readonly along: number }
  | { readonly to: 'deck' | 'jib-boom'; readonly side: 1 | -1 };

const sideOf = (n: number): 1 | -1 => (n >= 0 ? 1 : -1);
const letter = (side: number) => (side > 0 ? 's' : 'p');

/** A way aloft by id. */
export function aloftWay(rig: RigPlan, id: string): AloftWay {
  const w = rig.ways.find((x) => x.id === id);
  if (!w) throw new Error(`no way aloft ${id}`);
  return w;
}

/** A surface aloft by id, or null (a space of her plan). */
export const surfaceOf = (rig: RigPlan, id: string): AloftSurface | null => rig.surfaces.find((s) => s.id === id) ?? null;

/** A mast's shrouds on a side at a tier, with where he stands off them (the rig's own ways' ends). */
export function chainOf(rig: RigPlan, mast: MastName, side: 1 | -1, tier: Tier): Chain {
  const climb = climbOn(rig.climbs, mast, side), s = letter(side);
  const lower = aloftWay(rig, `${mast}-shrouds-${s}`), upper = aloftWay(rig, `${mast}-topmast-shrouds-${s}`);
  if (tier === 'lower') return { climb, tier, bottom: climb.shroud, rim: climb.futtock, below: lower.from, above: lower.to.space };
  if (tier === 'upper') return { climb, tier, bottom: climb.topmast, rim: climb.crosstrees, below: upper.from, above: upper.to.space };
  return { climb, tier, bottom: climb.topgallant, rim: null, below: upper.to, above: null };
}

/** The height of a surface's floor at a place along it (ship space y): a top's or the crosstrees', or the bowsprit's top rising along it. */
function floorOn(surface: AloftSurface, along: number): number {
  const [a, b] = surface.points as [typeof surface.points[0], typeof surface.points[0]];
  if (surface.kind !== 'bowsprit') return shipY(a.height);
  return shipY(a.height + ((along - a.along) * (b.height - a.height)) / (b.along - a.along));
}

/** Along a surface from its points: its least and most along, its least and most across, its middle. */
function extent(surface: AloftSurface): { aft: number; fore: number; port: number; starboard: number; along: number } {
  const al = surface.points.map((p) => p.along), ac = surface.points.map((p) => p.across);
  const aft = Math.min(...al), fore = Math.max(...al);
  return { aft, fore, port: Math.min(...ac), starboard: Math.max(...ac), along: (aft + fore) / 2 };
}

/** Where he gets onto the bowsprit (m forward of the mainmast): beside its heel at the knightheads. */
const sparFrom = (surface: AloftSurface) => Math.min(BOWSPRIT_STEP.along, extent(surface).aft);

/** Whether his middle may be at (along, across) on a surface aloft. */
export function standsOn(rig: RigPlan, surface: AloftSurface, along: number, across: number): boolean {
  const e = extent(surface);
  if (surface.kind === 'bowsprit') return along >= sparFrom(surface) && along <= e.fore && Math.abs(across) <= SPAR_FOOTING;
  if (surface.kind === 'top') {
    const half = topHole(mastOf(surface)) / 2 + RIM_KEEP;
    const inside = along >= e.aft + RIM_KEEP && along <= e.fore - RIM_KEEP && across >= e.port + RIM_KEEP && across <= e.starboard - RIM_KEEP;
    return inside && !(Math.abs(along - mastAlong(rig, surface)) < half && Math.abs(across) < half);
  }
  if (surface.kind === 'crosstrees') {
    // Astride the two timbers, clear of the topmast between them.
    const mast = MAST_SPARS[mastOf(surface)].topmast.diameter / 2 + RIM_KEEP / 2;
    return Math.abs(along - e.along) <= CROSSTREES_TIMBERS.apart / 2 && Math.abs(across) <= e.starboard - RIM_KEEP && Math.abs(across) >= mast;
  }
  return false;
}

const mastOf = (surface: AloftSurface): MastName => (surface.id.startsWith('fore') ? 'fore' : 'main');
/** A top's mast through its hole, m forward of the mainmast. */
function mastAlong(rig: RigPlan, top: AloftSurface): number {
  const g = rig.masts[mastOf(top)];
  return g.lowerAt(top.points[0]!.height);
}

/** Where on a surface aloft he may stand, as the walker asks (sim/ship/deckWalk.ts: the same walking, another ground). */
export function aloftGround(rig: RigPlan, surface: AloftSurface): DeckGround<string> {
  return {
    stand(x, z) {
      const along = toAlong(z), across = x;
      return standsOn(rig, surface, along, across) ? { place: surface.id, floor: floorOn(surface, along) } : null;
    },
  };
}

/** The floor he stands on at a spot of a surface aloft (ship space y). */
export const floorAloft = (surface: AloftSurface, along: number): number => floorOn(surface, along);

/** Whether he pushes into (ta, tc) (a unit way on her plan) standing, or stopped by it: not walking on past it. */
function pushesInto(w: DeckWalker, intent: DeckIntent, ta: number, tc: number): boolean {
  const p = pushOf(intent);
  if (p.push < LADDER_AIM / 2 || p.along * ta + p.across * tc < LADDER_AIM) return false;
  return -w.vz * p.along + w.vx * p.across <= LADDER_PRESS;
}

/**
 * The way aloft he gets onto, standing at `w` and pushing as `intent` says, looking up or down by `pitch` (rad, +
 * up): on her deck the shrouds by their place at the rail (outboard) or the bowsprit beside its heel (forward); on a
 * top or the crosstrees the shrouds over him (looking up) or down over the rim (outboard); on the bowsprit off it
 * aft, or out onto the jib-boom's footropes forward. Null: none.
 */
export function aloftOffered(rig: RigPlan, w: DeckWalker, intent: DeckIntent, pitch: number): AloftOffer | null {
  const along = toAlong(w.z), across = w.x, p = pushOf(intent);
  const surface = surfaceOf(rig, w.place);
  if (!surface) {
    for (const c of rig.climbs) {
      const way = aloftWay(rig, `${c.mast}-shrouds-${letter(c.side)}`), at = way.from;
      if (at.space === w.place && Math.hypot(along - at.along, across - at.across) <= SHROUD_REACH && pushesInto(w, intent, 0, c.side)) {
        return { to: 'chain', chain: chainOf(rig, c.mast, c.side, 'lower'), up: true };
      }
    }
    // Beside the bowsprit by its heel, walking into it.
    const step = aloftWay(rig, 'bowsprit').from, side = sideOf(across);
    if (step.space === w.place && Math.abs(along - step.along) <= BOWSPRIT_REACH && Math.abs(across) <= Math.abs(step.across) + BOWSPRIT_REACH && pushesInto(w, intent, 0, -side)) {
      return { to: 'bowsprit', side, along };
    }
    return null;
  }
  if (surface.kind === 'bowsprit') {
    const e = extent(surface);
    if (along <= sparFrom(surface) + SPAR_END_REACH && pushesInto(w, intent, -1, 0)) return { to: 'deck', side: sideOf(p.across) };
    if (along >= e.fore - SPAR_END_REACH && pushesInto(w, intent, 1, 0)) return { to: 'jib-boom', side: sideOf(p.across) };
    return null;
  }
  if (surface.kind !== 'top' && surface.kind !== 'crosstrees') return null;
  const side = sideOf(across), e = extent(surface), edge = (side > 0 ? e.starboard : -e.port) - RIM_KEEP;
  if (Math.abs(across) < edge - RIM_REACH || !pushesInto(w, intent, 0, side)) return null;
  const mast = mastOf(surface), up = pitch >= LOOK_UP;
  const tier: Tier = surface.kind === 'top' ? (up ? 'upper' : 'lower') : (up ? 'topgallant' : 'upper');
  const chain = chainOf(rig, mast, side, tier), ladder = up ? chain.bottom : chain.rim!;
  // Beside the shrouds there, not at the far end of the rim.
  if (Math.abs(along - toAlong(ladder.z)) > RIM_ALONG) return null;
  return { to: 'chain', chain, up };
}

/** The bowsprit's spot on her deck beside its heel, on a side (and how far forward of the mainmast, m: by its heel). */
export function bowspritStep(side: number, along: number = BOWSPRIT_STEP.along): Spot {
  return { space: 'deck', along, across: side * Math.abs(BOWSPRIT_STEP.across) };
}

/** The point of a surface's floor at a spot (ship space). */
export function onSurface(surface: AloftSurface, along: number, across: number): [number, number, number] {
  return [across, floorOn(surface, along), shipZ(along)];
}

/** One step of his walking on a surface aloft as the thumbs say, slowed as she heels as a man across a top is (crew/route.ts `heelEase`). */
export function stepAloftWalker(rig: RigPlan, surface: AloftSurface, w: DeckWalker, intent: DeckIntent, dt: number, up: Vec3): DeckWalker {
  const pace = heelEase(surface.kind === 'bowsprit' ? 'spar' : 'aloft', 0, Math.acos(Math.min(1, up.y)));
  return stepDeckBody(w, { ...intent, forward: intent.forward * pace, strafe: intent.strafe * pace }, CAPTAIN_GAIT, aloftGround(rig, surface), dt);
}

/** A spot he may not stand on is moved to the nearest he may: tried on rings this far apart (m), this many rings, this many points round each. */
const SETTLE_STEP = 0.025;
const SETTLE_RINGS = 24;
const SETTLE_ROUND = 16;

/** The captain standing still on a surface aloft at a spot, or at the nearest spot of it he may stand on. */
export function walkerAloft(rig: RigPlan, surface: AloftSurface, along: number, across: number): DeckWalker {
  let a = along, c = across;
  search: for (let r = 0; r <= SETTLE_RINGS; r++) {
    for (let k = 0; k < (r ? SETTLE_ROUND : 1); k++) {
      const turn = (2 * Math.PI * k) / SETTLE_ROUND, ta = along + r * SETTLE_STEP * Math.cos(turn), tc = across + r * SETTLE_STEP * Math.sin(turn);
      if (standsOn(rig, surface, ta, tc)) { a = ta; c = tc; break search; }
    }
  }
  return standAt({ place: surface.id, floor: floorOn(surface, a) }, c, shipZ(a), BODY.height);
}
