/**
 * How a ship's sails stand in a match's state, for the drawing (plan N3.10, render/ship/sailsView.ts): each sail's
 * standing in the true wind where she is (sailing.ts `sailsStanding`) and how her canvas is set. Pure.
 */
import { COLOURS } from '../sim/rules/end';
import { sailsStanding, type SailStanding } from '../sim/ship/sailing';
import type { SailSetting } from '../sim/ship/sails';
import { simTime, type SimState } from '../sim/state';
import { windAt } from '../sim/wind';
import { STEPS_PER_SECOND } from '../sim/units';

/** Her sails as the drawing reads them: their standing and her canvas (both in the rig plan's order). */
export interface SailsSeen {
  readonly standing: readonly SailStanding[];
  readonly canvas: readonly SailSetting[];
}

/** How ship `ship`'s sails stand in `state`, or null when there is no such ship. */
export function sailsSeen(state: SimState, ship: number): SailsSeen | null {
  const s = state.ships[ship];
  if (!s) return null;
  const pose = s.motion.pose;
  return { standing: sailsStanding(s.sailing, windAt(state.wind, pose.x, pose.z, simTime(state))), canvas: s.sailing.canvas };
}

/**
 * How far ship `ship`'s colours are hauled down, 0 (flying) to 1 (in hand on her deck) (plan N6.7): a ship that has struck
 * has them hauled down, from `COLOURS.after` s after the fight's end, over `COLOURS.down` s. One that was lost any other
 * way flies hers to the last.
 */
export function coloursHauled(state: SimState, ship: number): number {
  const end = state.fight.end;
  if (!end || end.lost[ship] !== 'struck') return 0;
  const since = (state.tick - end.tick) / STEPS_PER_SECOND - COLOURS.after;
  return Math.min(1, Math.max(0, since / COLOURS.down));
}
