/**
 * What a hand can take hold of where the captain stands (pure, implementation plan N2.7): on her weather deck the
 * rail along the top of her bulwark, below deck the beam over his head. His body takes hold in a heavy sea
 * (app/body.ts) and his drawn hand closes on the point given here.
 *
 * Ship space (section.ts): x across her (+ starboard), y up from her load waterline, z aft.
 */
import { BODY, BULWARK, DECK_BEAM } from '../rules/ships';
import { ARM_REACH, HOLD_HIGHEST, HOLD_LOWEST, SHOULDER_SHARE } from '../rules/body';
import { sideTop } from './hull';
import { insideBreadth, overheadAt, spacesById, type ShipPlan, type Space } from './plan';
import { shipY, shipZ } from './section';

/** A place a hand holds: the point (ship space) and what it is. */
export interface Handhold {
  readonly point: readonly [number, number, number];
  readonly kind: 'rail' | 'beam';
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
