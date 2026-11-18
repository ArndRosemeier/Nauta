/**
 * Powder smoke as the gun captains see it (pure, implementation plan N7.5a, "the weather position must pay"; N5.5 draws
 * the smoke itself, apart from this): how thick it hangs about each ship, 0 clear to 1 thick, kept in the match
 * (`SimShip.smoke`, this file owns it). The wind carries both ships' smoke onto the one to leeward: the windward ship's
 * blows down across the water onto her, and her own, fired into the wind, blows back over her decks; the windward ship
 * fires down the wind and her smoke goes away from her. It clears as the wind carries it off, faster the harder it
 * blows. While it hangs it spoils her gun captains' aim (shot.ts `fireShot`, rules/guns.ts `SMOKE`).
 */
import { SMOKE } from '../rules/guns';
import { STEP_SECONDS } from '../units';

/** How far she lies to leeward of the other ship, 0 (abeam of the wind or to windward) to 1 (dead to leeward). */
export function leeOf(x: number, z: number, otherX: number, otherZ: number, windX: number, windZ: number): number {
  const dx = x - otherX, dz = z - otherZ, d = Math.hypot(dx, dz);
  return d > 0 ? Math.max(0, (dx * windX + dz * windZ) / d) : 0;
}

/** The smoke about her one step on: `was`, the guns fired this step by both ships, how far she lies to leeward (`leeOf`) and the wind's speed, m/s. */
export function smokeAfter(was: number, guns: number, lee: number, windSpeed: number): number {
  const cleared = was * Math.max(0, 1 - (windSpeed * STEP_SECONDS) / SMOKE.clears);
  return Math.min(1, cleared + guns * lee * SMOKE.gun);
}
