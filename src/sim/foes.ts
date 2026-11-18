/**
 * Who a ship fights (docs/design/scenarios.md, stage 2): her enemies are the ships of every other side, and her foe, the
 * one "her" means to her master, her lookout and her gunner, is the nearest of them, or the one the captain told the gunner
 * to go for (`told.target`) while she stands. A ship that is lost (sunk, burnt,
 * blown up, struck) is no enemy while any other enemy stands; when none stands the lost are still the enemy, as the
 * duel's other ship is after the fight's end. Two ships of two sides are exactly the duel: the other ship, always. Pure.
 */
import { lostHow } from './end';
import type { ShipPose } from './ship/motion';
import type { SimShip } from './state';
import { apartOnWater } from './units';

/** The ships of every other side than ship `i`'s, nearest first, the standing before the lost only when none stands (see the file's head). `out`: which ships are lost now (`lostNow`), if the caller has it. */
export function enemiesOf(ships: readonly SimShip[], i: number, out: readonly boolean[] = lostNow(ships)): number[] {
  const me = ships[i];
  if (!me) return [];
  const all = ships.flatMap((s, k) => (s.side !== me.side ? [k] : []));
  const standing = all.filter((k) => !out[k]);
  const pose = me.motion.pose, range = (k: number) => apartOnWater(pose, ships[k]!.motion.pose);
  const ranked = (standing.length > 0 ? standing : all).sort((a, b) => range(a) - range(b) || a - b), wish = me.told.target;
  // The ship the captain told the gunner to go for comes first while she stands.
  return wish !== null && standing.includes(wish) ? [wish, ...ranked.filter((k) => k !== wish)] : ranked;
}

/** Which ships are lost now (end.ts `lostHow`). */
export const lostNow = (ships: readonly SimShip[]): boolean[] => ships.map((s) => lostHow(s) !== null);

/** Ship `i`'s foe: the nearest enemy, or null with none. */
export function foeOf(ships: readonly SimShip[], i: number, out?: readonly boolean[]): number | null {
  return enemiesOf(ships, i, out)[0] ?? null;
}

/** The poses of ship `i`'s enemies, nearest first. */
export function enemyPoses(ships: readonly SimShip[], i: number, out?: readonly boolean[]): ShipPose[] {
  return enemiesOf(ships, i, out).map((k) => ships[k]!.motion.pose);
}
