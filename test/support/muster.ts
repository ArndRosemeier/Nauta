/**
 * A crew already at quarters: the quarter bill's men stand at their posts, as they do once she has beaten to quarters
 * and they have run there. A match starts with them standing by at their home places (`Man.home`), so a test of the
 * guns or of what a shot does to the men starts from this.
 */
import { startCrew, type Crew } from '../../src/sim/crew/crew.ts';
import { brigRoster, placeSpot, type Man } from '../../src/sim/crew/roster.ts';
import type { SimState } from '../../src/sim/state.ts';

/** A crew with every man at his post. */
export const musterCrew = (roster: readonly Man[] = brigRoster()): Crew => ({
  ...startCrew(roster),
  men: roster.map((m) => ({ stands: m.home === m.post ? null : placeSpot(m.post), going: null, blocked: null })),
});

/** `state` with every ship's crew at quarters. */
export const mustered = (state: SimState): SimState => ({ ...state, ships: state.ships.map((s) => ({ ...s, crew: musterCrew() })) });
