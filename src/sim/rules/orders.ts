/**
 * The orders' rules (implementation plan N3.4; docs/ARCHITECTURE.md: rules as data): how long each order takes to be
 * carried out until the crew exists, and the few judgements the master and the first lieutenant make. Pure.
 *
 * **Until the crew exists (N4) each order takes its time from this table.** N4.1 replaces the times with the men's
 * work: the hands an order needs, how far they go, what else they are doing. The times are tuned for pace, like the
 * sailing model (fun before realism, nauta-plan.md), not measured on a real brig.
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

/** From the order to the helm put over, s: the master hears it and gives it to the helmsman. */
export const HELM_SECONDS = 2;
/** From "Ready about!" to "Helm's a-lee!", s: the hands go to the braces and sheets before she is put about. */
export const TACK_SECONDS = 6;
/** From "Ready to wear ship!" to the helm put up, s. */
export const WEAR_SECONDS = 4;
/** One mast's yards laid aback or filled, s: the hands go to the braces and swing the yards round. */
export const BRACE_SECONDS = 12;
/** From a sail order to the first sail moving, s: the hands go to their stations and aloft. */
export const SAIL_START_SECONDS = 4;

/**
 * Setting or taking in one sail, s, by its rules/rig.ts id. The sails on one mast are worked one after another, the
 * masts, the headsails and the after sails side by side (orders.ts `sailGang`), so plain sail from battle sail takes
 * about 30 s and all sail from bare poles about a minute and a half. Square sails take longest (men aloft, clewlines,
 * sheets and halliards), the boom sail is brailed or let go quickly, a headsail is run up its stay quickest.
 */
export const SAIL_SECONDS: Readonly<Record<string, number>> = {
  'fore-course': 14, 'main-course': 14, 'fore-topsail': 20, 'main-topsail': 20, 'fore-topgallant': 14, 'main-topgallant': 14,
  'boom-sail': 8, 'fore-topmast-staysail': 6, 'jib': 6, 'flying-jib': 6, 'main-staysail': 6, 'main-topmast-staysail': 6,
};

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
