/**
 * Where the killed are laid (pure, implementation plan N6.6, design ruling 2026-11-18): carried below by two men like the
 * badly wounded, but not to the surgeon: down to the main hold, each to a place of his own on a grid along its middle (the
 * hold is two metres of standable floor between the water casks), so the dead lie out of everyone's way and the deck is
 * cleared. A man's place depends on his place in the roster alone, so every machine carries him to the same spot.
 */
import type { Spot } from '../ship/plan';
import { DEAD_ROOM } from '../rules/crew';
import { nodeOfSpot, routeNetwork } from './network';

/** The places tried in the hold: so many along it, so many across, nearest the ladder first. */
const ALONG = 10;
const ACROSS = [0, -1, 1] as const;
const PLACES = ALONG * ACROSS.length;

/** The places of the hold a man may be laid, worked out once (those that can be stood on). */
let places: readonly Spot[] | null = null;
function laidPlaces(): readonly Spot[] {
  if (places) return places;
  const net = routeNetwork(), out: Spot[] = [];
  for (let k = 0; k < PLACES; k++) {
    const spot = { space: DEAD_ROOM.space, along: DEAD_ROOM.along + Math.floor(k / ACROSS.length) * DEAD_ROOM.step, across: ACROSS[k % ACROSS.length]! * DEAD_ROOM.step };
    if (nodeOfSpot(net, spot, []) >= 0) out.push(spot);
  }
  return (places = out);
}

/** Where man `man` (his place in the roster) is laid when he is killed and carried below. */
export function deadSpot(man: number): Spot {
  const list = laidPlaces();
  return list[man % list.length]!;
}
