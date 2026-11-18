/**
 * What a hand can take hold of where the captain stands (pure, implementation plan N2.7): on her weather deck the
 * rail along the top of her bulwark, below deck the beam over his head. His body takes hold in a heavy sea
 * (app/body.ts) and his drawn hand closes on the point given here.
 *
 * Ship space (section.ts): x across her (+ starboard), y up from her load waterline, z aft.
 */
import { BODY, BULWARK, DECK_BEAM } from '../rules/ships';
import { ARM_REACH, HOLD_HIGHEST, HOLD_LOWEST, LEAN_OUT, SHOULDER_SHARE } from '../rules/body';
import { sideTop } from './hull';
import { insideBreadth, overheadAt, spacesById, type ShipPlan, type Space } from './plan';
import { shipY, shipZ } from './section';
import type { RigPlan } from './rig';
import { climbOn } from './aloft';

/** A place a hand holds: the point (ship space) and what it is. */
export interface Handhold {
  readonly point: readonly [number, number, number];
  /** A rail (the hand rests on it), a beam (it hangs from it) or a rope of the rig (it closes round it). */
  readonly kind: 'rail' | 'beam' | 'rope';
}

/** The places of her a hand could hold near a spot of the plan (along, across), standing on a floor at height `floor` (ship space). */
function candidates(space: Space, along: number, across: number): Handhold[] {
  if (space.level === 'weather') {
    // The inboard edge of her rail, on the side he is nearer, level with him.
    const side = across >= 0 ? 1 : -1, top = sideTop(along);
    return [{ point: [side * insideBreadth(along, top), shipY(top + BULWARK.railThick), shipZ(along)], kind: 'rail' }];
  }
  // The beam overhead nearest him (her beams stand a beam's spacing apart, from her mainmast's station).
  const beam = Math.round(along / DECK_BEAM.spacing) * DECK_BEAM.spacing;
  return [{ point: [across, shipY(overheadAt(space, beam, across)), shipZ(beam)], kind: 'beam' }];
}

/** The rail he may lean out over (plan N2.11): its side (+1 starboard), the eye's place leaning out to the full (ship space), and his hold on it. */
export interface RailToLean {
  readonly side: number;
  readonly eye: readonly [number, number, number];
  readonly hold: Handhold;
}

/**
 * The rail he may lean out over standing at (along, across) in `space`, or null: on her weather deck, within
 * LEAN_OUT.within of the rail's inside. Leaning out to the full his eye is LEAN_OUT.reach outboard of it and
 * LEAN_OUT.overRail over its top.
 */
export function railToLean(plan: ShipPlan, spaceId: string, along: number, across: number): RailToLean | null {
  const space = spacesById(plan).get(spaceId);
  if (!space || space.level !== 'weather') return null;
  const side = across >= 0 ? 1 : -1, top = sideTop(along), inside = insideBreadth(along, top);
  if (inside <= 0 || inside - Math.abs(across) > LEAN_OUT.within) return null;
  const rail = top + BULWARK.railThick;
  return { side, eye: [side * (inside + LEAN_OUT.reach), shipY(rail + LEAN_OUT.overRail), shipZ(along)], hold: { point: [side * inside, shipY(rail), shipZ(along)], kind: 'rail' } };
}

/**
 * The hold within his reach standing at (along, across) in `space` on a floor at `floor` (ship space y), or null: a
 * hand from his shoulder reaches it, and it is neither too low to steady him nor too high to reach.
 */
export function handholdNear(plan: ShipPlan, spaceId: string, along: number, across: number, floor: number): Handhold | null {
  const space = spacesById(plan).get(spaceId);
  if (!space) return null;
  const shoulder = floor + SHOULDER_SHARE * BODY.height, z = shipZ(along);
  let best: Handhold | null = null, nearest = ARM_REACH;
  for (const h of candidates(space, along, across)) {
    const [x, y, hz] = h.point, over = y - floor;
    if (over < HOLD_LOWEST || over > HOLD_HIGHEST) continue;
    const reach = Math.hypot(x - across, y - shoulder, hz - z);
    if (reach <= nearest) { nearest = reach; best = h; }
  }
  return best;
}

/**
 * Aloft (N3.11): the shrouds over a top or the crosstrees within his reach standing at (along, across) on the surface
 * `surfaceId` on a floor at `floor` (ship space y): the topmast shrouds from a top, the topgallant shrouds from the
 * crosstrees, on the side he is nearer, where they pass his shoulder's height. Null: none in reach, or not aloft.
 */
export function handholdAloft(rig: RigPlan, surfaceId: string, along: number, across: number, floor: number): Handhold | null {
  const surface = rig.surfaces.find((s) => s.id === surfaceId);
  if (!surface || (surface.kind !== 'top' && surface.kind !== 'crosstrees')) return null;
  const mast = surface.id.startsWith('fore') ? 'fore' : 'main', side = across >= 0 ? 1 : -1;
  const climb = climbOn(rig.climbs, mast, side), l = surface.kind === 'top' ? climb.topmast : climb.topgallant;
  const shoulder = floor + SHOULDER_SHARE * BODY.height, rise = shoulder - l.floor, lean = l.lean ?? 0;
  const point: [number, number, number] = [l.x + l.nx * lean * rise, shoulder, l.z + l.nz * lean * rise];
  return Math.hypot(point[0] - across, point[2] - shipZ(along)) <= ARM_REACH ? { point, kind: 'rope' } : null;
}
