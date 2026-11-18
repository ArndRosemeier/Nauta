/**
 * The orders' rules (implementation plan N3.4; docs/ARCHITECTURE.md: rules as data): the few judgements the master and
 * the first lieutenant make, and what heaving to comes to. Pure.
 *
 * How long an order takes is no longer here: since N4.1 it comes from the men (rules/crew.ts: the hands each job
 * needs, the work it takes, how the order travels down to them; crew/crew.ts: how far they go and who is free).
 */
import type { MastName } from './rig';
import { DEGREE, KNOT } from '../units';

/** A point of the compass, rad: "come up a point" and "bear away a point" turn her this far (32 points to the circle). */
export const POINT = 11.25 * DEGREE;

/**
 * Less way than this through the water, m/s, and she has no way on her: she will not answer her helm, so a tack or a
 * wear is refused ("She has no way on her, sir"). Above it a tack is a risk: from about a knot she misses stays.
 */
export const NO_WAY = 0.5 * KNOT;

/**
 * Full and by, the helmsman follows the wind as it shifts: when the heading close-hauled has moved this far, rad, he
 * is told the new one (finer than this is lost in the waves and her yaw).
 */
export const BY_FOLLOW = 1 * DEGREE;

/**
 * Heaving to (design decision for N3: "heave to" is one order and she stops within about a minute). The sails taken
 * in, by rules/rig.ts id: the courses hauled up, the boom sail brailed and the headsails and staysails hauled down, so
 * nothing drives her on but the topsails. The helm is put down (full and by), and both topsails are laid aback: her way comes off as fast as the canvas can take it (the main yards alone would leave
 * her forereaching for two or three minutes, N3.3). When her way is off the fore yards are filled again
 * (`HOVE_TO_CHECK`), and the crew works the main yards to keep her lying still (aback when she gathers headway, filled
 * when she gathers sternway). "Fill" sets her
 * canvas again as it was ordered and puts her full and by.
 */
export const HOVE_TO_IN: readonly string[] = ['fore-course', 'main-course', 'boom-sail', 'jib', 'flying-jib', 'fore-topmast-staysail', 'main-staysail', 'main-topmast-staysail'];
/** The mast whose yards lie aback while she is hove to. */
export const HOVE_TO_MAST: MastName = 'main';
/** The mast laid aback too until her way is off, to stop her, then filled again. */
export const HOVE_TO_CHECK: MastName = 'fore';
